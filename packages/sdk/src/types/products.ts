import type { components, operations } from '../generated/v1.js';

/** 상품 응답입니다. */
export type Product = components['schemas']['V1ProductResponse'];

/** 상품 가격 정보를 나타냅니다. */
export type Pricing = Product['pricing'];

/** 상품 요금제 정보를 나타냅니다. */
export type PricingPlan = NonNullable<Pricing['plans']>[number];

/** 상품 전달 정보를 나타냅니다. */
export type Deliverable = Product['deliverable'];

/** 상품에 포함된 콘텐츠 항목입니다. */
export type ContentItem = Product['contents'][number];

/** 상품 환불 정책입니다. */
export type ProductRefundPolicy = Product['refundPolicy'];

/** 상품의 구독 환불 조건입니다. */
export type ProductSubscriptionRefundTerms = NonNullable<ProductRefundPolicy['subscription']>;

/** 상품 환불 위약금 조건입니다. */
export type ProductPenalty = NonNullable<ProductSubscriptionRefundTerms['penalty']>;

/** 상품 상태입니다. */
export type ProductStatus = Product['status'];

/** 상품 목록 요청 옵션입니다. */
export type ProductListParams = NonNullable<operations['ProductsV1Controller_list']['parameters']['query']>;

/** 상품 목록 응답입니다. */
export type ProductListResponse = components['schemas']['V1ProductPageResponse'];
