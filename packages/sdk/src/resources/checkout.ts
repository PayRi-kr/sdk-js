import type { HttpClient, PostRequestOptions } from '../internal/http-client.js';
import type { CheckoutSession, CreateCheckoutSessionParams } from '../types/checkout.js';

/** 체크아웃 세션 API를 제공합니다. */
export class CheckoutSessions {
  constructor(private readonly http: HttpClient) {}

  /** 체크아웃 세션을 생성합니다. */
  create(params: CreateCheckoutSessionParams, options?: PostRequestOptions): Promise<CheckoutSession> {
    return this.http.request({
      method: 'POST',
      path: '/v1/checkout/sessions',
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /** 체크아웃 세션을 조회합니다. */
  retrieve(id: string): Promise<CheckoutSession> {
    return this.http.request({ method: 'GET', path: `/v1/checkout/sessions/${encodeURIComponent(id)}` });
  }
}

/** checkout.sessions 리소스를 묶어 제공합니다. */
export class Checkout {
  readonly sessions: CheckoutSessions;

  constructor(http: HttpClient) {
    this.sessions = new CheckoutSessions(http);
  }
}
