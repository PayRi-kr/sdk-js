/** Standard Webhooks 서명용 HMAC-SHA256 (Web Crypto, Node 20+/브라우저/엣지 공용). */

import { PayriWebhookError } from '../errors.js';

const SECRET_PREFIX = 'whsec_';
const keyCache = new Map<string, CryptoKey>();

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto(globalThis.crypto.subtle)를 사용할 수 없는 런타임입니다.');
  }
  return c.subtle;
}

/** 시크릿(base64 문자열, `whsec_` 접두사 허용 또는 raw bytes)으로부터 HMAC 키를 만든다. */
export async function importSecret(secret: string | Uint8Array): Promise<CryptoKey> {
  const cacheKey = typeof secret === 'string' ? secret : `bytes:${secret.join(',')}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  let raw: Uint8Array;
  if (secret instanceof Uint8Array) {
    raw = secret;
  } else if (typeof secret === 'string') {
    const b64 = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
    try {
      raw = base64ToBytes(b64);
    } catch {
      throw new PayriWebhookError('INVALID_SECRET');
    }
  } else {
    throw new PayriWebhookError('INVALID_SECRET');
  }
  if (raw.length === 0) throw new PayriWebhookError('INVALID_SECRET');

  // ArrayBuffer-backed 복사본으로 전달 (TS typed-array 제네릭 호환).
  const keyData = new Uint8Array(raw.byteLength);
  keyData.set(raw);
  const key = await getSubtle().importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  keyCache.set(cacheKey, key);
  return key;
}

/** Standard Webhooks 서명 대상: `${id}.${timestamp}.${payload}`. */
export async function signWebhook(
  key: CryptoKey,
  id: string,
  timestamp: string,
  payload: string | Uint8Array,
): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const payloadBytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const data = new Uint8Array(prefix.length + payloadBytes.length);
  data.set(prefix);
  data.set(payloadBytes, prefix.length);
  const sig = await getSubtle().sign('HMAC', key, data);
  return new Uint8Array(sig);
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
