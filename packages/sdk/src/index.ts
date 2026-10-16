export { DEFAULT_BASE_URL, Payri } from './payri.js';
export type { PayriOptions, FetchLike, RequestOptions, PostRequestOptions } from './payri.js';
export { PayriLicensing } from './licensing.js';
export type {
  PayriLicensingOptions,
  VerifyLicenseParams,
  ActivateLicenseParams,
  DeactivateLicenseParams,
} from './licensing.js';

export { Products } from './resources/products.js';
export { Checkout, CheckoutSessions } from './resources/checkout.js';
export { Orders } from './resources/orders.js';
export { Subscriptions } from './resources/subscriptions.js';
export { PortalSessions } from './resources/portal-sessions.js';
export { RefundRequests } from './resources/refund-requests.js';
export { Licenses } from './resources/licenses.js';

export {
  PayriError,
  PayriApiError,
  PayriAuthError,
  PayriRateLimitError,
  PayriConnectionError,
  PayriWebhookError,
  PayriLicenseSignatureError,
} from './errors.js';
export type {
  PayriErrorCode,
  PayriKnownErrorCode,
  ApiErrorDetails,
  ValidationErrorField,
  ValidationErrorDetails,
  ScopeMissingErrorDetails,
  WebhookVerificationFailureReason,
  PayriLicenseSignatureFailureReason,
} from './errors.js';

export { Webhooks, DEFAULT_WEBHOOK_TOLERANCE_SECONDS } from './webhooks.js';
export type {
  WebhookSecret,
  WebhookHeaders,
  WebhookOptions,
  HandleWebhookOptions,
  WebhookHandlerOptions,
  WebhookHandlerResult,
} from './webhooks.js';

export * from './types/index.js';
