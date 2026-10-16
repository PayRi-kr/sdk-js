import type { components, operations } from '../generated/v1.js';

/** 서버 라이선스 응답의 활성화 정보입니다. */
export type LicenseActivation = components['schemas']['V1LicenseActivation'];

/** 앱 라이선스 응답의 활성화 정보입니다. */
export type LicenseAppActivation = components['schemas']['V1LicenseAppActivation'];

/** 서버 라이선스 응답입니다. */
export type License = components['schemas']['V1LicenseResponse'];

/** 서버 라이선스 상태입니다. */
export type LicenseStatus = License['status'];

/** 라이선스 앱 확인 응답에 사용할 상태입니다. */
export type LicenseCheckStatus = components['schemas']['V1LicenseAppResponse']['status'];

/** 라이선스 목록 요청 옵션입니다. */
export type LicenseListParams = NonNullable<operations['LicenseV1Controller_list']['parameters']['query']>;

/** 라이선스 목록 응답입니다. */
export type LicenseListResponse = components['schemas']['V1LicensePageResponse'];

/** 라이선스 앱의 확인 결과입니다. */
export type LicenseCheckResult = components['schemas']['V1LicenseAppResponse'];
