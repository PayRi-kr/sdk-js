import type { components, operations } from '../generated/v1.js';

/** 주문 응답입니다. */
export type Order = components['schemas']['V1OrderResponse'];

/** 주문 환불 내역입니다. */
export type OrderRefund = components['schemas']['V1OrderRefundItem'];

/** 주문에 적용한 쿠폰입니다. */
export type OrderCoupon = components['schemas']['V1OrderCoupon'];

/** 주문 상태입니다. */
export type OrderStatus = Order['status'];

/** 주문 결제 수단입니다. */
export type PaymentMethod = Order['method'];

/** 주문 환불 요청입니다. */
export type RefundOrderParams = components['schemas']['V1RefundOrderDto'];

/** 주문 목록 요청 옵션입니다. */
export type OrderListParams = Omit<
  NonNullable<operations['OrdersV1Controller_list']['parameters']['query']>,
  'createdFrom' | 'createdTo'
> & {
  createdFrom?: string | Date;
  createdTo?: string | Date;
};

/** 주문 목록 응답입니다. */
export type OrderListResponse = components['schemas']['V1OrderPageResponse'];
