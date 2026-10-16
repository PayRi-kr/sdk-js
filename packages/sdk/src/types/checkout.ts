import type { components } from '../generated/v1.js';
import type { BillingInterval } from './common.js';

/** 체크아웃 세션 상태입니다. */
export type CheckoutSessionStatus = components['schemas']['V1CheckoutSessionResponse']['status'];

/** 체크아웃 생성 때 전달하는 구매자 정보입니다. */
export type CheckoutCustomer = components['schemas']['V1CheckoutCustomerDto'];

/** 체크아웃 세션에 포함되는 구매자 정보입니다. */
export type CheckoutSessionCustomer = components['schemas']['V1CheckoutCustomer'];

/** 체크아웃 세션 생성 요청입니다. 요금제 ID와 주기는 함께 지정해야 합니다. */
export type CreateCheckoutSessionParams = Omit<components['schemas']['V1CreateCheckoutSessionDto'], 'planId' | 'interval'> & (
  | { planId?: undefined; interval?: undefined }
  | { planId: string; interval: BillingInterval }
);

/** 체크아웃 세션 응답입니다. */
export type CheckoutSession = components['schemas']['V1CheckoutSessionResponse'];
