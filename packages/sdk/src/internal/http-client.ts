import {
  PayriApiError,
  PayriAuthError,
  PayriConnectionError,
  PayriRateLimitError,
  type PayriErrorCode,
} from '../errors.js';
import { resolveFetch, type FetchLike } from './runtime.js';
import type { QueryValue } from '../types/common.js';

export interface HttpClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  autoIdempotencyKey?: boolean;
  onKeyDeprecated?: (expiresAt: string) => void;
}

/** Payri.request()에 전달하는 요청 옵션입니다. */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

/** POST 메서드의 멱등성 키 옵션입니다. */
export interface PostRequestOptions {
  idempotencyKey?: string;
}

export interface RawHttpResponse {
  status: number;
  headers: Headers;
  text: string;
}

export interface RawRequestOptions {
  retryable?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly autoIdempotencyKey: boolean;
  private readonly onKeyDeprecated: ((expiresAt: string) => void) | undefined;
  private keyDeprecatedNotified = false;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = resolveFetch(options.fetch);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, options.maxRetries ?? 0);
    this.autoIdempotencyKey = options.autoIdempotencyKey ?? options.apiKey !== undefined;
    this.onKeyDeprecated = options.onKeyDeprecated;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const response = await this.requestRaw(options);
    return (response.text ? safeJsonParse(response.text) : undefined) as T;
  }

  async requestRaw(options: RequestOptions, rawOptions: RawRequestOptions = {}): Promise<RawHttpResponse> {
    const url = this.buildUrl(options.path, options.query);
    const idempotencyKey = options.method === 'POST'
      ? options.idempotencyKey ?? (this.autoIdempotencyKey ? globalThis.crypto.randomUUID() : undefined)
      : undefined;
    const headers = this.buildHeaders(options, idempotencyKey);
    const init: RequestInit = {
      method: options.method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    };
    const retryable = rawOptions.retryable ?? (options.method === 'GET' || idempotencyKey !== undefined);

    for (let attempt = 0; ; attempt += 1) {
      let response: RawHttpResponse;
      try {
        response = await this.send(url, init);
      } catch (error) {
        if (!(error instanceof PayriConnectionError) || !retryable || attempt >= this.maxRetries) throw error;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        let responseCode: string | null = null;
        if (response.status === 409 && response.text) {
          const responseBody = safeJsonParse(response.text);
          responseCode = isRecord(responseBody) && typeof responseBody.code === 'string' ? responseBody.code : null;
        }
        if (
          retryable
          && attempt < this.maxRetries
          && (
            RETRYABLE_STATUS.has(response.status)
            || (
              // 같은 키로 재요청하면 첫 요청에서 저장된 응답을 받을 수 있습니다.
              response.status === 409
              && responseCode === 'IDEMPOTENCY_IN_PROGRESS'
            )
          )
        ) {
          const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
          // IP 차단처럼 긴 대기를 60초씩 반복하면 앱이 최대 2분 멈추고 결국 실패할 수 있어 재시도를 중단합니다.
          if (retryAfter !== null && retryAfter > 60) throw toApiError(response);
          await sleep(retryAfter === null ? backoffMs(attempt) : retryAfter * 1000);
          continue;
        }
        throw toApiError(response);
      }
      return response;
    }
  }

  private buildHeaders(options: RequestOptions, idempotencyKey: string | undefined): Headers {
    const headers = new Headers({ Accept: 'application/json' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        const normalizedName = name.toLowerCase();
        if (normalizedName === 'authorization' || normalizedName === 'idempotency-key') {
          continue;
        }
        headers.set(name, value);
      }
    }
    if (this.apiKey !== undefined) headers.set('Authorization', `Bearer ${this.apiKey}`);
    if (idempotencyKey !== undefined) headers.set('Idempotency-Key', idempotencyKey);
    return headers;
  }

  private handleKeyDeprecated(headers: Headers): void {
    if (this.keyDeprecatedNotified || this.onKeyDeprecated === undefined) return;
    const expiresAt = headers.get('Payri-Key-Deprecated');
    if (expiresAt === null) return;
    this.keyDeprecatedNotified = true;
    try {
      this.onKeyDeprecated(expiresAt);
    } catch {}
  }

  private async send(url: string, init: RequestInit): Promise<RawHttpResponse> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new PayriConnectionError(`요청이 ${this.timeoutMs}ms 안에 완료되지 않았습니다.`));
      }, this.timeoutMs);
    });
    const operation = (async (): Promise<RawHttpResponse> => {
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        this.handleKeyDeprecated(response.headers);
        const text = await response.text();
        return { status: response.status, headers: response.headers, text };
      } catch (error) {
        if (error instanceof PayriConnectionError) throw error;
        if (timedOut) throw new PayriConnectionError(`요청이 ${this.timeoutMs}ms 안에 완료되지 않았습니다.`, error);
        throw new PayriConnectionError('네트워크 요청에 실패했습니다.', error);
      }
    })();
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, value instanceof Date ? value.toISOString() : String(value));
      }
    }
    return url.toString();
  }
}

function toApiError(response: RawHttpResponse): PayriApiError {
  const body = response.text ? safeJsonParse(response.text) : null;
  const record = isRecord(body) ? body : {};
  const code = typeof record.code === 'string' ? record.code as PayriErrorCode : 'UNKNOWN_ERROR';
  const message = typeof record.message === 'string'
    ? record.message
    : `요청이 실패했습니다 (HTTP ${response.status}).`;
  const options = {
    code,
    details: record.details ?? null,
    requestId: response.headers.get('X-Request-Id'),
    body,
  };
  if (response.status === 401 || response.status === 403) {
    return new PayriAuthError(response.status, message, options);
  }
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
    return new PayriRateLimitError(response.status, message, { ...options, retryAfterSeconds });
  }
  return new PayriApiError(response.status, message, options);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base + Math.floor(Math.random() * base * 0.25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
