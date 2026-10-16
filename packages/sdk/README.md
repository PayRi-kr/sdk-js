# @payri/sdk

PayRi 결제 API, 앱 라이선스 확인, 웹훅 검증을 위한 JavaScript·TypeScript SDK입니다.

Node.js 20 이상과 브라우저·엣지 런타임에서 사용할 수 있으며 런타임 의존성이 없습니다.

## 설치

```sh
npm install @payri/sdk
```

## 구성

| 클라이언트 | 사용 위치 | 용도 |
| --- | --- | --- |
| `Payri` | 비밀 API 키를 보관하는 서버 | 상품·체크아웃·주문·구독·환불 요청·라이선스 관리 |
| `PayriLicensing` | 브라우저·데스크톱 앱 | API 키 없이 제품 라이선스를 확인하고 활성화 |
| `Webhooks` | 웹훅을 받는 서버 | 원본 요청 서명 검증, 이벤트 처리, 라이선스 발급 응답 |

## 빠른 시작

서버에서 결제 세션을 만들고 응답의 `url`로 구매자를 이동시켜주세요.

```ts
import { Payri } from '@payri/sdk';

export async function createCheckoutSession() {
  const payri = new Payri({
    apiKey: process.env.PAYRI_API_KEY!,
  });

  const session = await payri.checkout.sessions.create({
    productId: process.env.PAYRI_PRODUCT_ID!,
    successUrl: process.env.PAYRI_SUCCESS_URL!,
    cancelUrl: process.env.PAYRI_CANCEL_URL!,
  });

  return { url: session.url };
}
```

API 키는 비밀 키이므로 서버 환경 변수에만 보관하고 브라우저나 앱에는 넣지 말아주세요.

## 문서

자세한 사용법은 [JavaScript SDK 안내](https://docs.payri.kr/developers/sdk/js)와 [PayRi 개발자 문서](https://docs.payri.kr)를 참고해주세요.

## 라이선스

Apache-2.0
