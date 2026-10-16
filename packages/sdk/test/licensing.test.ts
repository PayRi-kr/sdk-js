import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PayriApiError,
  PayriLicenseSignatureError,
  PayriLicensing,
  PayriRateLimitError,
  type FetchLike,
} from '../src/index.js';
import { LICENSE_SIGNING_KEYS } from '../src/internal/license-signing-keys.js';

const KID = 'test-key';
let keyPair: CryptoKeyPair;
let publicKeyBase64: string;

interface Call {
  url: string;
  headers: Headers;
  responseHeaders: Headers;
  responseStatus: number;
  body: Record<string, unknown>;
}

interface MockOptions {
  status?: (index: number) => number;
  body?: (nonce: string, index: number) => Record<string, unknown>;
  errorBody?: (status: number, index: number) => Record<string, unknown>;
  errorHeaders?: (status: number, index: number) => HeadersInit;
  header?: (signature: string, index: number) => string | null;
  tamperAfterSign?: boolean;
}

describe('LICENSE_SIGNING_KEYS', () => {
  it('contains importable raw Ed25519 verification public keys', async () => {
    const entries = Object.entries(LICENSE_SIGNING_KEYS);
    expect(entries.length).toBeGreaterThan(0);

    for (const [, encoded] of entries) {
      const raw = Uint8Array.from(globalThis.atob(encoded), (character) => character.charCodeAt(0));
      expect(raw).toHaveLength(32);
      await globalThis.crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
    }
  });
});

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signatureFor(text: string): Promise<string> {
  const signature = await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode(text));
  return encodeBase64(new Uint8Array(signature));
}

function mockFetch(options: MockOptions = {}): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init = {}) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const index = calls.length;
    const status = options.status?.(index) ?? 200;
    const call = {
      url: String(input),
      headers: new Headers(init.headers),
      responseHeaders: new Headers(),
      responseStatus: status,
      body,
    };
    calls.push(call);
    const responseBody = options.body?.(String(body.nonce), index) ?? {
      status: 'active',
      expiresAt: null,
      maxActivations: 3,
      activationCount: 1,
      mode: 'test',
      activation: null,
      nonce: body.nonce,
      issuedAt: new Date().toISOString(),
    };
    const signedText = JSON.stringify(responseBody);
    let responseText = signedText;
    if (options.tamperAfterSign) {
      const indexOfStatus = responseText.indexOf('active');
      responseText = `${responseText.slice(0, indexOfStatus)}x${responseText.slice(indexOfStatus + 1)}`;
    }
    const signature = await signatureFor(signedText);
    const signatureHeader = options.header
      ? options.header(signature, index)
      : `kid=${KID}, ed25519=${signature}`;
    const responseHeaders = new Headers();
    if (status >= 200 && status < 300 && signatureHeader !== null) {
      responseHeaders.set('Payri-Signature', signatureHeader);
    } else if (options.errorHeaders) {
      new Headers(options.errorHeaders(status, index)).forEach((value, name) => responseHeaders.set(name, value));
    }
    call.responseHeaders = new Headers(responseHeaders);
    return new Response(status >= 200 && status < 300
      ? responseText
      : JSON.stringify(options.errorBody?.(status, index) ?? { code: 'API_ERROR', message: '요청 오류' }), {
      status,
      headers: responseHeaders,
    });
  };
  return { fetch, calls };
}

describe('PayriLicensing', () => {
  beforeAll(async () => {
    keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    publicKeyBase64 = encodeBase64(new Uint8Array(raw));
  });

  afterAll(() => vi.useRealTimers());

  function create(options: MockOptions = {}) {
    const mocked = mockFetch(options);
    const client = new PayriLicensing({
      productId: 'prod_1',
      baseUrl: 'https://api.example.test',
      fetch: mocked.fetch,
      publicKeys: { [KID]: publicKeyBase64 },
    });
    return { ...mocked, client };
  }

  it('validates signed responses and sends a fresh 32-byte lowercase hexadecimal nonce without auth or idempotency', async () => {
    const { client, calls } = create();
    const first = await client.verify({ key: 'license-key' });
    const second = await client.verify({ key: 'license-key', activationId: 'act_1' });
    expect(first).toMatchObject({ status: 'active', mode: 'test', activationCount: 1 });
    expect(second.status).toBe('active');
    const nonces = calls.map(({ body }) => String(body.nonce));
    expect(nonces[0]).not.toBe(nonces[1]);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(calls[0]!.body).toMatchObject({ productId: 'prod_1', key: 'license-key' });
    expect(calls[1]!.body.activationId).toBe('act_1');
    expect(calls.every(({ headers }) => !headers.has('Idempotency-Key') && !headers.has('Authorization'))).toBe(true);
    expect(calls.map(({ url }) => url)).toEqual([
      'https://api.example.test/v1/licenses/verify',
      'https://api.example.test/v1/licenses/verify',
    ]);
  });

  it('verifies signatures with a base64 SPKI DER Ed25519 public key', async () => {
    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const mocked = mockFetch();
    const client = new PayriLicensing({
      productId: 'prod_1',
      baseUrl: 'https://api.example.test',
      fetch: mocked.fetch,
      publicKeys: { [KID]: encodeBase64(new Uint8Array(spki)) },
    });
    await expect(client.verify({ key: 'license-key' })).resolves.toMatchObject({ status: 'active' });
  });

  it('classifies missing, unknown, and invalid signatures', async () => {
    const missing = create({ header: () => null });
    await expect(missing.client.verify({ key: 'x' })).rejects.toMatchObject({ reason: 'MISSING_SIGNATURE' });

    const unknown = create({ header: (signature) => `kid=unknown-key, ed25519=${signature}` });
    await expect(unknown.client.verify({ key: 'x' })).rejects.toMatchObject({ reason: 'UNKNOWN_KEY_ID' });

    const invalid = create({ tamperAfterSign: true });
    await expect(invalid.client.verify({ key: 'x' })).rejects.toBeInstanceOf(PayriLicenseSignatureError);
    await expect(invalid.client.verify({ key: 'x' })).rejects.toMatchObject({ reason: 'INVALID_SIGNATURE' });
  });

  it('checks nonce and issuedAt freshness after signature verification', async () => {
    const mismatch = create({ body: (nonce) => ({
      status: 'active', expiresAt: null, maxActivations: null, activationCount: 0,
      mode: 'test', activation: null, nonce: `${nonce}x`, issuedAt: new Date().toISOString(),
    }) });
    await expect(mismatch.client.verify({ key: 'x' })).rejects.toMatchObject({ reason: 'NONCE_MISMATCH' });

    for (const delta of [-6, 6]) {
      const expired = create({ body: (nonce) => ({
        status: 'active', expiresAt: null, maxActivations: null, activationCount: 0,
        mode: 'test', activation: null, nonce, issuedAt: new Date(Date.now() + delta * 60_000).toISOString(),
      }) });
      await expect(expired.client.verify({ key: 'x' })).rejects.toMatchObject({ reason: 'RESPONSE_EXPIRED' });
    }
  });

  it('retries verify with the same nonce but does not retry activate', async () => {
    vi.useRealTimers();
    const verify = create({ status: (index) => index === 0 ? 503 : 200 });
    const verifyPromise = verify.client.verify({ key: 'x' });
    await verifyPromise;
    expect(verify.calls).toHaveLength(2);
    expect(verify.calls[0]!.body.nonce).toBe(verify.calls[1]!.body.nonce);

    const activate = create({ status: () => 503 });
    await expect(activate.client.activate({ key: 'x', label: 'desktop' })).rejects.toBeInstanceOf(PayriApiError);
    expect(activate.calls).toHaveLength(1);
    expect(activate.calls[0]!.body).toMatchObject({ productId: 'prod_1', key: 'x', label: 'desktop' });
    expect(activate.calls[0]!.body.activationId).toBeUndefined();
  });

  it('retries LICENSE_RATE_LIMITED after Retry-After with the same nonce', async () => {
    const { client, calls } = create({
      status: (index) => index === 0 ? 429 : 200,
      errorBody: () => ({ code: 'LICENSE_RATE_LIMITED', message: '요청 제한' }),
      errorHeaders: () => ({ 'Retry-After': '1' }),
    });
    const result = await client.verify({ key: 'x' });
    expect(result.status).toBe('active');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body.nonce).toBe(calls[1]!.body.nonce);
  });

  it('returns a signed 200 response with not_found for an unknown license key', async () => {
    const { client, calls } = create({ body: (nonce) => ({
      status: 'not_found', expiresAt: null, maxActivations: null, activationCount: 0,
      mode: 'test', activation: null, nonce, issuedAt: new Date().toISOString(),
    }) });
    const result = await client.verify({ key: 'missing' });
    expect(result.status).toBe('not_found');
    expect(calls[0]!.responseStatus).toBe(200);
    expect(result.nonce).toBe(calls[0]!.body.nonce);
    expect(calls[0]!.responseHeaders.has('Payri-Signature')).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('returns a 400 VALIDATION_FAILED error without signature verification', async () => {
    const { client, calls } = create({
      status: () => 400,
      errorBody: () => ({
        code: 'VALIDATION_FAILED',
        message: '입력 오류',
        details: { fields: [{ field: 'key', message: '필수입니다.' }] },
      }),
    });
    const error = await client.verify({ key: '' }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PayriApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: { fields: [{ field: 'key', message: '필수입니다.' }] },
    });
    expect(calls[0]!.responseHeaders.has('Payri-Signature')).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('does not retry LICENSE_LOOKUP_BLOCKED when Retry-After exceeds 60 seconds', async () => {
    const { client, calls } = create({
      status: () => 429,
      errorBody: () => ({ code: 'LICENSE_LOOKUP_BLOCKED', message: '잠시 후 다시 시도해주세요.' }),
      errorHeaders: () => ({ 'Retry-After': '900' }),
    });
    const error = await client.verify({ key: 'missing' }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PayriRateLimitError);
    expect(error).toMatchObject({ code: 'LICENSE_LOOKUP_BLOCKED', retryAfterSeconds: 900 });
    expect(calls).toHaveLength(1);
  });

  it('requires productId', () => {
    expect(() => new PayriLicensing({ productId: '' })).toThrow('productId가 필요합니다.');
  });
});
