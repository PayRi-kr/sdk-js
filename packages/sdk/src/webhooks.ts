import { PayriError, PayriWebhookError } from './errors.js';
import { base64ToBytes, importSecret, signWebhook, timingSafeEqualBytes } from './internal/webhook-crypto.js';
import type { LicenseIssueEvent, LicenseIssueResponse, NonLicenseIssueEvent, PayriWebhookEvent } from './types/webhooks.js';

/** 기본 웹훅 타임스탬프 허용 오차입니다. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookSecret = string | Uint8Array;
export type WebhookHeaders = Record<string, string | string[] | undefined> | Headers;

export interface WebhookOptions {
  payload: string | Uint8Array;
  headers: WebhookHeaders;
  secret: WebhookSecret | WebhookSecret[];
  toleranceInSeconds?: number;
  nowSeconds?: number;
}

export interface HandleWebhookOptions extends WebhookOptions {
  onEvent?: (event: NonLicenseIssueEvent) => void | Promise<void>;
  onLicenseIssue?: (event: LicenseIssueEvent) => LicenseIssueResponse | Promise<LicenseIssueResponse>;
}

export interface WebhookHandlerOptions extends Omit<HandleWebhookOptions, 'payload' | 'headers'> {}

export interface WebhookHandlerResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Standard Webhooks 서명 검증과 이벤트 처리를 제공합니다. */
export class Webhooks {
  /** 웹훅 서명을 검증합니다. */
  static async verify(options: WebhookOptions): Promise<void> {
    const id = findHeader(options.headers, 'webhook-id');
    const timestamp = findHeader(options.headers, 'webhook-timestamp');
    const signature = findHeader(options.headers, 'webhook-signature');
    if (!id || !timestamp || !signature) throw new PayriWebhookError('MISSING_REQUIRED_HEADERS');

    verifyTimestamp(
      timestamp,
      options.toleranceInSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
      options.nowSeconds ?? Math.floor(Date.now() / 1000),
    );

    const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
    if (secrets.length === 0) throw new PayriWebhookError('INVALID_SECRET');
    const versionedSignatures = signature.trim().split(/\s+/);
    for (const secret of secrets) {
      const key = await importSecret(secret);
      const expected = await signWebhook(key, id, timestamp, options.payload);
      for (const versioned of versionedSignatures) {
        const comma = versioned.indexOf(',');
        if (comma < 0 || versioned.slice(0, comma) !== 'v1') continue;
        let candidate: Uint8Array;
        try {
          candidate = base64ToBytes(versioned.slice(comma + 1));
        } catch {
          continue;
        }
        if (timingSafeEqualBytes(candidate, expected)) return;
      }
    }
    throw new PayriWebhookError('NO_MATCHING_SIGNATURE');
  }

  /** 서명을 검증하고 이벤트 봉투를 반환합니다. */
  static async constructEvent(options: WebhookOptions): Promise<PayriWebhookEvent> {
    const payload = toText(options.payload);
    await Webhooks.verify(options);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new PayriWebhookError('INVALID_PAYLOAD');
    }
    if (!isValidEnvelope(parsed)) {
      throw new PayriWebhookError('INVALID_PAYLOAD');
    }
    return parsed;
  }

  /** 서명 검증 후 이벤트를 처리하고 HTTP 응답을 반환합니다. */
  static async handle(options: HandleWebhookOptions): Promise<WebhookHandlerResult> {
    let event: PayriWebhookEvent;
    try {
      event = await Webhooks.constructEvent(options);
    } catch (error) {
      if (error instanceof PayriWebhookError) {
        return jsonResult(400, { error: error.reason });
      }
      throw error;
    }

    if (event.type === 'license.issue') {
      if (!options.onLicenseIssue) throw new PayriError('license.issue 이벤트를 처리할 onLicenseIssue가 필요합니다.');
      const response = await options.onLicenseIssue(event);
      validateLicenseIssueResponse(response);
      return jsonResult(200, {
        key: response.key,
        ...(response.expiresAt !== undefined ? { expiresAt: response.expiresAt } : {}),
        ...(response.maxActivations !== undefined ? { maxActivations: response.maxActivations } : {}),
      });
    }

    await options.onEvent?.(event);
    return jsonResult(200, { received: true });
  }

  /** Fetch Request를 검증하고 Fetch Response를 반환하는 핸들러를 만듭니다. */
  static createHandler(options: WebhookHandlerOptions): (request: Request) => Promise<Response> {
    return async (request: Request): Promise<Response> => {
      const result = await Webhooks.handle({
        ...options,
        payload: await request.text(),
        headers: request.headers,
      });
      return new Response(result.body, { status: result.status, headers: result.headers });
    };
  }
}

function validateLicenseIssueResponse(response: LicenseIssueResponse): void {
  if (typeof response?.key !== 'string' || response.key.length < 1 || response.key.length > 256) {
    throw new PayriError('라이선스 발급 key는 1자 이상 256자 이하여야 합니다.');
  }
  if (response.expiresAt !== undefined && response.expiresAt !== null && (typeof response.expiresAt !== 'string' || !Number.isFinite(Date.parse(response.expiresAt)))) {
    throw new PayriError('라이선스 expiresAt은 ISO 8601 날짜 문자열이어야 합니다. 생략하거나 null이면 요청 설정을 그대로 사용합니다.');
  }
  if (response.maxActivations !== undefined && response.maxActivations !== null && (!Number.isInteger(response.maxActivations) || response.maxActivations < 0)) {
    throw new PayriError('라이선스 maxActivations은 0 이상의 정수 또는 null이어야 합니다. null은 무제한이며 생략하면 상품 설정을 유지합니다.');
  }
}

function verifyTimestamp(timestamp: string, tolerance: number, now: number): void {
  if (!/^\d+$/.test(timestamp)) throw new PayriWebhookError('INVALID_SIGNATURE');
  const value = Number(timestamp);
  if (!Number.isSafeInteger(value)) throw new PayriWebhookError('INVALID_SIGNATURE');
  if (now - value > tolerance) throw new PayriWebhookError('TIMESTAMP_TOO_OLD');
  if (value - now > tolerance) throw new PayriWebhookError('TIMESTAMP_TOO_NEW');
}

function findHeader(headers: WebhookHeaders, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const target = name.toLowerCase();
  let found: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined) continue;
      if (found !== undefined) return undefined;
      found = item;
    }
  }
  return found;
}

function isValidEnvelope(value: unknown): value is PayriWebhookEvent {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return false;
  if (typeof value.createdAt !== 'string' || (value.mode !== 'live' && value.mode !== 'test')) return false;
  return value.data !== undefined;
}

function jsonResult(status: number, body: unknown): WebhookHandlerResult {
  return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(payload: string | Uint8Array): string {
  return typeof payload === 'string' ? payload : new TextDecoder('utf-8').decode(payload);
}
