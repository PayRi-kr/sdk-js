import type { HttpClient, PostRequestOptions } from '../internal/http-client.js';
import type {
  CancelSubscriptionParams,
  CancelSubscriptionResult,
  Subscription,
  SubscriptionCancelPreview,
  SubscriptionListParams,
  SubscriptionListResponse,
} from '../types/subscriptions.js';

/** 구독 조회와 해지를 제공합니다. */
export class Subscriptions {
  constructor(private readonly http: HttpClient) {}

  /** 구독 목록을 조회합니다. */
  list(params: SubscriptionListParams = {}): Promise<SubscriptionListResponse> {
    return this.http.request({ method: 'GET', path: '/v1/subscriptions', query: { ...params } });
  }

  /** 구독을 조회합니다. */
  retrieve(id: string): Promise<Subscription> {
    return this.http.request({ method: 'GET', path: `/v1/subscriptions/${encodeURIComponent(id)}` });
  }

  /** 구독 해지 결과를 미리 계산합니다. */
  cancelPreview(id: string): Promise<SubscriptionCancelPreview> {
    return this.http.request({
      method: 'GET',
      path: `/v1/subscriptions/${encodeURIComponent(id)}/cancel-preview`,
    });
  }

  /** 지정한 시점으로 구독을 해지합니다. */
  cancel(id: string, params: CancelSubscriptionParams, options?: PostRequestOptions): Promise<CancelSubscriptionResult> {
    return this.http.request({
      method: 'POST',
      path: `/v1/subscriptions/${encodeURIComponent(id)}/cancel`,
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }
}
