import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Payri,
  PayriLicensing,
  Webhooks,
  type FetchLike,
  type VerifyLicenseParams,
  type ActivateLicenseParams,
  type DeactivateLicenseParams,
  type CreateCheckoutSessionParams,
  type RefundOrderParams,
  type CancelSubscriptionParams,
  type CreatePortalSessionParams,
  type RefundRequestApproveParams,
  type RefundRequestRejectParams,
  type RefundRequestHoldParams,
  type ApiErrorDetails,
  type ValidationErrorDetails,
  type ScopeMissingErrorDetails,
  type RefundRequestWarningCode,
  type SubscriptionCancelBlockedReason,
} from '../src/index.js';

type JsonRecord = Record<string, unknown>;

interface RequestExample {
  method: string;
  url: string;
  body?: JsonRecord;
  headers?: Record<string, string>;
}

interface SpecOperation {
  operationId?: string;
  'x-payri-idempotent'?: boolean;
  'x-payri-request-example'?: RequestExample;
  'x-payri-scope'?: string[];
  parameters?: Array<{ in?: string; name?: string }>;
  requestBody?: {
    content?: Record<string, {
      example?: unknown;
      examples?: Record<string, { value?: unknown }>;
    }>;
  };
}

interface OpenApiSpec {
  paths: Record<string, Record<string, SpecOperation>>;
  webhooks: Record<string, { post?: SpecOperation }>;
  'x-payri-error-catalog': Record<string, unknown>;
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: JsonRecord | undefined;
}

interface CallContext {
  payri: Payri;
  calls: CapturedRequest[];
  example: RequestExample;
  url: URL;
  body: JsonRecord;
  idempotencyKey?: string;
}

type SdkCall = (context: CallContext) => Promise<unknown>;

const spec = JSON.parse(readFileSync(new URL('../openapi/v1.json', import.meta.url), 'utf8')) as OpenApiSpec;
const API_KEY = `pyr_test_${'a'.repeat(38)}`;
const SIGNING_KID = 'contract-test-key';
const WEBHOOK_SECRET_BYTES = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
const WEBHOOK_SECRET = `whsec_${encodeBase64(WEBHOOK_SECRET_BYTES)}`;
const SIGNED_AT = Math.floor(Date.now() / 1000);

let licenseSigningKeyPair: CryptoKeyPair;
let licensePublicKey: string;

function pathId(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const index = segments.findIndex((segment) => ['sessions', 'orders', 'subscriptions', 'refund-requests', 'products', 'licenses'].includes(segment));
  return segments[index + 1] ?? '';
}

function queryParams(url: URL): JsonRecord {
  return Object.fromEntries(url.searchParams.entries());
}

function bodyWithoutNonce(body: JsonRecord | undefined): JsonRecord | undefined {
  if (body === undefined) return undefined;
  const { nonce: _nonce, ...rest } = body;
  return rest;
}

function createFetch(calls: CapturedRequest[]): FetchLike {
  return async (input, init = {}) => {
    const url = String(input);
    const requestBody = typeof init.body === 'string' ? JSON.parse(init.body) as JsonRecord : undefined;
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: requestBody,
    });

    const isLicenseAppCall = new URL(url).pathname.startsWith('/v1/licenses/')
      && ['/v1/licenses/verify', '/v1/licenses/activate', '/v1/licenses/deactivate'].includes(new URL(url).pathname);
    if (isLicenseAppCall) {
      const responseBody = {
        status: 'active',
        expiresAt: null,
        maxActivations: null,
        activationCount: 0,
        mode: 'test',
        activation: null,
        nonce: requestBody?.nonce,
        issuedAt: new Date().toISOString(),
      };
      const responseText = JSON.stringify(responseBody);
      const signature = await crypto.subtle.sign(
        'Ed25519',
        licenseSigningKeyPair.privateKey,
        new TextEncoder().encode(responseText),
      );
      return new Response(responseText, {
        status: 200,
        headers: { 'Payri-Signature': `kid=${SIGNING_KID}, ed25519=${encodeBase64(new Uint8Array(signature))}` },
      });
    }

    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

function createPayri(baseUrl: string, calls: CapturedRequest[]): Payri {
  return new Payri({ apiKey: API_KEY, baseUrl, fetch: createFetch(calls), maxRetries: 0 });
}

function createLicensing(baseUrl: string, productId: string, calls: CapturedRequest[]): PayriLicensing {
  return new PayriLicensing({
    productId,
    baseUrl,
    fetch: createFetch(calls),
    maxRetries: 0,
    publicKeys: { [SIGNING_KID]: licensePublicKey },
  });
}

function operationEntries(): Array<[string, string, SpecOperation]> {
  return Object.entries(spec.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).flatMap(([, operation]) => operation.operationId
      ? [[operation.operationId, path, operation] as [string, string, SpecOperation]]
      : []));
}

function operationFor(operationId: string): { path: string; operation: SpecOperation } {
  const found = operationEntries().find(([id]) => id === operationId);
  if (found === undefined) throw new Error(`OpenAPI operation ${operationId} was not found.`);
  return { path: found[1], operation: found[2] };
}

function callContext(
  example: RequestExample,
  calls: CapturedRequest[],
  idempotencyKey?: string,
): CallContext {
  const url = new URL(example.url);
  const body = example.body ?? {};
  return {
    payri: createPayri(url.origin, calls),
    calls,
    example,
    url,
    body,
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
}

const sdkCalls: Record<string, SdkCall> = {
  CheckoutV1Controller_create: ({ payri, body, idempotencyKey }) =>
    payri.checkout.sessions.create(body as unknown as CreateCheckoutSessionParams, postOptions(idempotencyKey)),
  CheckoutV1Controller_get: ({ payri, url }) => payri.checkout.sessions.retrieve(pathId(url)),
  LicenseV1Controller_list: ({ payri, url }) => payri.licenses.list(queryParams(url) as never),
  LicenseV1Controller_get: ({ payri, url }) => payri.licenses.retrieve(pathId(url)),
  LicenseAppV1Controller_verify: ({ example, body, calls }) => {
    const url = new URL(example.url);
    const { productId, nonce: _nonce, ...params } = body;
    return createLicensing(url.origin, String(productId), calls).verify(params as unknown as VerifyLicenseParams);
  },
  LicenseAppV1Controller_activate: ({ example, body, calls }) => {
    const url = new URL(example.url);
    const { productId, nonce: _nonce, ...params } = body;
    return createLicensing(url.origin, String(productId), calls).activate(params as unknown as ActivateLicenseParams);
  },
  LicenseAppV1Controller_deactivate: ({ example, body, calls }) => {
    const url = new URL(example.url);
    const { productId, nonce: _nonce, ...params } = body;
    return createLicensing(url.origin, String(productId), calls).deactivate(params as unknown as DeactivateLicenseParams);
  },
  OrdersV1Controller_list: ({ payri, url }) => payri.orders.list(queryParams(url) as never),
  OrdersV1Controller_get: ({ payri, url }) => payri.orders.retrieve(pathId(url)),
  OrdersV1Controller_refund: ({ payri, url, body, idempotencyKey }) =>
    payri.orders.refund(pathId(url), body as unknown as RefundOrderParams, postOptions(idempotencyKey)),
  PortalSessionsV1Controller_create: ({ payri, body, idempotencyKey }) =>
    payri.portalSessions.create(body as unknown as CreatePortalSessionParams, postOptions(idempotencyKey)),
  ProductsV1Controller_list: ({ payri, url }) => payri.products.list(queryParams(url) as never),
  ProductsV1Controller_get: ({ payri, url }) => payri.products.retrieve(pathId(url)),
  RefundRequestsV1Controller_list: ({ payri, url }) => payri.refundRequests.list(queryParams(url) as never),
  RefundRequestsV1Controller_get: ({ payri, url }) => payri.refundRequests.retrieve(pathId(url)),
  RefundRequestsV1Controller_approve: ({ payri, url, body, idempotencyKey }) =>
    payri.refundRequests.approve(pathId(url), body as unknown as RefundRequestApproveParams, postOptions(idempotencyKey)),
  RefundRequestsV1Controller_reject: ({ payri, url, body, idempotencyKey }) =>
    payri.refundRequests.reject(pathId(url), body as unknown as RefundRequestRejectParams, postOptions(idempotencyKey)),
  RefundRequestsV1Controller_hold: ({ payri, url, body, idempotencyKey }) =>
    payri.refundRequests.hold(pathId(url), body as unknown as RefundRequestHoldParams, postOptions(idempotencyKey)),
  SubscriptionsV1Controller_list: ({ payri, url }) => payri.subscriptions.list(queryParams(url) as never),
  SubscriptionsV1Controller_get: ({ payri, url }) => payri.subscriptions.retrieve(pathId(url)),
  SubscriptionsV1Controller_previewCancel: ({ payri, url }) => payri.subscriptions.cancelPreview(pathId(url)),
  SubscriptionsV1Controller_cancel: ({ payri, url, body, idempotencyKey }) =>
    payri.subscriptions.cancel(pathId(url), body as unknown as CancelSubscriptionParams, postOptions(idempotencyKey)),
};

function postOptions(idempotencyKey: string | undefined): { idempotencyKey: string } | undefined {
  return idempotencyKey === undefined ? undefined : { idempotencyKey };
}

const excludedOperations = {
  // SDK는 서버가 제공하는 OpenAPI 문서를 호출하지 않고 패키지에 고정한 명세를 사용합니다.
  OpenApiV1Controller_getOpenApiDocument: true,
  // SDK는 서버가 돌려주는 서명 키를 신뢰하지 않고 앱에 고정된 공개 키만 검증에 사용합니다.
  LicenseAppV1Controller_signingKeys: true,
};

function sortedQuery(url: URL): Array<[string, string]> {
  return [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signedWebhookHeaders(payload: string): Promise<Headers> {
  const key = await crypto.subtle.importKey('raw', WEBHOOK_SECRET_BYTES, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const id = 'evt_contract';
  const timestamp = String(SIGNED_AT);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${encodeBase64(new Uint8Array(signature))}`,
  });
}

function webhookExample(operation: SpecOperation): JsonRecord {
  const content = operation.requestBody?.content?.['application/json'];
  if (content?.example !== undefined) return content.example as JsonRecord;
  const first = Object.values(content?.examples ?? {}).find((item) => item.value !== undefined);
  if (first?.value === undefined) throw new Error('Webhook operation has no JSON request example.');
  return first.value as JsonRecord;
}

function typeValues(source: string, name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`export type ${escaped} =\\n((?:  \\| "(?:[^"\\\\]|\\\\.)*"\\n?)+);`));
  if (match === null) throw new Error(`Generated type ${name} was not found.`);
  return [...match[1]!.matchAll(/  \| ("(?:[^"\\]|\\.)*")/g)].map((entry) => JSON.parse(entry[1]!) as string);
}

describe('OpenAPI contract', () => {
  beforeAll(async () => {
    licenseSigningKeyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    licensePublicKey = encodeBase64(new Uint8Array(await crypto.subtle.exportKey('raw', licenseSigningKeyPair.publicKey)));
  });

  it('covers every API operation except the two intentionally unused discovery calls', () => {
    const specOperationIds = operationEntries().map(([operationId]) => operationId).sort();
    const sdkOperationIds = Object.keys(sdkCalls).sort();
    const excludedOperationIds = Object.keys(excludedOperations).sort();
    const covered = [...sdkOperationIds, ...excludedOperationIds].sort();

    expect(specOperationIds).toHaveLength(24);
    expect(sdkOperationIds).toHaveLength(22);
    expect(Object.keys(spec.webhooks)).toHaveLength(13);
    expect(covered).toEqual(specOperationIds);
  });

  it.each(Object.entries(sdkCalls))('replays %s request example through the SDK', async (operationId, callSdk) => {
    const { operation } = operationFor(operationId);
    const example = operation['x-payri-request-example'];
    expect(example).toBeDefined();
    const calls: CapturedRequest[] = [];
    const context = callContext(example!, calls, example!.headers?.['Idempotency-Key']);

    // The SDK owns the nonce and the constructor supplies productId from the request example.
    await callSdk(context);

    expect(calls).toHaveLength(1);
    const actual = calls[0]!;
    const expectedUrl = new URL(example!.url);
    const actualUrl = new URL(actual.url);
    expect(actual.method).toBe(example!.method);
    expect(actualUrl.pathname).toBe(expectedUrl.pathname);
    expect(sortedQuery(actualUrl)).toEqual(sortedQuery(expectedUrl));

    const expectedBody = operationId.startsWith('LicenseAppV1Controller_')
      ? bodyWithoutNonce(example!.body)
      : example!.body;
    const actualBody = operationId.startsWith('LicenseAppV1Controller_')
      ? bodyWithoutNonce(actual.body)
      : actual.body;
    expect(actualBody).toEqual(expectedBody);
    expect(actual.headers.get('Idempotency-Key')).toBe(example!.headers?.['Idempotency-Key'] ?? null);
  });

  it.each(operationEntries().filter(([, , operation]) => operation['x-payri-idempotent'] === true))(
    'adds an idempotency key automatically for %s',
    async (operationId, _path, operation) => {
      const example = operation['x-payri-request-example']!;
      const calls: CapturedRequest[] = [];
      const context = callContext(example, calls);
      context.payri = createPayri(context.url.origin, calls);
      await sdkCalls[operationId]!(context);
      expect(calls[0]!.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    },
  );

  it.each(operationEntries().filter(([operationId, , operation]) =>
    operationId in sdkCalls && operation['x-payri-idempotent'] !== true))(
    'omits an idempotency key for non-idempotent %s',
    async (operationId, _path, operation) => {
      const example = operation['x-payri-request-example']!;
      const calls: CapturedRequest[] = [];
      const context = callContext(example, calls);
      await sdkCalls[operationId]!(context);
      expect(calls[0]!.headers.get('Idempotency-Key')).toBeNull();
    },
  );

  it.each(Object.entries(spec.webhooks))('constructs the signed %s webhook example', async (type, item) => {
    const operation = item.post;
    expect(operation).toBeDefined();
    const example = webhookExample(operation!);
    const payload = JSON.stringify(example);
    const headers = await signedWebhookHeaders(payload);
    const event = await Webhooks.constructEvent({ payload, headers, secret: WEBHOOK_SECRET, nowSeconds: SIGNED_AT });
    expect(event.type).toBe(type);
  });

  it('routes the signed license.issue example to onLicenseIssue', async () => {
    const item = spec.webhooks['license.issue'];
    expect(item?.post).toBeDefined();
    const payload = JSON.stringify(webhookExample(item!.post!));
    const headers = await signedWebhookHeaders(payload);
    let receivedType: string | undefined;
    const result = await Webhooks.handle({
      payload,
      headers,
      secret: WEBHOOK_SECRET,
      nowSeconds: SIGNED_AT,
      onLicenseIssue: async (event) => {
        receivedType = event.type;
        return { key: 'PAYRI-ISSUED-KEY' };
      },
    });
    expect(receivedType).toBe('license.issue');
    expect(result).toMatchObject({ status: 200, body: JSON.stringify({ key: 'PAYRI-ISSUED-KEY' }) });
  });

  it('keeps generated error codes and scopes synchronized with the OpenAPI file', () => {
    const generated = readFileSync(new URL('../src/generated/spec-extensions.ts', import.meta.url), 'utf8');
    const expectedErrorCodes = Object.keys(spec['x-payri-error-catalog']).sort();
    const allOperations = [
      ...operationEntries().map(([, , operation]) => operation),
      ...Object.values(spec.webhooks).flatMap((item) => item.post === undefined ? [] : [item.post]),
    ];
    const expectedScopes = [...new Set(allOperations.flatMap((operation) => operation['x-payri-scope'] ?? []))].sort();
    expect(expectedErrorCodes).toHaveLength(46);
    expect(typeValues(generated, 'PayriKnownErrorCode')).toEqual(expectedErrorCodes);
    expect(typeValues(generated, 'ApiKeyScope')).toEqual(expectedScopes);
  });

  it('accepts OpenAPI ApiError detail examples', () => {
    const validationDetails = {
      fields: [{ field: 'productId', message: '필수 값이에요.' }],
    } satisfies ValidationErrorDetails;
    const scopeMissingDetails = {
      required: ['subscriptions:write'],
    } satisfies ScopeMissingErrorDetails;
    const additionalDetails: ApiErrorDetails = { traceId: 'trace_123' };
    const warningCode: RefundRequestWarningCode = 'POLICY_DECISION';
    const blockedReasonCode: SubscriptionCancelBlockedReason['code'] = 'ALREADY_ENDED';

    // @ts-expect-error 경고 코드는 명세 enum에 정의된 값만 사용할 수 있습니다.
    const invalidWarningCode: RefundRequestWarningCode = 'UNKNOWN_WARNING';
    void invalidWarningCode;
    // @ts-expect-error 차단 코드는 명세 enum에 정의된 값만 사용할 수 있습니다.
    const invalidBlockedReasonCode: SubscriptionCancelBlockedReason['code'] = 'UNKNOWN_BLOCK';
    void invalidBlockedReasonCode;

    expect(validationDetails.fields[0]).toEqual({ field: 'productId', message: '필수 값이에요.' });
    expect(scopeMissingDetails.required).toEqual(['subscriptions:write']);
    expect(additionalDetails).toEqual({ traceId: 'trace_123' });
    expect(warningCode).toBe('POLICY_DECISION');
    expect(blockedReasonCode).toBe('ALREADY_ENDED');
  });
});

