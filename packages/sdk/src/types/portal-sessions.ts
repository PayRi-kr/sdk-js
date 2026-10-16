import type { components } from '../generated/v1.js';

/** 구매자 포털 세션 생성 요청입니다. 구독 ID 또는 이메일 중 하나 이상이 필요합니다. */
export type CreatePortalSessionParams = Omit<components['schemas']['CreatePortalSessionV1Dto'], 'subscriptionId' | 'buyerEmail'> & (
  | { subscriptionId: string; buyerEmail?: string }
  | { subscriptionId?: string; buyerEmail: string }
);

/** 구매자 포털 세션 응답입니다. */
export type PortalSession = components['schemas']['V1PortalSessionResponse'];
