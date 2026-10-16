import type { HttpClient, PostRequestOptions } from '../internal/http-client.js';
import type {
  RefundRequestActionResult,
  RefundRequestApproveParams,
  RefundRequestHoldParams,
  RefundRequestListParams,
  RefundRequestListResponse,
  RefundRequestRejectParams,
  RefundRequest,
} from '../types/refund-requests.js';

/** 환불 요청 조회와 처리를 제공합니다. */
export class RefundRequests {
  constructor(private readonly http: HttpClient) {}

  /** 환불 요청 목록을 조회합니다. */
  list(params: RefundRequestListParams = {}): Promise<RefundRequestListResponse> {
    return this.http.request({ method: 'GET', path: '/v1/refund-requests', query: { ...params } });
  }

  /** 환불 요청을 조회합니다. */
  retrieve(id: string): Promise<RefundRequest> {
    return this.http.request({ method: 'GET', path: `/v1/refund-requests/${encodeURIComponent(id)}` });
  }

  /** 환불 요청을 승인합니다. */
  approve(id: string, params: RefundRequestApproveParams = {}, options?: PostRequestOptions): Promise<RefundRequestActionResult> {
    return this.http.request({
      method: 'POST',
      path: `/v1/refund-requests/${encodeURIComponent(id)}/approve`,
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /** 환불 요청을 거절합니다. */
  reject(id: string, params: RefundRequestRejectParams, options?: PostRequestOptions): Promise<RefundRequestActionResult> {
    return this.http.request({
      method: 'POST',
      path: `/v1/refund-requests/${encodeURIComponent(id)}/reject`,
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /** 환불 요청을 보류합니다. */
  hold(id: string, params: RefundRequestHoldParams, options?: PostRequestOptions): Promise<RefundRequestActionResult> {
    return this.http.request({
      method: 'POST',
      path: `/v1/refund-requests/${encodeURIComponent(id)}/hold`,
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }
}
