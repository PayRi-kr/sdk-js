import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Payri,
  PayriApiError,
  PayriAuthError,
  PayriConnectionError,
  PayriRateLimitError,
  PayriError,
  type FetchLike,
} from '../src/index.js';

interface Call {
  url: string;
  init: RequestInit;
}

type Handler = (call: Call, index: number) => Response | Promise<Response>;

const LIVE_API_KEY = 'pyr_live_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZab';
const TEST_API_KEY = 'pyr_test_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZab';

function fakeFetch(handler: Handler = () => new Response('{}')): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { fetch, calls };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function bodyOf(call: Call): unknown {
  return call.init.body === undefined ? undefined : JSON.parse(String(call.init.body));
}

describe('Payri HTTP client', () => {
  afterEach(() => vi.useRealTimers());

  it('sends Bearer auth and blocks Authorization overrides', async () => {
    const { fetch, calls } = fakeFetch();
    const payri = new Payri({ apiKey: LIVE_API_KEY, fetch });
    await payri.request({
      method: 'GET',
      path: '/v1/test',
      headers: { authorization: 'Bearer attacker', 'X-Trace': 'trace_1' },
    });
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${LIVE_API_KEY}`);
    expect(headers.get('X-Trace')).toBe('trace_1');
  });

  it('adds a UUID idempotency key to POST and honors an explicit key across retries', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const { fetch, calls } = fakeFetch(() => ++attempt === 1
      ? jsonResponse({ message: 'retry' }, 503)
      : jsonResponse({ ok: true }));
    const payri = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 });
    const request = payri.orders.refund('ord/1', { amount: 5000 }, { idempotencyKey: 'client-key' });
    await vi.advanceTimersByTimeAsync(1000);
    await request;
    expect(calls).toHaveLength(2);
    const keys = calls.map((call) => new Headers(call.init.headers).get('Idempotency-Key'));
    expect(keys).toEqual(['client-key', 'client-key']);

    const { fetch: nextFetch, calls: nextCalls } = fakeFetch();
    await new Payri({ apiKey: TEST_API_KEY, fetch: nextFetch }).request({ method: 'POST', path: '/v1/x', body: {} });
    expect(new Headers(nextCalls[0]!.init.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it.each([
    ['503 response', () => jsonResponse({}, 503)],
    ['429 response', () => jsonResponse({}, 429)],
    ['network failure', () => { throw new Error('offline'); }],
  ])('retries GET after %s', async (_label, response) => {
    vi.useFakeTimers();
    let attempt = 0;
    const { fetch, calls } = fakeFetch(() => ++attempt === 1 ? response() : jsonResponse({ ok: true }));
    const request = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 }).orders.list();
    await vi.advanceTimersByTimeAsync(1000);
    await request;
    expect(calls).toHaveLength(2);
  });

  it('retries IDEMPOTENCY_IN_PROGRESS with the same key until it succeeds', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch((_, index) => index === 0
      ? jsonResponse({ code: 'IDEMPOTENCY_IN_PROGRESS' }, 409)
      : jsonResponse({ ok: true }));
    const request = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 })
      .orders.refund('ord_1', undefined, { idempotencyKey: 'shared-key' });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(request).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => new Headers(call.init.headers).get('Idempotency-Key')))
      .toEqual(['shared-key', 'shared-key']);
  });

  it('honors Retry-After for IDEMPOTENCY_IN_PROGRESS', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch((_, index) => index === 0
      ? jsonResponse({ code: 'IDEMPOTENCY_IN_PROGRESS' }, 409, { 'Retry-After': '2' })
      : jsonResponse({ ok: true }));
    const request = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 })
      .orders.refund('ord_1', undefined, { idempotencyKey: 'shared-key' });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('does not retry IDEMPOTENCY_IN_PROGRESS when Retry-After exceeds 60 seconds', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(
      { code: 'IDEMPOTENCY_IN_PROGRESS' }, 409, { 'Retry-After': '120' },
    ));
    const error = await new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 })
      .orders.refund('ord_1', undefined, { idempotencyKey: 'shared-key' })
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });
    expect(calls).toHaveLength(1);
  });

  it('does not retry an IDEMPOTENCY_KEY_CONFLICT response', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch(() => jsonResponse({ code: 'IDEMPOTENCY_KEY_CONFLICT' }, 409));
    const request = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 4 }).orders.refund('ord_1');
    await expect(request).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' });
    expect(calls).toHaveLength(1);
  });

  it('does not retry a 429 response when Retry-After exceeds 60 seconds', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ code: 'RATE_LIMITED' }, 429, { 'Retry-After': '120' }));
    const error = await new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 }).orders.list()
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PayriRateLimitError);
    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 120 });
    expect(calls).toHaveLength(1);
  });

  it('waits for a 30-second Retry-After before retrying a 429 response', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch((_, index) => index === 0
      ? jsonResponse({ code: 'RATE_LIMITED' }, 429, { 'Retry-After': '30' })
      : jsonResponse({ ok: true }));
    const request = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 1 }).orders.list();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('honors maxRetries 0', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({}, 500));
    await expect(new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 0 }).orders.list())
      .rejects.toBeInstanceOf(PayriApiError);
    expect(calls).toHaveLength(1);
  });

  it('maps API fields, request ID, details, and non-JSON fallback', async () => {
    const { fetch } = fakeFetch((_, index) => index === 0
      ? jsonResponse({ statusCode: 400, code: 'VALIDATION_FAILED', message: '입력 오류', details: { fields: [{ field: 'email', message: '필수' }] } }, 400, { 'X-Request-Id': 'req_1' })
      : new Response('upstream unavailable', { status: 502 }));
    const payri = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 0 });
    const validationError = await payri.orders.list().catch((error: unknown) => error);
    expect(validationError).toBeInstanceOf(PayriApiError);
    expect(validationError).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: [{ field: 'email', message: '필수' }] },
      requestId: 'req_1',
      status: 400,
      body: { statusCode: 400 },
    });
    const fallback = await payri.orders.list().catch((error: unknown) => error);
    expect(fallback).toMatchObject({ code: 'UNKNOWN_ERROR', details: null, body: 'upstream unavailable' });
    expect((fallback as Error).message).toBe('요청이 실패했습니다 (HTTP 502).');
  });

  it('maps 401 and 403 to PayriAuthError and 429 to PayriRateLimitError', async () => {
    const statuses = [401, 403, 429];
    const { fetch } = fakeFetch((_, index) => jsonResponse({ code: 'AUTH_FAILED', message: '권한 오류' }, statuses[index]!, { 'Retry-After': '7' }));
    const payri = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 0 });
    const unauthorized = await payri.orders.list().catch((error: unknown) => error);
    const forbidden = await payri.orders.list().catch((error: unknown) => error);
    const limited = await payri.orders.list().catch((error: unknown) => error);
    expect(unauthorized).toBeInstanceOf(PayriAuthError);
    expect(forbidden).toBeInstanceOf(PayriAuthError);
    expect(limited).toBeInstanceOf(PayriRateLimitError);
    expect(limited).toMatchObject({ status: 429, retryAfterSeconds: 7 });
  });

  it('calls onKeyDeprecated once when multiple responses include the header', async () => {
    const expiresAt = '2026-12-31T23:59:59.000Z';
    const onKeyDeprecated = vi.fn();
    const { fetch } = fakeFetch(() => jsonResponse({}, 200, { 'Payri-Key-Deprecated': expiresAt }));
    const payri = new Payri({ apiKey: TEST_API_KEY, fetch, onKeyDeprecated });

    await payri.request({ method: 'GET', path: '/v1/first' });
    await payri.request({ method: 'GET', path: '/v1/second' });

    expect(onKeyDeprecated).toHaveBeenCalledTimes(1);
    expect(onKeyDeprecated).toHaveBeenCalledWith(expiresAt);
  });

  it('calls onKeyDeprecated on an API error response', async () => {
    const expiresAt = '2026-12-31T23:59:59.000Z';
    const onKeyDeprecated = vi.fn();
    const { fetch } = fakeFetch(() => jsonResponse({ code: 'API_KEY_SCOPE_MISSING' }, 403, {
      'Payri-Key-Deprecated': expiresAt,
    }));
    const payri = new Payri({ apiKey: TEST_API_KEY, fetch, maxRetries: 0, onKeyDeprecated });

    await expect(payri.request({ method: 'GET', path: '/v1/private' })).rejects.toBeInstanceOf(PayriAuthError);
    expect(onKeyDeprecated).toHaveBeenCalledOnce();
    expect(onKeyDeprecated).toHaveBeenCalledWith(expiresAt);
  });

  it('ignores errors thrown by onKeyDeprecated', async () => {
    const onKeyDeprecated = vi.fn(() => { throw new Error('callback failed'); });
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }, 200, {
      'Payri-Key-Deprecated': '2026-12-31T23:59:59.000Z',
    }));
    const payri = new Payri({ apiKey: TEST_API_KEY, fetch, onKeyDeprecated });

    await expect(payri.request({ method: 'GET', path: '/v1/private' })).resolves.toEqual({ ok: true });
    expect(onKeyDeprecated).toHaveBeenCalledOnce();
  });

  it('converts an aborted timeout to PayriConnectionError', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch((call) => new Promise<Response>((_, reject) => {
      call.init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const request = new Payri({ apiKey: TEST_API_KEY, fetch, timeoutMs: 5, maxRetries: 0 }).orders.list();
    const rejected = expect(request).rejects.toBeInstanceOf(PayriConnectionError);
    await vi.advanceTimersByTimeAsync(5);
    await rejected;
    expect(calls).toHaveLength(1);
  });

  it('rejects malformed keys and guards browser use unless explicitly allowed', () => {
    expect(() => new Payri({ apiKey: 'invalid_key' })).toThrow(PayriError);
    expect(() => new Payri({ apiKey: 'pyr_unknown_key' })).toThrow(PayriError);
    expect(() => new Payri({ apiKey: 'pyr_live_short' })).toThrow(PayriError);
    expect(() => new Payri({ apiKey: 'pyr_test_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZa!' })).toThrow(PayriError);
    expect(() => new Payri({ apiKey: 'pyr_test_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZa!' }))
      .toThrow(/pyr_live_ 또는 pyr_test_/);

    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
    try {
      expect(() => new Payri({ apiKey: LIVE_API_KEY })).toThrow(/PayriLicensing/);
      expect(() => new Payri({ apiKey: LIVE_API_KEY, dangerouslyAllowBrowser: true })).not.toThrow();
    } finally {
      if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });

  it('uses the expected method, path, query, encoded IDs, and body for every resource method', async () => {
    const { fetch, calls } = fakeFetch();
    const payri = new Payri({ apiKey: TEST_API_KEY, baseUrl: 'https://api.example.test/', fetch });
    await payri.products.list({ status: 'active' });
    await payri.products.retrieve('prod/a');
    await payri.checkout.sessions.create({ productId: 'prod_1', planId: 'plan_1', interval: 'monthly' });
    await payri.checkout.sessions.retrieve('cs/a');
    await payri.orders.list({ page: 1, limit: 5, buyerEmail: 'a@b.test', status: 'paid', productId: 'prod_1', checkoutSessionId: 'cs_1', createdFrom: new Date('2026-01-01T00:00:00.000Z'), createdTo: new Date('2026-01-02T00:00:00.000Z') });
    await payri.orders.retrieve('ord/a');
    await payri.orders.refund('ord/a', { amount: 500, reason: 'reason' }, { idempotencyKey: 'refund-key' });
    await payri.subscriptions.list({ page: 2, limit: 10, buyerEmail: 'a@b.test', status: 'active', productId: 'prod_1' });
    await payri.subscriptions.retrieve('sub/a');
    await payri.subscriptions.cancelPreview('sub/a');
    await payri.subscriptions.cancel('sub/a', { timing: 'period_end', reason: 'requested' }, { idempotencyKey: 'cancel-key' });
    await payri.portalSessions.create({ subscriptionId: 'sub_1' }, { idempotencyKey: 'portal-key' });
    await payri.refundRequests.list({ orderId: 'ord_1' });
    await payri.refundRequests.retrieve('rr/a');
    await payri.refundRequests.approve('rr/a', { amount: 50, acknowledgeMismatch: true }, { idempotencyKey: 'approve-key' });
    await payri.refundRequests.reject('rr/a', { reason: 'no' }, { idempotencyKey: 'reject-key' });
    await payri.refundRequests.hold('rr/a', { type: 'disputed', reason: 'check' }, { idempotencyKey: 'hold-key' });
    await payri.licenses.list({ page: 1, limit: 20, key: 'lic-key', orderId: 'ord_1', buyerEmail: 'a@b.test', productId: 'prod_1', status: 'active' });
    await payri.licenses.retrieve('lic/a');

    expect(calls.map(({ init, url }) => `${init.method} ${url.replace('https://api.example.test', '')}`)).toEqual([
      'GET /v1/products?status=active',
      'GET /v1/products/prod%2Fa',
      'POST /v1/checkout/sessions',
      'GET /v1/checkout/sessions/cs%2Fa',
      'GET /v1/orders?page=1&limit=5&buyerEmail=a%40b.test&status=paid&productId=prod_1&checkoutSessionId=cs_1&createdFrom=2026-01-01T00%3A00%3A00.000Z&createdTo=2026-01-02T00%3A00%3A00.000Z',
      'GET /v1/orders/ord%2Fa',
      'POST /v1/orders/ord%2Fa/refund',
      'GET /v1/subscriptions?page=2&limit=10&buyerEmail=a%40b.test&status=active&productId=prod_1',
      'GET /v1/subscriptions/sub%2Fa',
      'GET /v1/subscriptions/sub%2Fa/cancel-preview',
      'POST /v1/subscriptions/sub%2Fa/cancel',
      'POST /v1/portal-sessions',
      'GET /v1/refund-requests?orderId=ord_1',
      'GET /v1/refund-requests/rr%2Fa',
      'POST /v1/refund-requests/rr%2Fa/approve',
      'POST /v1/refund-requests/rr%2Fa/reject',
      'POST /v1/refund-requests/rr%2Fa/hold',
      'GET /v1/licenses?page=1&limit=20&key=lic-key&orderId=ord_1&buyerEmail=a%40b.test&productId=prod_1&status=active',
      'GET /v1/licenses/lic%2Fa',
    ]);
    expect(bodyOf(calls[2]!)).toEqual({ productId: 'prod_1', planId: 'plan_1', interval: 'monthly' });
    expect(bodyOf(calls[6]!)).toEqual({ amount: 500, reason: 'reason' });
    expect(bodyOf(calls[10]!)).toEqual({ timing: 'period_end', reason: 'requested' });
    expect(bodyOf(calls[14]!)).toEqual({ amount: 50, acknowledgeMismatch: true });
    expect(bodyOf(calls[15]!)).toEqual({ reason: 'no' });
    expect(bodyOf(calls[16]!)).toEqual({ type: 'disputed', reason: 'check' });
    expect(calls.filter(({ init }) => init.method === 'POST').every(({ init }) => new Headers(init.headers).has('Idempotency-Key'))).toBe(true);
  });

  it('filters undefined query values', async () => {
    const { fetch, calls } = fakeFetch();
    await new Payri({ apiKey: LIVE_API_KEY, fetch }).products.list({ page: undefined, limit: 4 });
    expect(calls[0]!.url).toContain('?limit=4');
  });
});
