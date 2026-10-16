import type { components } from '../generated/v1.js';

/** 라이브 또는 테스트 모드입니다. */
export type Mode = components['schemas']['V1ProductResponse']['mode'];

/** API 키에 부여할 수 있는 권한 scope입니다. */
export type { ApiKeyScope } from '../generated/spec-extensions.js';

/** 지원하는 통화입니다. */
export type Currency = components['schemas']['V1OrderResponse']['currency'];

/** 구독 결제 주기입니다. */
export type BillingInterval = components['schemas']['V1PlanInterval']['billingInterval'];

/** 페이지 단위 목록 응답입니다. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** 페이지 단위 목록 요청 옵션입니다. */
export interface PaginationParams {
  page?: number;
  /** 기본 20, 최대 100입니다. */
  limit?: number;
}

/** HTTP 쿼리 문자열에 직렬화할 수 있는 값입니다. */
export type QueryValue = string | number | boolean | Date | undefined;
