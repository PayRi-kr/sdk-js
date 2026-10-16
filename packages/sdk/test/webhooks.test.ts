import { describe, expect, it } from 'vitest';
import {
  PayriError,
  PayriWebhookError,
  Webhooks,
  type LicenseIssueResponse,
  type OrderRefundedEvent,
  type Subscription,
  type SubscriptionCreatedEvent,
  type SubscriptionHistoryEntry,
  type SubscriptionPendingPriceChange,
  type SubscriptionUpdateKind,
  type SubscriptionUpdatedEvent,
  type WebhookTestEvent,
} from '../src/index.js';

const SECRET = 'whsec_dGVzdHNlY3JldA==';
const ROTATED_SECRET = 'whsec_bmV3c2VjcmV0';
const NOW = 1_700_000_000;

const licenseIssueResponses: Array<{
  label: string;
  response: LicenseIssueResponse;
  expected: Record<string, unknown>;
}> = [
  {
    label: 'null values',
    response: { key: 'license-key', expiresAt: null, maxActivations: null },
    expected: { key: 'license-key', expiresAt: null, maxActivations: null },
  },
  {
    label: 'zero activation limit',
    response: { key: 'license-key', maxActivations: 0 },
    expected: { key: 'license-key', maxActivations: 0 },
  },
  {
    label: 'omitted optional values',
    response: { key: 'license-key' },
    expected: { key: 'license-key' },
  },
  {
    label: 'valid date and activation limit',
    response: { key: 'license-key', expiresAt: '2027-10-15T00:00:00.000Z', maxActivations: 3 },
    expected: { key: 'license-key', expiresAt: '2027-10-15T00:00:00.000Z', maxActivations: 3 },
  },
];

function eventPayload(type: string = 'order.paid'): string {
  return JSON.stringify({
    id: 'evt_1',
    type,
    createdAt: '2026-01-01T00:00:00.000Z',
    mode: 'live',
    data: type === 'license.issue'
      ? {
          mode: 'live',
          licenseId: 'lic_1',
          orderId: 'ord_1',
          productId: 'prod_1',
          planId: null,
          interval: null,
          buyer: { email: 'buyer@example.test', name: null },
          maxActivations: 3,
          expiresAt: null,
        }
      : type === 'subscription.created' || type === 'subscription.updated' || type === 'subscription.payment_failed'
        ? {
            id: 'sub_1',
            productId: 'prod_1',
            productName: '상품',
            buyerEmail: 'buyer@example.test',
            buyerName: null,
            planId: 'plan_1',
            billingInterval: 'monthly',
            status: 'active',
            currentPeriodStart: '2026-01-01T00:00:00.000Z',
            currentPeriodEnd: '2026-02-01T00:00:00.000Z',
            startedAt: '2026-01-01T00:00:00.000Z',
            refundEligibleUntil: null,
            cancelAtPeriodEnd: true,
            endReason: null,
            scheduledChange: null,
            endedAt: null,
            pastDueSince: null,
            testRenewalOutcome: null,
            refundTerms: {},
            history: [],
            mode: 'live',
            ...(type === 'subscription.payment_failed'
              ? { attempts: 2, amount: 1000, currency: 'KRW' }
              : {
                  change: {
                    kind: type === 'subscription.created' ? 'created' : 'plan_changed',
                    from: type === 'subscription.created' ? null : { planId: 'plan_basic', billingInterval: 'monthly' },
                    to: type === 'subscription.created' ? null : { planId: 'plan_pro', billingInterval: 'monthly' },
                    prorationAmount: null,
                    orderId: null,
                    effectiveAt: null,
                    extensionDays: null,
                    amount: null,
                    currency: null,
                  },
                }),
          }
      : type === 'webhook.test'
        ? { endpointId: 'we_1', mode: 'live', sentAt: '2026-01-01T00:00:00.000Z' }
        : type === 'order.refunded'
          ? {
              id: 'ord_1', productId: 'prod_1', productName: '상품', checkoutSessionId: null,
              amount: 1000, currency: 'KRW', buyerName: null, buyerEmail: 'buyer@example.test', buyerPhone: null,
              method: 'card', status: 'refunded', createdAt: '2026-01-01T00:00:00.000Z',
              paidAt: '2026-01-01T00:00:00.000Z', refundedAt: '2026-01-02T00:00:00.000Z', refundedAmount: 1000,
              refunds: [{ amount: 1000, currency: 'KRW', at: '2026-01-02T00:00:00.000Z', reason: null }],
              confirmedAt: null, withdrawalNoticeAgreedAt: null, coupon: null, subscriptionId: null, planId: null, billingInterval: null,
              subscriptionEvent: null, periodStart: null, periodEnd: null, metadata: null, mode: 'live',
              refund: { id: 'ref_1', amount: 1000, currency: 'KRW', reason: null, refundedAt: '2026-01-02T00:00:00.000Z' },
            }
          : { id: 'obj_1', mode: 'live' },
  });
}

async function sign(secret: string, id: string, timestamp: number, payload: string): Promise<string> {
  const raw = atob(secret.replace(/^whsec_/, ''));
  const keyBytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signedHeaders(
  payload: string,
  options: { secret?: string; id?: string; timestamp?: number; signatures?: string[] } = {},
): Promise<Record<string, string>> {
  const secret = options.secret ?? SECRET;
  const id = options.id ?? 'evt_1';
  const timestamp = options.timestamp ?? NOW;
  const signatures = options.signatures ?? [await sign(secret, id, timestamp, payload)];
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': signatures.map((value) => `v1,${value}`).join(' '),
  };
}

describe('Webhooks', () => {
  it('verifies and parses a full event envelope', async () => {
    const payload = eventPayload();
    const headers = await signedHeaders(payload);
    const event = await Webhooks.constructEvent({ payload, headers, secret: SECRET, nowSeconds: NOW });
    expect(event).toMatchObject({ id: 'evt_1', type: 'order.paid', mode: 'live', data: { id: 'obj_1' } });
  });

  it('parses subscription.updated change data with a narrowed event type', async () => {
    const payload = eventPayload('subscription.updated');
    const headers = await signedHeaders(payload);
    const event = await Webhooks.constructEvent({ payload, headers, secret: SECRET, nowSeconds: NOW });
    if (event.type === 'subscription.updated') {
      expect(event.data.change.kind).toBe('plan_changed');
      expect(event.data.change.to?.planId).toBe('plan_pro');
      expect(event.data.cancelAtPeriodEnd).toBe(true);
    } else {
      throw new Error('Expected subscription.updated');
    }
  });

  it('parses subscription.created change data with a narrowed event type', async () => {
    const payload = eventPayload('subscription.created');
    const headers = await signedHeaders(payload);
    const event = await Webhooks.constructEvent({ payload, headers, secret: SECRET, nowSeconds: NOW });
    if (event.type === 'subscription.created') {
      expect(event.data.change.kind).toBe('created');
    } else {
      throw new Error('Expected subscription.created');
    }

    const validUpdatedKind: SubscriptionUpdateKind = 'cancel_scheduled';
    void validUpdatedKind;

    const validCreatedKind: SubscriptionCreatedEvent['data']['change']['kind'] = 'created';
    void validCreatedKind;

    // @ts-expect-error subscription.created에서는 created 외 종류를 사용할 수 없습니다.
    const createdKind: SubscriptionCreatedEvent['data']['change']['kind'] = 'plan_changed';
    void createdKind;

    // @ts-expect-error subscription.updated에서는 created를 사용할 수 없습니다.
    const updatedKind: SubscriptionUpdatedEvent['data']['change']['kind'] = 'created';
    void updatedKind;
  });

  it('exposes subscription price change fields and event values', () => {
    const amount: Subscription['amount'] = 9900;
    const currency: Subscription['currency'] = 'KRW';
    const pendingPriceChange: SubscriptionPendingPriceChange = {
      amount: 12000,
      currency: 'KRW',
      noticedAt: '2026-10-01T00:00:00.000Z',
      effectiveFrom: '2026-11-01T00:00:00.000Z',
      consentedAt: null,
    };
    const updateKind: SubscriptionUpdateKind = 'price_change_scheduled';
    const historyKind: SubscriptionHistoryEntry['type'] = 'price_change_noticed';
    void amount;
    void currency;
    void pendingPriceChange;
    void updateKind;
    void historyKind;
  });

  it('parses subscription.payment_failed data with a narrowed event type', async () => {
    const payload = eventPayload('subscription.payment_failed');
    const headers = await signedHeaders(payload);
    const event = await Webhooks.constructEvent({ payload, headers, secret: SECRET, nowSeconds: NOW });
    if (event.type === 'subscription.payment_failed') {
      expect(event.data.attempts).toBe(2);
      expect(event.data.amount).toBe(1000);
      expect(event.data.currency).toBe('KRW');
    } else {
      throw new Error('Expected subscription.payment_failed');
    }
  });

  it('accepts any matching signature during secret rotation', async () => {
    const payload = eventPayload();
    const headers = await signedHeaders(payload, {
      signatures: [await sign(SECRET, 'evt_1', NOW, payload), await sign(ROTATED_SECRET, 'evt_1', NOW, payload)],
    });
    await expect(Webhooks.verify({ payload, headers, secret: SECRET, nowSeconds: NOW })).resolves.toBeUndefined();
    await expect(Webhooks.verify({ payload, headers, secret: [ROTATED_SECRET], nowSeconds: NOW })).resolves.toBeUndefined();
    await expect(Webhooks.verify({ payload, headers, secret: [SECRET, ROTATED_SECRET], nowSeconds: NOW })).resolves.toBeUndefined();
  });

  it('accepts a Fetch Headers object and case-insensitive object header names', async () => {
    const payload = eventPayload();
    const headers = await signedHeaders(payload);
    await expect(Webhooks.verify({ payload, headers: new Headers(headers), secret: SECRET, nowSeconds: NOW })).resolves.toBeUndefined();
    await expect(Webhooks.verify({
      payload,
      headers: {
        'Webhook-Id': headers['webhook-id']!,
        'Webhook-Timestamp': headers['webhook-timestamp']!,
        'Webhook-Signature': headers['webhook-signature']!,
      },
      secret: SECRET,
      nowSeconds: NOW,
    })).resolves.toBeUndefined();
  });

  it.each([
    ['missing headers', {}, 'MISSING_REQUIRED_HEADERS'],
    ['wrong signature', { 'webhook-id': 'evt_1', 'webhook-timestamp': String(NOW), 'webhook-signature': 'v1,aW52YWxpZA==' }, 'NO_MATCHING_SIGNATURE'],
    ['old timestamp', { 'webhook-id': 'evt_1', 'webhook-timestamp': String(NOW - 600), 'webhook-signature': 'v1,aW52YWxpZA==' }, 'TIMESTAMP_TOO_OLD'],
    ['future timestamp', { 'webhook-id': 'evt_1', 'webhook-timestamp': String(NOW + 600), 'webhook-signature': 'v1,aW52YWxpZA==' }, 'TIMESTAMP_TOO_NEW'],
    ['invalid timestamp', { 'webhook-id': 'evt_1', 'webhook-timestamp': 'tomorrow', 'webhook-signature': 'v1,aW52YWxpZA==' }, 'INVALID_SIGNATURE'],
  ] as const)('reports %s with its reason', async (_label, headers, reason) => {
    const error = await Webhooks.verify({ payload: eventPayload(), headers, secret: SECRET, nowSeconds: NOW }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PayriWebhookError);
    expect(error).toMatchObject({ reason });
  });

  it('rejects invalid secrets and malformed signed payloads', async () => {
    const payload = 'not json';
    const headers = await signedHeaders(payload);
    const badSecret = await Webhooks.verify({ payload, headers, secret: 'whsec_not-base64!', nowSeconds: NOW }).catch((error: unknown) => error);
    expect(badSecret).toMatchObject({ reason: 'INVALID_SECRET' });
    const invalidPayload = await Webhooks.constructEvent({ payload, headers, secret: SECRET, nowSeconds: NOW }).catch((error: unknown) => error);
    expect(invalidPayload).toMatchObject({ reason: 'INVALID_PAYLOAD' });
  });

  it('parses an unknown event type and passes it to onEvent for acknowledgement', async () => {
    const payload = eventPayload('future.event').replace('"id":"evt_1"', '"id":"different-id"');
    const headers = await signedHeaders(payload);
    const event = await Webhooks.constructEvent({ payload, headers, secret: SECRET, nowSeconds: NOW });
    let received: string | undefined;
    const result = await Webhooks.handle({
      payload,
      headers,
      secret: SECRET,
      nowSeconds: NOW,
      onEvent: (value) => { received = value.type; },
    });
    expect(event.type as string).toBe('future.event');
    expect(event.id).toBe('different-id');
    expect(received).toBe('future.event');
    expect(result).toEqual({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"received":true}' });
  });

  it('acks ordinary events and awaits onEvent', async () => {
    const payload = eventPayload('webhook.test');
    const headers = await signedHeaders(payload);
    let received: string | undefined;
    let testEvent: WebhookTestEvent | undefined;
    const result = await Webhooks.handle({
      payload,
      headers,
      secret: SECRET,
      nowSeconds: NOW,
      onEvent: async (event) => {
        received = event.type;
        if (event.type === 'webhook.test') testEvent = event;
      },
    });
    expect(received).toBe('webhook.test');
    expect(testEvent?.data).toEqual({ endpointId: 'we_1', mode: 'live', sentAt: '2026-01-01T00:00:00.000Z' });
    expect(result).toEqual({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"received":true}' });
  });

  it.each(licenseIssueResponses)('accepts $label in a license.issue response', async ({ response, expected }) => {
    const payload = eventPayload('license.issue');
    const headers = await signedHeaders(payload);
    const result = await Webhooks.handle({
      payload,
      headers,
      secret: SECRET,
      nowSeconds: NOW,
      onLicenseIssue: () => response,
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual(expected);
  });

  it('accepts echoed license.issue request values including null and preserves them in the response', async () => {
    const request = JSON.parse(eventPayload('license.issue')) as { data: { maxActivations: number | null } };
    request.data.maxActivations = null;
    const payload = JSON.stringify(request);
    const headers = await signedHeaders(payload);
    const result = await Webhooks.handle({
      payload,
      headers,
      secret: SECRET,
      nowSeconds: NOW,
      onLicenseIssue: (event) => ({
        key: 'license-key',
        expiresAt: event.data.expiresAt,
        maxActivations: event.data.maxActivations,
      }),
    });
    expect(JSON.parse(result.body)).toEqual({ key: 'license-key', expiresAt: null, maxActivations: null });
  });

  it('parses an order.refunded event with its refund record', async () => {
    const payload = eventPayload('order.refunded');
    const headers = await signedHeaders(payload);
    let refunded: OrderRefundedEvent | undefined;
    await Webhooks.handle({
      payload,
      headers,
      secret: SECRET,
      nowSeconds: NOW,
      onEvent: (event) => {
        if (event.type === 'order.refunded') refunded = event;
      },
    });
    expect(refunded?.data.refund).toEqual({
      id: 'ref_1',
      amount: 1000,
      currency: 'KRW',
      reason: null,
      refundedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('requires a license.issue callback and validates its response', async () => {
    const payload = eventPayload('license.issue');
    const headers = await signedHeaders(payload);
    const base = { payload, headers, secret: SECRET, nowSeconds: NOW };
    await expect(Webhooks.handle(base)).rejects.toBeInstanceOf(PayriError);
    await expect(Webhooks.handle({ ...base, onLicenseIssue: () => ({ key: '' }) })).rejects.toThrow(/key/);
    await expect(Webhooks.handle({ ...base, onLicenseIssue: () => ({ key: 'x', expiresAt: 'invalid' }) })).rejects.toThrow(/expiresAt/);
    await expect(Webhooks.handle({ ...base, onLicenseIssue: () => ({ key: 'x', maxActivations: -1 }) })).rejects.toThrow(/maxActivations/);
    await expect(Webhooks.handle({ ...base, onLicenseIssue: () => ({ key: 'x', maxActivations: 1.5 }) })).rejects.toThrow(/maxActivations/);
  });

  it('turns verification failures into a 400 response and propagates callback errors', async () => {
    const payload = eventPayload();
    const invalid = await Webhooks.handle({ payload, headers: {}, secret: SECRET, nowSeconds: NOW });
    expect(invalid).toEqual({ status: 400, headers: { 'content-type': 'application/json' }, body: '{"error":"MISSING_REQUIRED_HEADERS"}' });

    const headers = await signedHeaders(payload);
    const failure = new Error('handler failed');
    await expect(Webhooks.handle({ payload, headers, secret: SECRET, nowSeconds: NOW, onEvent: () => { throw failure; } })).rejects.toBe(failure);
  });

  it('creates a Fetch API request handler', async () => {
    const payload = eventPayload();
    const headers = await signedHeaders(payload);
    const handler = Webhooks.createHandler({ secret: SECRET, nowSeconds: NOW });
    const response = await handler(new Request('https://example.test/webhook', { method: 'POST', headers, body: payload }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ received: true });
  });
});
