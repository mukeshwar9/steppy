export class ProviderPermissionDeniedError extends Error { readonly code = "PROVIDER_PERMISSION_DENIED"; }
export class ProviderRateLimitedError extends Error { readonly code = "PROVIDER_RATE_LIMITED"; }
export class ProviderTokenExpiredError extends Error { readonly code = "PROVIDER_TOKEN_EXPIRED"; }
export class HistoricalImportError extends Error { readonly code = "HISTORICAL_IMPORT_FAILED"; }
