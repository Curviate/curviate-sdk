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
  // A read found nothing in Curviate's store and its mode may not fetch, so it
  // refused rather than reaching LinkedIn. 422, and NOT RESOURCE_NOT_FOUND: the
  // resource may be perfectly real, so the fix is another mode, not another id.
  // Absent from RETRYABLE_CODES on purpose, nothing about the answer changes
  // until the caller picks one.
  //
  // `cache_only` is the mode that raises it, and re-reading with `refill` or
  // `auto` is the documented remedy. `refill` can raise it too, but only where
  // there is nothing for it to fill: a listing with no stable order has no
  // absent state, so "fetch once when nothing is stored" would fetch every
  // time. None of the reads that take these parameters is such a listing.
  "NOT_STORED",
  "RESOURCE_ACCESS_RESTRICTED",
  // Search filter resolution: a plain-string filter value matched several
  // LinkedIn taxonomy options and one has to be picked (422). The body carries
  // `unresolved[]` naming every offending field with its candidate ids, plus a
  // `next_action` sentence. user_fixable, never retryable as sent; re-send
  // with a chosen id.
  "FILTER_CANDIDATES_REQUIRED",
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
  // Curviate's OWN account-safety ceiling, not a request-rate limit and not
  // LinkedIn refusing. A 429 that never reached LinkedIn and spent nothing:
  // the budget row named by `budgetRow` is at the ceiling configured on
  // `PATCH /v1/{account_id}/safety-policy`, or the account is outside its
  // activity window. Deliberately absent from RETRYABLE_CODES: a monthly
  // row's reset can be weeks out, so backing off is the wrong recovery.
  // Read `resetAt`, `safetyReason` and `safetyHint` instead.
  "BUDGET_EXHAUSTED",
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
  // LinkedIn allows only one session at a time for some accounts, so a person
  // signing in elsewhere breaks this one. A 401 like LINKEDIN_AUTH_FAILED and a
  // separate code because the remedy differs and the auth one prescribes the
  // wrong remedy: reconnecting does nothing while the other session is open.
  // user_fixable, never retryable: a person has to close the other session.
  // While it lasts, `account_states` on the account resource carries
  // `recruiter_session_evicted`.
  "LINKEDIN_SESSION_EVICTED",
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

/**
 * Which safety rule refused, on a `BUDGET_EXHAUSTED`. Wire field `reason`.
 *
 * `ceiling`: the row's configured limit is spent; wait until
 * {@link CurviateError.resetAt} or raise the limit.
 * `activity_window`: the account is outside the hours it works in; `resetAt`
 * is when the window next opens.
 *
 * The two need different fixes, which is why this is a field rather than
 * something to read out of the message.
 */
export type SafetyReason = "ceiling" | "activity_window";

/**
 * The exact setting to change to lift a `BUDGET_EXHAUSTED`, as data rather
 * than as prose. Wire field `hint`.
 *
 * `parameter` is addressable on `PATCH /v1/{account_id}/safety-policy` (for
 * example `profile_views.ceiling`, or `posture` where no ceiling can be
 * raised), so an agent can choose between waiting, escalating to a human and
 * reconfiguring without parsing `message`.
 */
export interface SafetyHint {
  parameter: string;
  message: string;
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
  /**
   * The account-safety budget row this response names. Wire field `row`.
   *
   * TWO CODES CARRY IT AND THEY MEAN DIFFERENT THINGS. Read {@link
   * CurviateErrorInit.code} to tell them apart:
   *
   * - `PLATFORM_RATE_LIMIT`: the row is PAUSED. LinkedIn refused a recent call
   *   on it, so this one was refused locally without reaching LinkedIn. The
   *   pause is scoped to this row on this account and every other row keeps
   *   working, so the recovery is to switch work, never to retry this row
   *   before {@link CurviateErrorInit.retryAfterSeconds} elapses, because retrying
   *   into a LinkedIn rate limit is what escalates it into a restriction.
   * - `BUDGET_EXHAUSTED`: the row hit the CEILING you configured, or the
   *   account is outside its activity window. Nothing reached LinkedIn and
   *   nothing was spent. Wait until {@link CurviateErrorInit.resetAt} or
   *   change {@link CurviateErrorInit.safetyHint}'s parameter.
   *
   * Either way the SDK never auto-retries a response carrying this field.
   */
  budgetRow?: string;
  /**
   * Seconds until the PAUSED {@link CurviateErrorInit.budgetRow} is usable
   * again, on a `PLATFORM_RATE_LIMIT`. Wire field `retry_after`.
   *
   * A SEPARATE FIELD FROM {@link CurviateErrorInit.retryAfterMs}, on purpose.
   * `retryAfterMs` is the transport's own sleep budget and is acted on
   * automatically; this one is informational, because a pause can last an hour
   * and sleeping that inside a call is a hang. Switch to other work and come
   * back after this many seconds.
   */
  retryAfterSeconds?: number;
  /**
   * When the exhausted {@link CurviateErrorInit.budgetRow} frees up, on a
   * `BUDGET_EXHAUSTED`. Wire field `reset_at`.
   *
   * An absolute ISO-8601 instant rather than a duration, so it stays true
   * however long you hold it. It is the window roll on a spent ceiling and the
   * next window open on an activity-window refusal.
   *
   * `null`, present rather than absent, in exactly two cases where no clock
   * frees the account: the `pending_invites` row, whose backlog falls when
   * invitations are accepted or withdrawn rather than at any window boundary,
   * and an InMail CREDIT exhaustion (`row: inmail`), which LinkedIn regrants on
   * a schedule this product cannot read. Null-check it before scheduling on it.
   */
  resetAt?: string | null;
  /** The settable parameter that would lift a `BUDGET_EXHAUSTED`. Wire field `hint`. */
  safetyHint?: SafetyHint;
  /** Which safety rule refused, on a `BUDGET_EXHAUSTED`. Wire field `reason`. */
  safetyReason?: SafetyReason;
  /**
   * Whether the action was refused. Wire field `blocked`; always `true` here,
   * because an error means it did not happen and spent nothing.
   *
   * The same payload with `blocked: false` rides the SUCCESS body of an account
   * on the default `warn` posture, under `safety_warning`, and is otherwise
   * field-identical, so one branch of your code handles both postures and
   * moving an account to `enforce` is not a breaking change.
   */
  blocked?: boolean;
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
  budgetRow?: string;
  retryAfterSeconds?: number;
  resetAt?: string | null;
  safetyHint?: SafetyHint;
  safetyReason?: SafetyReason;
  blocked?: boolean;
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
  /** The budget row this response names. See {@link CurviateErrorInit.budgetRow}. */
  readonly budgetRow: string | undefined;
  /** Seconds until a paused row lifts. See {@link CurviateErrorInit.retryAfterSeconds}. */
  readonly retryAfterSeconds: number | undefined;
  /** When the refusal lifts; `null` on the gauge and on InMail credits. See {@link CurviateErrorInit.resetAt}. */
  readonly resetAt: string | null | undefined;
  /** The settable parameter that would lift the refusal. See {@link CurviateErrorInit.safetyHint}. */
  readonly safetyHint: SafetyHint | undefined;
  /** Which safety rule refused. See {@link CurviateErrorInit.safetyReason}. */
  readonly safetyReason: SafetyReason | undefined;
  /** Whether the action was refused. See {@link CurviateErrorInit.blocked}. */
  readonly blocked: boolean | undefined;

  constructor(init: CurviateErrorInit) {
    super(init.message);
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.retryHint = init.retryHint ?? null;
    this.userFixable = init.userFixable;
    this.retryLikelyToSucceed = init.retryLikelyToSucceed;
    this.requiredTier = init.requiredTier;
    this.retryAfterMs = init.retryAfterMs;
    this.budgetRow = init.budgetRow;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.resetAt = init.resetAt;
    this.safetyHint = init.safetyHint;
    this.safetyReason = init.safetyReason;
    this.blocked = init.blocked;
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
    if (this.budgetRow !== undefined) json.budgetRow = this.budgetRow;
    if (this.retryAfterSeconds !== undefined) json.retryAfterSeconds = this.retryAfterSeconds;
    // `resetAt` is null-BEARING: null says "no clock frees this" (the
    // pending_invites gauge, or an InMail credit exhaustion), which is a
    // different fact from the field being absent. Guard on undefined, not on
    // falsiness.
    if (this.resetAt !== undefined) json.resetAt = this.resetAt;
    if (this.safetyHint !== undefined) json.safetyHint = this.safetyHint;
    if (this.safetyReason !== undefined) json.safetyReason = this.safetyReason;
    if (this.blocked !== undefined) json.blocked = this.blocked;
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
