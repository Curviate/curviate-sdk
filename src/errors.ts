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
 * `BANNED_ENV_PREFIX`, protected-account and substrate-internal codes) are
 * deliberately excluded.
 *
 * The test for "does a caller ever see it" is the DECODE PATH, not intuition:
 * a code returned by any `/v1` route, the `/v1` catch-all, or a shared handler
 * one of them calls reaches this transport, and anything missing from this
 * array is erased to `INTERNAL` on the way out. Twenty-one codes were in that
 * position and are now carried (see the block at the end of the array).
 * `ADMIN_BYPASS` was even cited here as an example of an unreachable code
 * while being constructed at nine sites inside the versioned billing
 * endpoints, which is exactly the mistake the decode-path test avoids.
 *
 * What remains excluded are codes with no request to answer at all: the
 * boot-time environment refusal (`BANNED_ENV_PREFIX`, raised before the
 * process serves anything) and the browser-approval exchange the CLI's own
 * `setup` command consumes directly, which is not on the documented REST
 * surface and no SDK method reaches.
 *
 * The taxonomy tracks what deployments can actually emit, which is not the same
 * as what the newest one emits. A code the API has stopped returning is removed
 * eventually, because a dead code in the union tells a caller to branch on
 * something that cannot arrive, but not in the release that stops returning
 * it, because a client is pointed at a deployment, not at a changelog. Removing
 * a code the caller's deployment still sends is worse than carrying a dead one:
 * the refusal arrives as `INTERNAL` and reads as a server fault.
 *
 * So a retirement is two steps. First `@deprecated`, kept exported, with the
 * replacement named. Then removed, in the first release after every deployment
 * carries the new contract. `TIER_NOT_ACTIVE` and `PREMIUM_CONFLICT` are at
 * step one as of 0.30.0.
 *
 * A code the API NEVER emitted is a different case and goes immediately, since
 * no deployment can be sending it: `RATE_LIMITED` went that way in 0.30.0.
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
  // `cache_only` is the mode that raises it; re-read with `refill` or `auto`.
  "NOT_STORED",
  "RESOURCE_ACCESS_RESTRICTED",
  // Search filter resolution: a plain-string filter value matched several
  // LinkedIn taxonomy options and one has to be picked (422). The body carries
  // `unresolved[]` naming every offending field with its candidate ids, plus a
  // `next_action` sentence. user_fixable, never retryable as sent; re-send
  // with a chosen id.
  "FILTER_CANDIDATES_REQUIRED",
  // Entitlement gating. THREE INDEPENDENT REFUSALS, three codes, three
  // different remedies. Read the code, never the message, to tell them apart:
  //
  // - `NO_ACTIVE_SEAT`: this Curviate tenant has no active paid seat covering
  //   the account. The remedy is billing, inside Curviate. There is no product
  //   tier to buy: one paid seat entitles every operation, so nothing here
  //   names a tier or asks for an upgrade.
  // - `LINKEDIN_FEATURE_NOT_SUBSCRIBED`: the seat is fine, but the LinkedIn
  //   account itself lacks the LinkedIn subscription the operation needs
  //   (Sales Navigator, Recruiter). The remedy is on LinkedIn, not in
  //   Curviate, and no amount of Curviate billing lifts it.
  // - `BETA_NOT_ENABLED`: the operation is beta-gated and this tenant has not
  //   consented to beta. The remedy is a human enabling beta in the dashboard,
  //   or the per-request `X-Curviate-Beta` header. Nothing is wrong with the
  //   seat or the LinkedIn subscription.
  //
  // All three are 403 and all three are user_fixable, which is exactly why the
  // code has to carry the distinction: the messages read alike and the fixes
  // are in three different systems.
  "NO_ACTIVE_SEAT",
  "LINKEDIN_FEATURE_NOT_SUBSCRIBED",
  "BETA_NOT_ENABLED",

  /**
   * @deprecated Replaced by {@link NO_ACTIVE_SEAT}. Product tiers are retired,
   * so no refusal names one any more.
   *
   * STILL EXPORTED ON PURPOSE, and this is not a courtesy: API deployments
   * that predate the seat-based entitlement rollout still emit this code, and
   * a client that stopped recognising it would decode it to `INTERNAL`: a
   * fixable billing refusal arriving as a server fault, against the very
   * deployments most likely to send it. It is withdrawn in the first release
   * after every deployment carries the new contract.
   *
   * Handle both while that is true: `NO_ACTIVE_SEAT` from a current
   * deployment, this from an older one. They mean the same thing to a caller.
   */
  "TIER_NOT_ACTIVE",
  // Rate limits
  "RATE_LIMIT_ACCOUNT",
  "RATE_LIMIT_TENANT",
  "PLATFORM_RATE_LIMIT",
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
  /**
   * @deprecated Withdrawn with no replacement. The one-premium conflict it
   * reported cannot be expressed on the current input, because
   * `linkedin_premium` is single-valued.
   *
   * STILL EXPORTED for the same reason as {@link TIER_NOT_ACTIVE}: deployments
   * that predate the connect rework can still emit it, and dropping it early
   * would turn a fixable refusal into `INTERNAL` on exactly those. Withdrawn
   * in the first release after every deployment carries the new contract.
   */
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
  // ── Codes that used to collapse to INTERNAL ──────────────────────────────
  //
  // Every code below is returned by a `/v1` route, the `/v1` catch-all, or a
  // shared handler one of them calls. Because this union did not carry them,
  // the transport decoded each to `INTERNAL`: a refusal the caller could
  // usually fix arrived looking like a server fault, with no `switch` arm
  // possible and nothing but `retryLikelyToSucceed` left to branch on. They
  // are grouped by what a caller does about them rather than by HTTP status.

  // Routing. A path this API does not serve, which is also what a mistyped
  // URL returns, so check the path shape before the ids.
  "NOT_FOUND",

  // The reaction you asked to remove is not on that post (422). Not a
  // transport failure and not a bad id shape: re-read the post's reactions
  // before retrying.
  "REACTION_NOT_FOUND",

  // Upstream failures on the connect and billing paths. All transient in the
  // ordinary sense (502/503 from a dependency), so a retry is reasonable.
  "SUBSTRATE_LINK_FAILED",
  "SUBSTRATE_CAP_REACHED",
  "BILLING_CHECKOUT_FAILED",
  "BILLING_PORTAL_UNAVAILABLE",

  // Tenant standing. The workspace's billing state forbids the operation
  // (delinquent, disputed, linking switched off). The remedy is in billing,
  // and none of these clears on retry.
  "ACCOUNT_DISPUTED",
  "ACCOUNT_LINKING_DISABLED",
  "PERIOD_LOCKED",

  // Seat and subscription state conflicts. The request is well formed and the
  // target is in a state that refuses it, so read the state before resending.
  "SEAT_NOT_EMPTY",
  "SEAT_PROVISIONAL",
  "SUBSCRIPTION_ALREADY_EXISTS",
  "ALREADY_CANCELLED",
  "CANCELLATION_ALREADY_EFFECTIVE",
  "INVALID_CANCELLATION_SOURCE",

  // Free-trial limits and the trial abuse gate. `TRIAL_EXPIRED` is the 402;
  // the rest are 409/422 refusals on connect. All user_fixable, none
  // retryable as sent.
  "TRIAL_EXPIRED",
  "TRIAL_SEAT_LIMIT",
  "TRIAL_ACTIVE_SEAT_LIMIT",
  "TRIAL_IDENTITY_ALREADY_USED",
  "TRIAL_IDENTITY_UNRESOLVED",

  // Admin-tenant refusal (400): an admin workspace has no Stripe billing, so
  // the billing operations do not apply to it. Documented here because it is
  // returned by `/v1` billing routes at nine sites; it was previously cited
  // in this file as a code that never reaches a caller, which was wrong.
  "ADMIN_BYPASS",

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
