import type { HttpClient, PostRequestOptions } from '../internal/http-client.js';
import type { Order, OrderListParams, OrderListResponse, RefundOrderParams } from '../types/orders.js';

/** 주문 조회와 환불 요청을 제공합니다. */
export class Orders {
  constructor(private readonly http: HttpClient) {}

  /** 주문 목록을 조회합니다. */
  list(params: OrderListParams = {}): Promise<OrderListResponse> {
    return this.http.request({ method: 'GET', path: '/v1/orders', query: { ...params } });
  }

  /** 주문을 조회합니다. */
  retrieve(id: string): Promise<Order> {
    return this.http.request({ method: 'GET', path: `/v1/orders/${encodeURIComponent(id)}` });
  }

  /** 주문 환불을 요청합니다. */
  refund(id: string, params: RefundOrderParams = {}, options?: PostRequestOptions): Promise<Order> {
    return this.http.request({
      method: 'POST',
      path: `/v1/orders/${encodeURIComponent(id)}/refund`,
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }
}
