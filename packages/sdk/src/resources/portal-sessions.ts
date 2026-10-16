import type { HttpClient, PostRequestOptions } from '../internal/http-client.js';
import type { CreatePortalSessionParams, PortalSession } from '../types/portal-sessions.js';

/** 구독 관리 포털 세션을 생성합니다. */
export class PortalSessions {
  constructor(private readonly http: HttpClient) {}

  /**
   * 구매자 포털 세션을 생성합니다.
   * 가격 인상 동의, 구독 환불 요청 철회 및 즉시 과금 변경은 구매자 이메일 인증(OTP) 후에만 가능합니다.
   */
  create(params: CreatePortalSessionParams, options?: PostRequestOptions): Promise<PortalSession> {
    return this.http.request({
      method: 'POST',
      path: '/v1/portal-sessions',
      body: params,
      idempotencyKey: options?.idempotencyKey,
    });
  }
}
