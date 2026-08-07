/**
 * Typed error model for the Curviate SDK.
 *
 * `CurviateError` is the single thrown type for every API-layer failure. Its
 * `code` is one of the stable, flat `ErrorCode` values; agent builders can
 * write an exhaustive `switch (error.code)` without fear of unknown codes.
 *
 * Credential safety: a `CurviateError` never holds a reference to the client
 * or the apiKey, and its serialized form (`JSON.stringify`) contains neither
 * the key nor the `Bearer` scheme. The `message` is derived from the API
 * response body only.
 *
 * The webhook-receiving surface (`constructEvent`, `CurviateEvent`,
 * `WebhookSignatureError`) is exported separately from `webhooks.ts`.
 */

/**
 * The complete set of error codes observable by API callers, the single
 * source of truth for the SDK's error taxonomy.
 *
 * Both the {@link ErrorCode} type (what a caller narrows on) and the runtime
 * {@link KNOWN_ERROR_CODES} membership set (what the transport recognizes on the
 * wire) are DERIVED from this one array. Adding a code here adds it to both, so
 * the type and the runtime decoder can never drift apart; a wire code present
 * in the type is guaranteed to be decoded to itself rather than downgraded to
 * `INTERNAL`.
 *
 * This mirrors the server's error taxonomy (the customer-observable subset).
 * The string literals are copied here intentionally; the SDK has no dependency
 * on any private package. Internal-only codes that never reach a caller (e.g.
 * `BANNED_ENV_PREFIX`, `ADMIN_BYPASS`, protected-account and substrate-internal
 * codes) are deliberately excluded.
 *
 * The taxonomy is additive-only: new codes may be appended, existing ones are
 * never removed or renamed.
 */
export const ERROR_CODES = [
  // Authentication / authorization
  "UNAUTHORIZED",
  "INVALID_REQUEST",
  "UNSUPPORTED_MEDIA_TYPE",
  "PAYLOAD_TOO_LARGE",
  // Account state
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_RESTRICTED",
  // Duplicate connect: reconnect or adopt the existing account instead of
  // linking again. Not retryable.
  "ACCOUNT_ALREADY_LINKED",
  "RESOURCE_NOT_FOUND",
  "RESOURCE_ACCESS_RESTRICTED",
  // Tier / subscription gating
  "TIER_NOT_ACTIVE",
  "LINKEDIN_FEATURE_NOT_SUBSCRIBED",
  // Rate limits
  "RATE_LIMIT_ACCOUNT",
  "RATE_LIMIT_TENANT",
  "PLATFORM_RATE_LIMIT",
  // LinkedIn-platform-level throttling on the Recruiter / Sales Navigator read
  // surface (carries dedicated RateLimit-Policy / RateLimit / Retry-After
  // response headers). Distinct from the account/tenant/platform trio above.
  // Always retry-safe (retry_likely_to_succeed: true); see RETRYABLE_CODES.
  "RATE_LIMITED",
  // Platform errors
  "PLATFORM_ERROR",
  "PLATFORM_NOT_IMPLEMENTED",
  // Permanent LinkedIn platform limitation for the attempted operation (e.g.
  // listing a non-self user's following list). Not a transient failure,
  // retrying will not help.
  "LINKEDIN_OPERATION_NOT_SUPPORTED",
  // Checkpoint (account connect flow)
  "CHECKPOINT_NOT_FOUND",
  "CHECKPOINT_EXPIRED",
  "CHECKPOINT_INVALID_CODE",
  "CHECKPOINT_MAX_ATTEMPTS",
  "CHECKPOINT_ALREADY_RESOLVED",
  "CHECKPOINT_UNSUPPORTED",
  "CONNECTION_IN_PROGRESS",
  // One-premium boundary rejection: LinkedIn permits only one individual
  // Premium subscription per profile. Surfaces on connect/reconnect (a seat
  // resolving to both premiums) and on the billing seat/tier endpoints (a
  // "naked enable" of one premium while the seat already holds the other).
  // user_fixable, never retryable; the remedy is two seats, or pairing
  // enable with disable of the current premium in one call.
  "PREMIUM_CONFLICT",
  // A reconnect whose seat-derived scope differs from the account's recorded
  // scope was attempted with cookie auth; a cookie replay cannot change
  // scope, so a full credentials re-authentication is required. user_fixable,
  // never retryable.
  "REAUTH_REQUIRED",
  // LinkedIn-specific connect errors
  "LINKEDIN_AUTH_FAILED",
  "LINKEDIN_RATE_LIMITED",
  "LINKEDIN_COOKIE_INVALID",
  "LINKEDIN_SERVICE_UNAVAILABLE",
  // Messaging / connect-request mutation
  "MESSAGE_WINDOW_EXPIRED",
  "RECIPIENT_UNREACHABLE",
  // Duplicate / already-connected connect-request conflict: a send to a
  // recipient who already has a pending request from this account, or is already
  // a first-degree connection. user_fixable, never retryable; do not re-send.
  "CONNECTION_REQUEST_CONFLICT",
  // Billing (surface: tenant-management)
  "PAYMENT_REQUIRED",
  "PAYMENT_FAILED",
  "SUBSCRIPTION_BUSY",
  "SUBSCRIPTION_NOT_FOUND",
  "SEAT_NOT_FOUND",
  "SEAT_CANCELLED",
  // Generic
  "INTERNAL",
] as const;

/**
 * The complete set of error codes observable by API callers.
 *
 * Derived from {@link ERROR_CODES}; an agent builder can write an exhaustive
 * `switch (error.code)` without fear of unknown codes.
 */
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Runtime membership set for {@link ERROR_CODES}. The transport uses it to
 * recognize a wire `code` and decode it to itself instead of downgrading a
 * known code to `INTERNAL`. Built from the same array as {@link ErrorCode}, so
 * the recognized-at-runtime set and the type can never diverge.
 */
export const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * The tiers a caller can be asked to upgrade to, surfaced on `TIER_NOT_ACTIVE`.
 * `sn` and `sales_nav` are both emitted by the API (internal flag key vs.
 * product-facing label).
 *
 * Single source of truth, mirroring {@link ERROR_CODES}: both the
 * {@link RequiredTier} type and the runtime {@link KNOWN_REQUIRED_TIERS}
 * membership set are derived from this one array, so the type a caller
 * narrows on and the set the transport validates a wire value against can
 * never drift apart.
 */
export const REQUIRED_TIERS = ["core", "sn", "sales_nav", "recruiter"] as const;

/**
 * The product tier a caller needs, surfaced on `TIER_NOT_ACTIVE` so an agent
 * can route an upgrade without parsing the message. `sn` and `sales_nav` are
 * both emitted by the API (internal flag key vs. product-facing label).
 */
export type RequiredTier = (typeof REQUIRED_TIERS)[number];

/**
 * Runtime membership set for {@link REQUIRED_TIERS}. The transport uses it to
 * validate a wire `required_tier` value before narrowing it to
 * {@link RequiredTier}, discarding anything unrecognized rather than
 * surfacing a bogus tier.
 */
export const KNOWN_REQUIRED_TIERS: ReadonlySet<string> = new Set(REQUIRED_TIERS);

/** Structured retry guidance attached to retryable errors. */
export interface RetryHint {
  kind: "delay" | "backoff" | "never";
  delayMs?: number;
}

/** Constructor input for {@link CurviateError}. */
export interface CurviateErrorInit {
  code: ErrorCode;
  message: string;
  /** HTTP status from the response; `undefined` for network/transport errors. */
  httpStatus?: number;
  /** `null` when the API response carries no retry hint. */
  retryHint?: RetryHint | null;
  userFixable: boolean;
  retryLikelyToSucceed: boolean;
  /** Present on `TIER_NOT_ACTIVE` only. */
  requiredTier?: RequiredTier;
  /** Milliseconds to wait before retry, parsed from the `Retry-After` response header. */
  retryAfterMs?: number;
}

/** Plain-object shape produced by {@link CurviateError.toJSON}. */
export interface CurviateErrorJSON {
  name: "CurviateError";
  code: ErrorCode;
  message: string;
  httpStatus?: number;
  retryHint: RetryHint | null;
  userFixable: boolean;
  retryLikelyToSucceed: boolean;
  requiredTier?: RequiredTier;
  retryAfterMs?: number;
}

/**
 * The single thrown type for all Curviate API errors.
 *
 * @example
 * try {
 *   await curviate.accounts.list();
 * } catch (err) {
 *   if (isCurviateError(err) && err.code === "RATE_LIMIT_ACCOUNT") {
 *     await sleep(err.retryAfterMs ?? 1000);
 *   }
 * }
 */
export class CurviateError extends Error {
  override readonly name = "CurviateError";
  readonly code: ErrorCode;
  readonly httpStatus: number | undefined;
  readonly retryHint: RetryHint | null;
  readonly userFixable: boolean;
  readonly retryLikelyToSucceed: boolean;
  readonly requiredTier: RequiredTier | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(init: CurviateErrorInit) {
    super(init.message);
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.retryHint = init.retryHint ?? null;
    this.userFixable = init.userFixable;
    this.retryLikelyToSucceed = init.retryLikelyToSucceed;
    this.requiredTier = init.requiredTier;
    this.retryAfterMs = init.retryAfterMs;
    // Maintains a correct prototype chain when targeting ES5-class semantics.
    Object.setPrototypeOf(this, CurviateError.prototype);
  }

  /**
   * Explicit, credential-safe serialization. Only the documented structured
   * fields are emitted, never a credential, auth header, or any reference to
   * the client. `JSON.stringify(error)` calls this automatically.
   */
  toJSON(): CurviateErrorJSON {
    const json: CurviateErrorJSON = {
      name: "CurviateError",
      code: this.code,
      message: this.message,
      retryHint: this.retryHint,
      userFixable: this.userFixable,
      retryLikelyToSucceed: this.retryLikelyToSucceed,
    };
    if (this.httpStatus !== undefined) json.httpStatus = this.httpStatus;
    if (this.requiredTier !== undefined) json.requiredTier = this.requiredTier;
    if (this.retryAfterMs !== undefined) json.retryAfterMs = this.retryAfterMs;
    return json;
  }
}

/**
 * Type guard for narrowing an unknown caught value to {@link CurviateError}.
 *
 * @example
 * catch (err) {
 *   if (isCurviateError(err)) { /* err.code is typed *\/ }
 * }
 */
export function isCurviateError(err: unknown): err is CurviateError {
  return err instanceof CurviateError;
}
