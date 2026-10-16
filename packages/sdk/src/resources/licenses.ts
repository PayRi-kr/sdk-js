import type { HttpClient } from '../internal/http-client.js';
import type { License, LicenseListParams, LicenseListResponse } from '../types/licenses.js';

/** 서버 API 키로 라이선스 발급 정보를 조회합니다. */
export class Licenses {
  constructor(private readonly http: HttpClient) {}

  /** 라이선스 목록을 조회합니다. */
  list(params: LicenseListParams = {}): Promise<LicenseListResponse> {
    return this.http.request({ method: 'GET', path: '/v1/licenses', query: { ...params } });
  }

  /** 라이선스를 조회합니다. */
  retrieve(id: string): Promise<License> {
    return this.http.request({ method: 'GET', path: `/v1/licenses/${encodeURIComponent(id)}` });
  }
}
