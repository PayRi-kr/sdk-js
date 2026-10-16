import type { components, operations } from '../generated/v1.js';
import type { RefundRequest } from './refund-requests.js';

/** 구독 응답입니다. */
export type Subscription = components['schemas']['V1SubscriptionResponse'];

/** 구독 상태입니다. */
export type SubscriptionStatus = Subscription['status'];

/** 구독 종료 사유입니다. */
export type SubscriptionEndReason = NonNullable<Subscription['endReason']>;

/** 구독 요금제 상태입니다. */
export type SubscriptionPlanState = components['schemas']['V1PlanInterval'];

/** 구독 변경 종류입니다. */
export type SubscriptionChangeKind = components['schemas']['V1SubscriptionChange']['kind'];

/** 구독 갱신 뒤의 구독 변경 종류입니다. */
export type SubscriptionUpdateKind = components['schemas']['V1WebhookData_subscription_updated']['change']['kind'];

/** 구독 변경 정보입니다. */
export type SubscriptionChange = components['schemas']['V1SubscriptionChange'];

/** 구독 변경 이력 항목입니다. */
export type SubscriptionHistoryEntry = components['schemas']['V1SubscriptionHistoryEntry'];

/** 구독 환불 조건입니다. */
export type SubscriptionRefundTerms = Subscription['refundTerms'];

/** 구독 환불 위약금 조건입니다. */
export type SubscriptionPenalty = NonNullable<SubscriptionRefundTerms['penalty']>;

/** 구독 목록 금액 기준입니다. */
export type SubscriptionListAmounts = NonNullable<SubscriptionRefundTerms['listAmounts']>;

/** 구독에 예약된 변경 정보입니다. */
export type ScheduledSubscriptionChange = NonNullable<Subscription['scheduledChange']>;

/** 구독에 고지된 가격 인상 정보입니다. */
export type SubscriptionPendingPriceChange = NonNullable<Subscription['pendingPriceChange']>;

/** 구독 해지 요청입니다. */
export type CancelSubscriptionParams = components['schemas']['V1CancelSubscriptionDto'];

/** 구독 해지 결과입니다. */
export type CancelSubscriptionResult = components['schemas']['V1CancelResultResponse'];

/** 구독 해지 미리보기의 차단 사유입니다. */
export type SubscriptionCancelBlockedReason = NonNullable<components['schemas']['V1ImmediateCancelPreview']['blockedReason']>;

/** 구독 해지 미리보기의 주문별 환불 내역입니다. */
export type SubscriptionCancelBreakdownItem = components['schemas']['V1CancelBreakdownItem'];

/** 구독 해지 미리보기의 즉시 처리 정보입니다. */
export type ImmediateSubscriptionCancelPreview = components['schemas']['V1ImmediateCancelPreview'];

/** 구독 해지 기간 종료 미리보기입니다. */
export type PeriodEndSubscriptionCancelPreview = components['schemas']['V1CancelPeriodEndPreview'];

/** 구독 해지 미리보기입니다. */
export type SubscriptionCancelPreview = Omit<components['schemas']['V1CancelPreviewResponse'], 'pendingRefundRequest'> & {
  pendingRefundRequest: RefundRequest | null;
};

/** 구독 목록 요청 옵션입니다. */
export type SubscriptionListParams = NonNullable<operations['SubscriptionsV1Controller_list']['parameters']['query']>;

/** 구독 목록 응답입니다. */
export type SubscriptionListResponse = components['schemas']['V1SubscriptionPageResponse'];
