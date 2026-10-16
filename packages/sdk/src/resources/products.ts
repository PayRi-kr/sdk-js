import type { HttpClient } from '../internal/http-client.js';
import type { Product, ProductListParams, ProductListResponse } from '../types/products.js';

/** 상품 목록과 상세 조회를 제공합니다. */
export class Products {
  constructor(private readonly http: HttpClient) {}

  /** 상품 목록을 조회합니다. */
  list(params: ProductListParams = {}): Promise<ProductListResponse> {
    return this.http.request({ method: 'GET', path: '/v1/products', query: { ...params } });
  }

  /** 상품을 조회합니다. */
  retrieve(id: string): Promise<Product> {
    return this.http.request({ method: 'GET', path: `/v1/products/${encodeURIComponent(id)}` });
  }
}
