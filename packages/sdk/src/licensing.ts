import { PayriError, PayriLicenseSignatureError } from './errors.js';
import { DEFAULT_BASE_URL } from './internal/constants.js';
import { HttpClient } from './internal/http-client.js';
import { LICENSE_SIGNING_KEYS } from './internal/license-signing-keys.js';
import type { FetchLike } from './internal/runtime.js';
import type { components } from './generated/v1.js';
import type { LicenseCheckResult } from './types/licenses.js';

const ED25519_SPKI_PREFIX = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);

/** PayriLicensing 앱 클라이언트 설정입니다. */
export interface PayriLicensingOptions {
  productId: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  /** raw 32바이트 또는 SPKI DER 공개 키의 base64 값입니다. */
  publicKeys?: Record<string, string>;
}

/** 라이선스 검증 요청에서 앱이 전달하는 필드입니다. */
export type VerifyLicenseParams = Omit<components['schemas']['V1LicenseVerifyRequestDto'], 'productId' | 'nonce'>;

/** 라이선스 활성화 요청에서 앱이 전달하는 필드입니다. */
export type ActivateLicenseParams = Omit<components['schemas']['V1LicenseActivateRequestDto'], 'productId' | 'nonce'>;

/** 라이선스 해제 요청에서 앱이 전달하는 필드입니다. */
export type DeactivateLicenseParams = Omit<components['schemas']['V1LicenseDeactivateRequestDto'], 'productId' | 'nonce'>;

/** 라이선스 API 응답의 Ed25519 서명을 검증하는 앱 클라이언트입니다. */
export class PayriLicensing {
  private readonly productId: string;
  private readonly http: HttpClient;
  private readonly publicKeys: Record<string, string>;
  private readonly importedKeys = new Map<string, CryptoKey>();

  constructor(options: PayriLicensingOptions) {
    if (!options.productId) throw new PayriError('productId가 필요합니다.');
    this.productId = options.productId;
    this.publicKeys = { ...LICENSE_SIGNING_KEYS, ...options.publicKeys };
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries ?? 2,
      autoIdempotencyKey: false,
    });
  }

  /** 라이선스 키를 검증하며, 없는 키는 'not_found' 상태를 반환합니다. */
  verify(params: VerifyLicenseParams): Promise<LicenseCheckResult> {
    return this.call('/v1/licenses/verify', {
      productId: this.productId,
      key: params.key,
      ...(params.activationId !== undefined ? { activationId: params.activationId } : {}),
      nonce: createNonce(),
    }, true);
  }

  /** 라이선스 키를 활성화하며, 없는 키는 'not_found' 상태를 반환합니다. */
  activate(params: ActivateLicenseParams): Promise<LicenseCheckResult> {
    return this.call('/v1/licenses/activate', {
      productId: this.productId,
      key: params.key,
      ...(params.label !== undefined ? { label: params.label } : {}),
      nonce: createNonce(),
    }, false);
  }

  /** 라이선스 활성화를 해제하며, 없는 키는 'not_found' 상태를 반환합니다. */
  deactivate(params: DeactivateLicenseParams): Promise<LicenseCheckResult> {
    return this.call('/v1/licenses/deactivate', {
      productId: this.productId,
      key: params.key,
      activationId: params.activationId,
      nonce: createNonce(),
    }, true);
  }

  private async call(path: string, body: Record<string, string>, retryable: boolean): Promise<LicenseCheckResult> {
    const raw = await this.http.requestRaw({ method: 'POST', path, body }, { retryable });
    const signatureHeader = raw.headers.get('Payri-Signature');
    const signature = parseSignatureHeader(signatureHeader);
    if (!signature) throw new PayriLicenseSignatureError('MISSING_SIGNATURE');
    const publicKey = this.publicKeys[signature.kid];
    if (publicKey === undefined) throw new PayriLicenseSignatureError('UNKNOWN_KEY_ID');

    let validSignature: boolean;
    try {
      const signatureBytes = decodeBase64(signature.signature);
      let key = this.importedKeys.get(signature.kid);
      if (key === undefined) {
        const keyBytes = toRawEd25519Key(decodeBase64(publicKey));
        key = await globalThis.crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'Ed25519' }, false, ['verify']);
        this.importedKeys.set(signature.kid, key);
      }
      validSignature = await globalThis.crypto.subtle.verify(
        { name: 'Ed25519' },
        key,
        toArrayBuffer(signatureBytes),
        new TextEncoder().encode(raw.text),
      );
    } catch {
      throw new PayriLicenseSignatureError('INVALID_SIGNATURE');
    }
    if (!validSignature) throw new PayriLicenseSignatureError('INVALID_SIGNATURE');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.text);
    } catch {
      throw new PayriLicenseSignatureError('INVALID_RESPONSE');
    }
    if (!isRecord(parsed)) throw new PayriLicenseSignatureError('INVALID_RESPONSE');
    if (parsed.nonce !== body.nonce) throw new PayriLicenseSignatureError('NONCE_MISMATCH');
    const issuedAt = typeof parsed.issuedAt === 'string' ? Date.parse(parsed.issuedAt) : Number.NaN;
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 300_000) {
      throw new PayriLicenseSignatureError('RESPONSE_EXPIRED');
    }
    return parsed as unknown as LicenseCheckResult;
  }
}

function createNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseSignatureHeader(value: string | null): { kid: string; signature: string } | null {
  if (value === null) return null;
  const values: Record<string, string> = {};
  for (const part of value.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) return null;
    const key = part.slice(0, separator).trim();
    const item = part.slice(separator + 1).trim();
    if (!key || !item || values[key] !== undefined) return null;
    values[key] = item;
  }
  if (!values.kid || !values.ed25519 || Object.keys(values).length !== 2) return null;
  return { kid: values.kid, signature: values.ed25519 };
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) throw new Error('Invalid base64');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toRawEd25519Key(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 32) return bytes;
  if (bytes.length === 44 && ED25519_SPKI_PREFIX.every((byte, index) => bytes[index] === byte)) {
    return bytes.subarray(ED25519_SPKI_PREFIX.length);
  }
  throw new Error('Invalid Ed25519 public key format');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
