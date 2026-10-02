/** Error codes the /api/ask route can return. Shared by server and client. */
export type ApiErrorCode =
  | "bad_request"
  | "rate_limited"
  | "overloaded"
  | "config"
  | "invalid_key"
  | "upstream";

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string } };

/** Response headers the API sets on a successful stream. */
export const MODEL_HEADER = "X-Model";
export const FALLBACK_HEADER = "X-Model-Fallback";
export const ATTEMPTS_HEADER = "X-Model-Attempts";
