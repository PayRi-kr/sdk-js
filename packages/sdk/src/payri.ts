import { PayriError } from './errors.js';
import { HttpClient, type PostRequestOptions, type RequestOptions } from './internal/http-client.js';
import { DEFAULT_BASE_URL } from './internal/constants.js';
import type { FetchLike } from './internal/runtime.js';
import { Checkout } from './resources/checkout.js';
import { Licenses } from './resources/licenses.js';
import { Orders } from './resources/orders.js';
import { PortalSessions } from './resources/portal-sessions.js';
import { Products } from './resources/products.js';
import { RefundRequests } from './resources/refund-requests.js';
import { Subscriptions } from './resources/subscriptions.js';

export { DEFAULT_BASE_URL } from './internal/constants.js';

/** Payri 서버 클라이언트 설정입니다. */
export interface PayriOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  dangerouslyAllowBrowser?: boolean;
  /** 키 회전 유예 만료 시각을 클라이언트당 한 번 전달합니다. */
  onKeyDeprecated?: (expiresAt: string) => void;
}

/** 비밀 API 키로 PayRi 서버 API를 호출합니다. */
export class Payri {
  readonly products: Products;
  readonly checkout: Checkout;
  readonly orders: Orders;
  readonly subscriptions: Subscriptions;
  readonly portalSessions: PortalSessions;
  readonly refundRequests: RefundRequests;
  readonly licenses: Licenses;
  private readonly http: HttpClient;

  constructor(options: PayriOptions) {
    if (!options.apiKey) throw new PayriError('apiKey가 필요합니다.');
    if (!/^pyr_(live|test)_[0-9A-Za-z]{38}$/.test(options.apiKey)) {
      throw new PayriError('apiKey 형식이 올바르지 않습니다. pyr_live_ 또는 pyr_test_ 로 시작하는 API 키를 사용해주세요.');
    }
    const isBrowser = typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined';
    if (isBrowser && options.dangerouslyAllowBrowser !== true) {
      throw new PayriError('API 키는 비밀키라 브라우저에 노출하면 안 됩니다. 라이선스 확인은 PayriLicensing을 사용해주세요.');
    }

    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries ?? 2,
      autoIdempotencyKey: true,
      onKeyDeprecated: options.onKeyDeprecated,
    });
    this.products = new Products(this.http);
    this.checkout = new Checkout(this.http);
    this.orders = new Orders(this.http);
    this.subscriptions = new Subscriptions(this.http);
    this.portalSessions = new PortalSessions(this.http);
    this.refundRequests = new RefundRequests(this.http);
    this.licenses = new Licenses(this.http);
  }

  /** SDK에서 제공하지 않는 API를 같은 인증과 오류 처리로 호출합니다. */
  request<T = unknown>(options: RequestOptions): Promise<T> {
    return this.http.request<T>(options);
  }
}

export type { FetchLike, PostRequestOptions, RequestOptions };
