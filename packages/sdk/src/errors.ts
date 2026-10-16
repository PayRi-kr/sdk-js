import type { ApiKeyScope } from './types/common.js';
import type { components } from './generated/v1.js';
import type { PayriKnownErrorCode } from './generated/spec-extensions.js';

export type { PayriKnownErrorCode } from './generated/spec-extensions.js';

/** PayRi SDK의 모든 오류 기반 클래스입니다. */
export class PayriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type PayriErrorCode = PayriKnownErrorCode | (string & {});

/** API 오류 응답의 세부 정보입니다. */
export type ApiErrorDetails = NonNullable<components['schemas']['ApiError']['details']>;

/** VALIDATION_FAILED 오류의 details 형태입니다. */
export type ValidationErrorDetails = Extract<ApiErrorDetails, { fields: unknown }>;

/** VALIDATION_FAILED details.fields에 포함되는 항목입니다. */
export type ValidationErrorField = ValidationErrorDetails['fields'][number];

/** API_KEY_SCOPE_MISSING details의 필수 API scope 목록입니다. */
export type ScopeMissingErrorDetails = Omit<Extract<ApiErrorDetails, { required: unknown }>, 'required'> & {
  required: ApiKeyScope[];
};

/** HTTP API 오류 응답을 나타냅니다. */
export class PayriApiError extends PayriError {
  readonly status: number;
  readonly code: PayriErrorCode;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    options: {
      code?: PayriErrorCode;
      details?: unknown;
      requestId?: string | null;
      body?: unknown;
    } = {},
  ) {
    super(message);
    this.status = status;
    this.code = options.code ?? 'UNKNOWN_ERROR';
    this.details = options.details ?? null;
    this.requestId = options.requestId ?? null;
    this.body = options.body ?? null;
  }
}

/** 인증 실패 응답을 나타냅니다. */
export class PayriAuthError extends PayriApiError {}

/** 요청 제한 응답과 재시도 대기 시간을 나타냅니다. */
export class PayriRateLimitError extends PayriApiError {
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    message: string,
    options: ConstructorParameters<typeof PayriApiError>[2] & { retryAfterSeconds?: number | null } = {},
  ) {
    super(status, message, options);
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

/** 네트워크 실패 또는 요청 시간 초과를 나타냅니다. */
export class PayriConnectionError extends PayriError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export type WebhookVerificationFailureReason =
  | 'MISSING_REQUIRED_HEADERS'
  | 'NO_MATCHING_SIGNATURE'
  | 'INVALID_SIGNATURE'
  | 'TIMESTAMP_TOO_OLD'
  | 'TIMESTAMP_TOO_NEW'
  | 'INVALID_PAYLOAD'
  | 'INVALID_SECRET';

const WEBHOOK_MESSAGES: Record<WebhookVerificationFailureReason, string> = {
  MISSING_REQUIRED_HEADERS: '필수 웹훅 헤더가 누락되었습니다.',
  NO_MATCHING_SIGNATURE: '일치하는 웹훅 서명을 찾을 수 없습니다.',
  INVALID_SIGNATURE: '웹훅 서명이 유효하지 않습니다.',
  TIMESTAMP_TOO_OLD: '웹훅 타임스탬프가 허용 시간을 초과했습니다.',
  TIMESTAMP_TOO_NEW: '웹훅 타임스탬프가 미래 시간으로 설정되어 있습니다.',
  INVALID_PAYLOAD: '웹훅 페이로드를 파싱하지 못했습니다.',
  INVALID_SECRET: '웹훅 시크릿 형식이 올바르지 않습니다.',
};

/** 웹훅 서명 검증 실패 사유를 나타냅니다. */
export class PayriWebhookError extends PayriError {
  readonly reason: WebhookVerificationFailureReason;

  constructor(reason: WebhookVerificationFailureReason) {
    super(WEBHOOK_MESSAGES[reason]);
    this.reason = reason;
  }
}

export type PayriLicenseSignatureFailureReason =
  | 'MISSING_SIGNATURE'
  | 'UNKNOWN_KEY_ID'
  | 'INVALID_SIGNATURE'
  | 'INVALID_RESPONSE'
  | 'NONCE_MISMATCH'
  | 'RESPONSE_EXPIRED';

const LICENSE_SIGNATURE_MESSAGES: Record<PayriLicenseSignatureFailureReason, string> = {
  MISSING_SIGNATURE: '라이선스 응답 서명이 없거나 형식이 올바르지 않습니다.',
  UNKNOWN_KEY_ID: '라이선스 응답 서명 키를 확인할 수 없습니다.',
  INVALID_SIGNATURE: '라이선스 응답 서명을 검증하지 못했습니다.',
  INVALID_RESPONSE: '라이선스 응답 형식이 올바르지 않습니다.',
  NONCE_MISMATCH: '라이선스 응답 nonce가 요청과 일치하지 않습니다.',
  RESPONSE_EXPIRED: '라이선스 응답 발급 시간이 허용 범위를 벗어났습니다.',
};

/** 라이선스 응답 서명 또는 응답 무결성 검증 실패를 나타냅니다. */
export class PayriLicenseSignatureError extends PayriError {
  readonly reason: PayriLicenseSignatureFailureReason;

  constructor(reason: PayriLicenseSignatureFailureReason) {
    super(LICENSE_SIGNATURE_MESSAGES[reason]);
    this.reason = reason;
  }
}
