import type { components, operations } from '../generated/v1.js';

/** 환불 요청 응답입니다. */
export type RefundRequest = components['schemas']['V1RefundRequestResponse'];

/** 환불 요청 상태입니다. */
export type RefundRequestStatus = RefundRequest['status'];

/** 환불 요청 종류입니다. */
export type RefundRequestKind = RefundRequest['kind'];

/** 환불 요청 경고입니다. */
export type RefundRequestWarning = components['schemas']['V1Warning'];

/** 환불 요청 경고 코드입니다. */
export type RefundRequestWarningCode = RefundRequestWarning['code'];

/** 환불 요청 승인·거절·보류 결과입니다. */
export type RefundRequestActionResult = components['schemas']['V1RefundActionResponse'];

/** 환불 요청 목록 요청 옵션입니다. */
export type RefundRequestListParams = NonNullable<operations['RefundRequestsV1Controller_list']['parameters']['query']>;

/** 환불 요청 승인 매개변수입니다. */
export type RefundRequestApproveParams = components['schemas']['V1RefundRequestApproveDto'];

/** 환불 요청 거절 매개변수입니다. */
export type RefundRequestRejectParams = components['schemas']['V1RefundRequestRejectDto'];

/** 환불 요청 보류 매개변수입니다. */
export type RefundRequestHoldParams = components['schemas']['V1RefundRequestHoldDto'];

/** 환불 요청 목록 응답입니다. */
export type RefundRequestListResponse = components['schemas']['V1RefundRequestPageResponse'];
