import type { components } from '../generated/v1.js';

/** 웹훅 이벤트 공통 봉투입니다. */
export type WebhookEnvelope<TType extends string, TData> = {
  id: string;
  type: TType;
  createdAt: string;
  mode: 'live' | 'test';
  data: TData;
};

/** 주문 환불 이벤트에 포함되는 환불 기록입니다. */
export type OrderRefundRecord = components['schemas']['V1OrderRefundDetail'];

/** 주문 환불 이벤트 data의 형태입니다. */
export type OrderRefundedData = components['schemas']['V1WebhookData_order_refunded'];

/** 구독 생성 웹훅 data의 형태입니다. */
export type SubscriptionCreatedData = components['schemas']['V1WebhookData_subscription_created'];

/** 구독 변경 웹훅 data의 형태입니다. */
export type SubscriptionUpdatedData = components['schemas']['V1WebhookData_subscription_updated'];

/** 구독 생성·변경 웹훅 data의 형태입니다. */
export type SubscriptionChangeData = SubscriptionCreatedData | SubscriptionUpdatedData;

/** 구독 종료 이벤트 data의 형태입니다. */
export type SubscriptionEndedData = components['schemas']['V1WebhookData_subscription_ended'];

/** 구독 결제 실패 이벤트 data입니다. */
export type SubscriptionPaymentFailedData = components['schemas']['V1WebhookData_subscription_payment_failed'];

/** 라이선스 발급 이벤트 data의 형태입니다. */
export type LicenseIssueData = components['schemas']['V1WebhookData_license_issue'];

/** 웹훅 테스트 이벤트 data의 형태입니다. */
export type WebhookTestData = components['schemas']['V1WebhookData_webhook_test'];

/** 구독 관련 웹훅 이벤트 이름입니다. */
export type SubscriptionEventType = Extract<PayriWebhookEventType, `subscription.${string}`>;

/** 환불 요청 관련 웹훅 이벤트 이름입니다. */
export type RefundRequestEventType = Extract<PayriWebhookEventType, `refund.${string}`>;

/** 결제 완료 이벤트입니다. */
export type OrderPaidEvent = components['schemas']['V1WebhookEnvelope_order_paid'];

/** 주문 환불 이벤트입니다. */
export type OrderRefundedEvent = components['schemas']['V1WebhookEnvelope_order_refunded'];

/** 구독 생성 이벤트입니다. */
export type SubscriptionCreatedEvent = components['schemas']['V1WebhookEnvelope_subscription_created'];

/** 구독 변경 이벤트입니다. */
export type SubscriptionUpdatedEvent = components['schemas']['V1WebhookEnvelope_subscription_updated'];

/** 구독 종료 이벤트입니다. */
export type SubscriptionEndedEvent = components['schemas']['V1WebhookEnvelope_subscription_ended'];

/** 구독 결제 실패 이벤트입니다. */
export type SubscriptionPaymentFailedEvent = components['schemas']['V1WebhookEnvelope_subscription_payment_failed'];

/** 환불 요청 접수 이벤트입니다. */
export type RefundRequestedEvent = components['schemas']['V1WebhookEnvelope_refund_requested'];

/** 환불 요청 승인 이벤트입니다. */
export type RefundApprovedEvent = components['schemas']['V1WebhookEnvelope_refund_approved'];

/** 환불 요청 거절 이벤트입니다. */
export type RefundRejectedEvent = components['schemas']['V1WebhookEnvelope_refund_rejected'];

/** 환불 요청 보류 이벤트입니다. */
export type RefundOnHoldEvent = components['schemas']['V1WebhookEnvelope_refund_on_hold'];

/** 환불 요청 철회 이벤트입니다. */
export type RefundWithdrawnEvent = components['schemas']['V1WebhookEnvelope_refund_withdrawn'];

/** 라이선스 발급 이벤트입니다. */
export type LicenseIssueEvent = components['schemas']['V1WebhookEnvelope_license_issue'];

/** 웹훅 연결 테스트 이벤트입니다. */
export type WebhookTestEvent = components['schemas']['V1WebhookEnvelope_webhook_test'];

/** SDK가 처리하는 웹훅 이벤트의 합집합입니다. */
export type PayriWebhookEvent =
  | OrderPaidEvent
  | OrderRefundedEvent
  | SubscriptionCreatedEvent
  | SubscriptionUpdatedEvent
  | SubscriptionEndedEvent
  | SubscriptionPaymentFailedEvent
  | RefundRequestedEvent
  | RefundApprovedEvent
  | RefundRejectedEvent
  | RefundOnHoldEvent
  | RefundWithdrawnEvent
  | LicenseIssueEvent
  | WebhookTestEvent;

/** SDK가 처리하는 웹훅 이벤트 이름입니다. */
export type PayriWebhookEventType = PayriWebhookEvent['type'];

/** 이벤트 이름에 맞는 웹훅 봉투 타입입니다. */
export type WebhookEventByType<T extends PayriWebhookEventType> = Extract<PayriWebhookEvent, { type: T }>;

/** 라이선스 발급 요청을 제외한 웹훅 이벤트입니다. */
export type NonLicenseIssueEvent = Exclude<PayriWebhookEvent, LicenseIssueEvent>;

/** 환불 요청 처리 관련 웹훅 이벤트입니다. */
export type RefundRequestWebhookEvent =
  | RefundRequestedEvent
  | RefundApprovedEvent
  | RefundRejectedEvent
  | RefundOnHoldEvent
  | RefundWithdrawnEvent;

/** 라이선스 발급 응답입니다. 만료일 생략·null은 요청 설정을 따르고, maxActivations 생략은 상품 설정을 유지하며 null은 무제한입니다. */
export type LicenseIssueResponse = components['schemas']['V1LicenseIssueResponse'];
