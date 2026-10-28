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

import type { TierFeature, TierName } from "./resources/tier.js";
import type { components } from "./generated/types.js";

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
 * carries the new contract. `TIER_NOT_ACTIVE` and `PREMIUM_CONFLICT` took step
 * one in 0.30.0 and step two in 0.31.0.
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
  // Duplicate connect (409): the LinkedIn identity is already connected. When
  // your own tenant holds it the body carries `account_id`, so reuse that
  // account instead of linking again; when another tenant holds it the body
  // names no account and there is nothing you can manage here. Not retryable.
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

  // Rate limits
  "RATE_LIMIT_ACCOUNT",
  "RATE_LIMIT_TENANT",
  "PLATFORM_RATE_LIMIT",
  // Curviate's OWN account-safety ceiling, not a request-rate limit and not
  // LinkedIn refusing. A 429 that never reached LinkedIn and spent nothing:
  // the budget row named by `budgetRow` is at its ceiling, set by the account's
  // safety policy or else the tenant default (`GET`/`PATCH /v1/safety-policy`),
  // or the account is outside its activity window. Deliberately absent from
  // RETRYABLE_CODES: a monthly row's reset can be weeks out, so backing off
  // is the wrong recovery.
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
  // Connection location (where LinkedIn sees the account connecting from).
  // `CONNECTION_LOCATION_REQUIRED` (400): a new connect named no location, or
  // a PATCH cleared your own proxy (`proxy: null`) without a `country`. Send
  // exactly one of `country`, `ip` or `proxy`. user_fixable, never retryable
  // as sent.
  // `CONNECTION_LOCATION_UNAVAILABLE` (422): no connection is free in that
  // country right now (strict), or the change landed elsewhere. When a change
  // was applied, {@link CurviateError.connectionLocation} says where the
  // account connects from now, which may mean your own proxy is already gone.
  // Try a nearby country, or allow fallback. user_fixable, never retryable as
  // sent.
  "CONNECTION_LOCATION_REQUIRED",
  "CONNECTION_LOCATION_UNAVAILABLE",
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

  // Checkout refused closed (503): Curviate's own seat-price configuration
  // disagrees with the price it displays, so completing checkout would charge
  // an amount you were never shown. A misconfiguration on Curviate's side, not
  // a mistake in the request and not a transient fault: user_fixable false,
  // and a retry fails the same way until Curviate corrects the price. Nothing
  // was charged. Stop and surface it to a human (or support) rather than
  // backing off.
  "STRIPE_DRIFT_DETECTED",

  // Drafts and scheduled posts (`/v1/drafts`). Each is user_fixable and none
  // clears on an unchanged retry; read the code, then change the request.
  //
  // - `DRAFT_LIMIT_REACHED` (422): the bucket (one account, or "no account")
  //   already holds 50 Drafts. Delete one, or use another account.
  // - `MEDIA_QUOTA_EXCEEDED` (422): the file would take the bucket past its
  //   media quota; nothing was stored. Delete media first.
  // - `ACCOUNT_REQUIRED` (422): publishing or scheduling needs an account on the
  //   Draft (also `account_id: null` on a scheduled Draft: unschedule first).
  // - `DRAFT_NOT_PUBLISHABLE` (422): a content gap (empty text, ...); the
  //   message names the field.
  // - `SCHEDULE_CONFLICT` (422): another scheduled Draft on the same account is
  //   within 5 minutes of this `scheduled_at`; the message names it.
  // - `DRAFT_PUBLISHING` (409): a publish of this Draft is in flight (or its
  //   outcome is being settled). Read the Draft again in a few seconds; if it
  //   says to check the account's posts first, do that before retrying.
  "DRAFT_LIMIT_REACHED",
  "MEDIA_QUOTA_EXCEEDED",
  "ACCOUNT_REQUIRED",
  "DRAFT_NOT_PUBLISHABLE",
  "SCHEDULE_CONFLICT",
  "DRAFT_PUBLISHING",
  // Teams and Tiers. Neither clears on a retry; the fix is with a person.
  //
  // - `INSUFFICIENT_ROLE` (403): your role in the team may not do this on an
  //   account a teammate connected.
  // - `TIER_REQUIRED` (403): the team's Tier does not include the feature. The
  //   error body names it (`feature`), the lowest Tier that has it
  //   (`required_tier`) and the Tier the team has (`current_tier`), read as
  //   `feature`, `requiredTier` and `currentTier` on {@link CurviateError}; a
  //   team Owner also gets `upgradeUrl`. When one Account lacks the feature
  //   while the Team has it (an Account on a seat another Team lent this one
  //   carries that seat's Tier), `details.account_id` names it: leave it out,
  //   or ask the Owner who lent the seat. Writes in Drafts, Contacts and
  //   Motions (and Network and Unibox) need Automate; reads, exports, deletes
  //   and stopping running work pass on any Tier.
  "INSUFFICIENT_ROLE",
  "TIER_REQUIRED",
  // - `TEAM_ACCESS_DENIED` (403): the request names a team (the `team` client
  //   option, header `X-Curviate-Team`) this credential cannot act in. An API
  //   key works in exactly one team. Drop the option, or use that team's key.
  // - `ACCOUNT_NOT_SHARED` (403): the person who connected the account turned
  //   its team access off; only they can use it.
  // - `ACCOUNT_OWNER_ONLY` (403): only the person who connected the account can
  //   do this (reconnect it, solve its checkpoints, set its team access).
  "TEAM_ACCESS_DENIED",
  "ACCOUNT_NOT_SHARED",
  "ACCOUNT_OWNER_ONLY",

  // Team members and invites (`teams`), all 409.
  //
  // - `LAST_OWNER`: the team would be left with no Owner.
  // - `BILLING_OWNER_REQUIRED`: the Owner who receives invoices cannot leave, be
  //   demoted or removed until `billing_owner_user_id` names another Owner.
  // - `DEFAULT_TEAM_PROTECTED`: nobody is demoted, removed or leaves their own
  //   default team.
  // - `ALREADY_MEMBER`: the invited email is already a member.
  // - `INVITE_ALREADY_PENDING`: an invite to this email is already pending.
  // - `INVITE_NOT_PENDING`: re-send or revoke of an accepted or revoked invite.
  // - `INVITE_LIMIT_REACHED`: the team already has 50 pending invites.
  "LAST_OWNER",
  "BILLING_OWNER_REQUIRED",
  "DEFAULT_TEAM_PROTECTED",
  "ALREADY_MEMBER",
  "INVITE_ALREADY_PENDING",
  "INVITE_NOT_PENDING",
  "INVITE_LIMIT_REACHED",

  // Connect requests (`connectRequests`), all 409.
  //
  // - `CONNECT_REQUEST_NOT_PENDING`: the request is completed, expired,
  //   cancelled or failed (the message names which). Create a new one.
  // - `CONNECT_REQUEST_IN_USE`: someone is completing it right now. Try again
  //   in a minute.
  // - `LINKEDIN_ACCOUNT_MISMATCH`: a reconnect signed in to a different
  //   LinkedIn account than the one being reconnected. The account is
  //   unchanged.
  "CONNECT_REQUEST_NOT_PENDING",
  "CONNECT_REQUEST_IN_USE",
  "LINKEDIN_ACCOUNT_MISMATCH",

  // Contacts, Contact lists and Tags (`contacts`, `contactLists`, `tags`).
  //
  // - `NAME_TAKEN` (409): another Contact list or Tag already has this name in
  //   any casing. Pick another name, or use the existing one.
  // - `RESOURCE_IN_USE` (409): a live Motion or a running import uses this
  //   list or Tag; the message names them. Finish or archive the Motion, or
  //   wait for the import.
  // - `CONTACT_LIMIT_REACHED` (422): a cap is reached (Contacts, lists or Tags
  //   per team, Tags per Contact); the message names it. Delete some first.
  // - `IMPORT_QUEUE_FULL` (429): 5 background imports are already queued or
  //   running. Retry after one finishes.
  "NAME_TAKEN",
  "RESOURCE_IN_USE",
  "CONTACT_LIMIT_REACHED",
  "IMPORT_QUEUE_FULL",

  // Sequences (`Sequence`, `validateSequence`). `SEQUENCE_INVALID` (422 from
  // the API, or thrown offline by `toDocument()` / `Sequence.fromDocument`):
  // the Sequence document breaks one or more rules. `errors` lists every one
  // (`path`, `rule`, `code`, `pointer`, `hint`, `docs_url`) in step order, so
  // one fix round covers them all. Nothing is saved. user_fixable, never
  // retryable as sent.
  //
  // `SEQUENCE_CONFLICT` (409): `motions.update` sent `if_sequence_revision`
  // and someone saved the Sequence since; nothing is saved. `current` carries
  // the stored document and its `sequence_revision`: merge, or send yours again
  // with that revision to replace it.
  "SEQUENCE_INVALID",
  "SEQUENCE_CONFLICT",

  // Motions and Enrollments (`motions`, `enrollments`).
  //
  // - `MOTION_NOT_STARTABLE` (422): `start` or `resume` found gaps; `errors`
  //   lists every one as `{path, rule}` (a Contact list, a sending account, a
  //   timezone, a Sequence). Fix them and retry.
  // - `MOTION_STATUS_CONFLICT` (409): the operation does not apply in the
  //   Motion's status; the message names it and the operations it allows.
  //   Only a draft can be deleted: archive instead.
  // - `ENROLLMENT_NOT_ACTIVE` (409): the Enrollment's status does not take
  //   this operation (stop and pause: queued, active or paused; events:
  //   active or paused; resume: active, paused or finished, not when the
  //   account or Contact is gone).
  // - `STEP_IN_FLIGHT` (409): a Step of the Enrollment is being sent right
  //   now; pause and reassign wait until it settles. Retry in a minute.
  // - `NOTHING_TO_RETRY` (409, or thrown by `enrollments.retry`): Retry found no
  //   Step whose latest outcome is `failed`; nothing was resumed or sent.
  // - `ACCOUNT_ALREADY_ENGAGED` (409): reassign refused: the Enrollment's
  //   account already did something the Contact can see.
  // - `ALREADY_ENROLLED_ON_ACCOUNT` (409): reassign refused: the target
  //   account already holds this Contact in the Motion, or is its own account.
  // - `KNOWN_CHAT` (409): reassign refused: the Motion excludes known chats
  //   and the Contact already has a chat with your team.
  // - `CONTACT_NOT_ENROLLABLE` (422): adding a Contact to a Motion from a chat
  //   was refused (already enrolled, excluded, in another Motion, filtered).
  // - `CHAT_NOT_ONE_TO_ONE` (422): a Unibox Contact action on a group chat,
  //   or a chat whose counterpart is not a person.
  "MOTION_NOT_STARTABLE",
  "MOTION_STATUS_CONFLICT",
  "ENROLLMENT_NOT_ACTIVE",
  "STEP_IN_FLIGHT",
  "NOTHING_TO_RETRY",
  "ACCOUNT_ALREADY_ENGAGED",
  "ALREADY_ENROLLED_ON_ACCOUNT",
  "KNOWN_CHAT",
  "CONTACT_NOT_ENROLLABLE",
  "CHAT_NOT_ONE_TO_ONE",

  // Dashboard v2 surface.
  //
  // - `CHAT_NOT_VISIBLE` (409): a start-chat or InMail to a person the account
  //   holds a private 1:1 with that you may not read. Nothing is sent; the body
  //   reveals nothing of the conversation.
  // - `DO_NOT_CONTACT` (409): the person is on your team's do-not-contact list
  //   (an invitation, a chat start or send, InMail, follow, endorse, a reaction
  //   or comment, a live profile read). Nothing is sent.
  // - `TEAM_REQUIRED` (400): a key that works in all of your Teams called a
  //   Team-level operation without naming the Team. Pass `team` (per call or
  //   in the client config).
  // - `SEAT_LENT` (409): the seat is lent to another Team. A connect naming it,
  //   a cancel of it, and a connect that finishes just as a lend lands are all
  //   refused. Move it back first (`billing.seats.return`; only once no Account
  //   uses it). A suspended lent seat reads `NO_ACTIVE_SEAT` with its own
  //   message.
  // - `LINKEDIN_SIGN_IN_REQUIRED` (403): LinkedIn wants a sign-in on
  //   linkedin.com before it accepts this one. Sign in there, then retry.
  // - `EXPORT_IN_PROGRESS` (409): your team already has an export queued or
  //   running (`details.export_id`). Retry when it finishes.
  // - `EXPORT_NOT_READY` (409): the export is queued, running or failed; its
  //   file is not there to download yet.
  // - `EXPORT_EXPIRED` (410): the export's 24 h are over and its file is
  //   deleted. Run it again.
  // - `EXPORT_REMOVED` (410): a Contact was deleted, which removes your team's
  //   Contact-level exports. Run it again.
  "CHAT_NOT_VISIBLE",
  "DO_NOT_CONTACT",
  "TEAM_REQUIRED",
  "SEAT_LENT",
  "LINKEDIN_SIGN_IN_REQUIRED",
  "EXPORT_IN_PROGRESS",
  "EXPORT_NOT_READY",
  "EXPORT_EXPIRED",
  "EXPORT_REMOVED",

  // Client-side, never sent by the API. `CLIENT_TIMEOUT`: no response within
  // the client's `timeout` (default 30 s, per attempt). A read is retried
  // first; a write is not, and may still have reached the API, so read back
  // before sending it again. Raise `timeout` for a slow call.
  "CLIENT_TIMEOUT",

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
 * Where LinkedIn sees an account connecting from. Wire field
 * `connection_location`; the same shape rides every account read.
 * `country` is the configured country, `current_country` the one in use now
 * (they differ only after a fallback), `mode` `auto` (managed) or `custom`
 * (your own proxy), `strict` true when it never connects from another
 * country. Each is `null` until known.
 */
export interface ConnectionLocation {
  country?: string | null;
  current_country?: string | null;
  mode?: "auto" | "custom" | null;
  strict?: boolean | null;
}

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

/**
 * One failure of a refused document: `path` into it, `rule` saying what to
 * change. Wire `errors[]` entry. A Sequence rule or warning also carries the
 * compiler-style keys: `code` (`R1` to `R24`, `W1` to `W13`), `message`
 * (equal to `rule`), `pointer` (a JSON Pointer into the document you sent),
 * `hint` (the fix) and `docs_url` (the rule's docs entry). A
 * `MOTION_NOT_STARTABLE` gap is `{path, rule}` only.
 */
export interface CurviateErrorDetail {
  path: string;
  rule: string;
  code?: string;
  message?: string;
  pointer?: string;
  hint?: string;
  docs_url?: string;
}

/**
 * The stored Sequence a `SEQUENCE_CONFLICT` was refused against. Wire field
 * `current`, keys as the API sends them.
 */
export type SequenceConflictCurrent = NonNullable<components["schemas"]["Error"]["current"]>;

/**
 * The wire `details` object, as served: which keys appear depends on `code`.
 * `TIER_REQUIRED`: `account_id` names the one Account that lacks the feature
 * while the Team has it (an Account on a seat another Team lent this one
 * carries that seat's Tier): leave it out, or ask the Owner who lent the seat.
 * `EXPORT_IN_PROGRESS`: `export_id` is the export your Team already has queued
 * or running (it may be a teammate's, which `exports.get` answers 404).
 * `INVALID_REQUEST` on a removed safety-policy key: `removed_key`.
 * `account` rides the refusal of an Account location change.
 */
export type CurviateErrorDetails = NonNullable<components["schemas"]["Error"]["details"]>;

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
  /**
   * Where the account connects from now, on a `CONNECTION_LOCATION_UNAVAILABLE`
   * that followed an applied change (re-read after it). Wire field
   * `connection_location`. Absent when nothing was changed.
   */
  connectionLocation?: ConnectionLocation;
  /**
   * Every failure, as `{path, rule}` plus the compiler-style keys of a
   * Sequence rule, on a refusal that lists them: wire field `errors`
   * (`SEQUENCE_INVALID`, `MOTION_NOT_STARTABLE`), or the offline
   * `SEQUENCE_INVALID` a Sequence builder throws. `message` repeats the first.
   */
  errors?: CurviateErrorDetail[];
  /**
   * On a `SEQUENCE_CONFLICT`: the stored Sequence, its `sequence_revision` and
   * who saved it. Wire field `current`. Send your edit again with
   * `if_sequence_revision: current.sequence_revision` to replace it.
   */
  current?: SequenceConflictCurrent;
  /**
   * On a `TIER_REQUIRED`: the feature the team's Tier does not include.
   * Wire field `feature`. A feature added later arrives as its own string,
   * so keep a default branch (the type stays open: the known names complete,
   * any other string allowed).
   */
  feature?: TierFeature | (string & {});
  /**
   * On a `TIER_REQUIRED`: the lowest Tier that includes {@link CurviateErrorInit.feature}.
   * Wire field `required_tier`. `null` when no Tier includes it.
   */
  requiredTier?: TierName | (string & {}) | null;
  /**
   * On a `TIER_REQUIRED`: the Tier the team has now. Wire field `current_tier`.
   * `null` when the team has none.
   */
  currentTier?: TierName | (string & {}) | null;
  /**
   * On a `TIER_REQUIRED` for a team Owner only: the dashboard page where the
   * Tier is changed. Wire field `upgrade_url`. Absent for any other role, who
   * should ask an Owner.
   */
  upgradeUrl?: string;
  /**
   * The served `details` object, when the refusal carries one. Wire field
   * `details`; see {@link CurviateErrorDetails} for the keys per code
   * (`TIER_REQUIRED` `account_id`, `EXPORT_IN_PROGRESS` `export_id`).
   */
  details?: CurviateErrorDetails;
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
  connectionLocation?: ConnectionLocation;
  errors?: CurviateErrorDetail[];
  current?: SequenceConflictCurrent;
  feature?: TierFeature | (string & {});
  requiredTier?: TierName | (string & {}) | null;
  currentTier?: TierName | (string & {}) | null;
  upgradeUrl?: string;
  details?: CurviateErrorDetails;
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
  /** Where the account connects from now. See {@link CurviateErrorInit.connectionLocation}. */
  readonly connectionLocation: ConnectionLocation | undefined;
  /** Every failure as `{path, rule}`. See {@link CurviateErrorInit.errors}. */
  readonly errors: CurviateErrorDetail[] | undefined;
  /** The stored Sequence, on `SEQUENCE_CONFLICT`. See {@link CurviateErrorInit.current}. */
  readonly current: SequenceConflictCurrent | undefined;
  /** The feature the Tier lacks, on `TIER_REQUIRED`. See {@link CurviateErrorInit.feature}. */
  readonly feature: TierFeature | (string & {}) | undefined;
  /** The lowest Tier with that feature; `null` when none has it. See {@link CurviateErrorInit.requiredTier}. */
  readonly requiredTier: TierName | (string & {}) | null | undefined;
  /** The team's Tier now; `null` when it has none. See {@link CurviateErrorInit.currentTier}. */
  readonly currentTier: TierName | (string & {}) | null | undefined;
  /** Where an Owner changes the Tier; absent for other roles. See {@link CurviateErrorInit.upgradeUrl}. */
  readonly upgradeUrl: string | undefined;
  /** The served `details`, e.g. `account_id` on `TIER_REQUIRED`. See {@link CurviateErrorInit.details}. */
  readonly details: CurviateErrorDetails | undefined;

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
    this.connectionLocation = init.connectionLocation;
    this.errors = init.errors;
    this.current = init.current;
    this.feature = init.feature;
    this.requiredTier = init.requiredTier;
    this.currentTier = init.currentTier;
    this.upgradeUrl = init.upgradeUrl;
    this.details = init.details;
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
    if (this.connectionLocation !== undefined) json.connectionLocation = this.connectionLocation;
    if (this.errors !== undefined) json.errors = this.errors;
    if (this.current !== undefined) json.current = this.current;
    if (this.feature !== undefined) json.feature = this.feature;
    // Null-bearing like `resetAt`: `null` says no Tier has it / the team has none.
    if (this.requiredTier !== undefined) json.requiredTier = this.requiredTier;
    if (this.currentTier !== undefined) json.currentTier = this.currentTier;
    if (this.upgradeUrl !== undefined) json.upgradeUrl = this.upgradeUrl;
    if (this.details !== undefined) json.details = this.details;
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
