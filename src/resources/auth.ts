/**
 * Auth resource: credential/cookie connect + checkpoint resolution.
 *
 * Split out of `accounts` into its own root-scoped namespace: these 5 ops
 * drive the multi-step "connect or re-authenticate a LinkedIn account" flow,
 * which is conceptually distinct from managing an already-connected account.
 * `intent` merges the old `accounts.link` (new account) and `accounts.reconnect`
 * (existing account) into one op, discriminated by an optional `account_id` in
 * the body: omit it to connect a new account, include it to re-authenticate
 * an existing one in place.
 *
 * None of these methods take an `account_id` path segment: the account is
 * either absent (new connect) or a body field (`account_id`) that identifies
 * a mid-flight connect/reconnect, never a path placeholder.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

/** `POST /v1/auth/intent` request body. */
export type AuthIntentBody =
  paths["/v1/auth/intent"]["post"]["requestBody"]["content"]["application/json"];

/** `POST /v1/auth/intent` 200 response body, an existing account re-authenticated in place. */
export type AuthIntentReconnected =
  paths["/v1/auth/intent"]["post"]["responses"]["200"]["content"]["application/json"];
/** `POST /v1/auth/intent` 201 response body, a new account connected. */
export type AuthIntentCreated =
  paths["/v1/auth/intent"]["post"]["responses"]["201"]["content"]["application/json"];
/** `POST /v1/auth/intent` 202 response body, a checkpoint challenge. */
export type AuthIntentCheckpoint =
  paths["/v1/auth/intent"]["post"]["responses"]["202"]["content"]["application/json"];

/** Union returned by `auth.intent()`: reconnected account, new account, or checkpoint. */
export type AuthIntentResult = AuthIntentReconnected | AuthIntentCreated | AuthIntentCheckpoint;

/**
 * `solveCheckpoint`'s body minus `account_id`; the method takes the account
 * id as its first argument (matching the pre-split call shape) and wire-encodes
 * it into the body alongside `code`.
 */
export type AuthSolveCheckpointBody = Omit<
  paths["/v1/auth/checkpoint/solve"]["post"]["requestBody"]["content"]["application/json"],
  "account_id"
>;

/** `POST /v1/auth/checkpoint/solve` result, 201 (active) or 202 (chained challenge). */
export type AuthSolveCheckpointResult =
  | paths["/v1/auth/checkpoint/solve"]["post"]["responses"]["201"]["content"]["application/json"]
  | paths["/v1/auth/checkpoint/solve"]["post"]["responses"]["202"]["content"]["application/json"];

/** `POST /v1/auth/checkpoint/request` 200 body. */
export type AuthRequestCheckpointResult =
  paths["/v1/auth/checkpoint/request"]["post"]["responses"]["200"]["content"]["application/json"];

/** `POST /v1/auth/checkpoint/poll` 200 body. */
export type AuthPollCheckpointResult =
  paths["/v1/auth/checkpoint/poll"]["post"]["responses"]["200"]["content"]["application/json"];

/** `GET /v1/auth/sessions/{session_id}` 200 body. */
export type AuthGetSessionResult =
  paths["/v1/auth/sessions/{session_id}"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ─────────────────────────────────────────────────────────

export class AuthResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Authenticate a LinkedIn account with credentials or a session cookie.
   *
   * Omit `account_id` to connect a NEW account into an empty seat; include it
   * to re-authenticate an EXISTING account in place. Returns the account on
   * success (200 re-authenticated in place / 201 new), or a checkpoint
   * challenge (202) when LinkedIn requires verification; resolve it with
   * {@link solveCheckpoint} (code) or {@link pollCheckpoint} (mobile-app
   * approval).
   *
   * For `auth_method: "cookie"`, `user_agent` is **required**; connecting by
   * session cookie without one is rejected with `INVALID_REQUEST`. It stays
   * optional for `auth_method: "credentials"`.
   *
   * On a 201 account, `recovered` is `true` only when the connect reclaimed a
   * LinkedIn identity already present on the workspace (claiming it into your
   * account) rather than connecting a brand-new one; it is absent on a normal
   * connect.
   *
   * Connection scope (which LinkedIn products are enabled: classic, company,
   * a premium tier) is **seat-derived**: there is no products input on this
   * body, and the recorded scope is readable back as `requested_products` on
   * the account (`accounts.list()` / `accounts.get()`). A reconnect that
   * would change scope must use `auth_method: "credentials"`, since a cookie
   * replay cannot change scope and throws `CurviateError(code:
   * "REAUTH_REQUIRED")` instead. A seat resolving to both individual-Premium
   * tiers at once throws `CurviateError(code: "PREMIUM_CONFLICT")` (LinkedIn
   * permits only one per profile). Pin a managed proxy with the optional
   * `country`/`ip`, or supply `proxy` to override it entirely.
   */
  intent(body: AuthIntentBody): Promise<AuthIntentResult> {
    return this.ctx.request<AuthIntentResult>({
      method: "POST",
      path: "/v1/auth/intent",
      body,
    });
  }

  /**
   * Solve a checkpoint challenge by submitting an OTP / 2FA code (or the
   * special value `TRY_ANOTHER_WAY` to switch challenge method).
   *
   * Returns the connected account (201) or, when LinkedIn chains a second
   * challenge (another checkpoint, 202); resolve that one with a further
   * `solveCheckpoint` call for the same `accountId`.
   *
   * @param accountId - the (provisional) `account_id` from the 202 response.
   * @param body - the verification `code`.
   */
  solveCheckpoint(accountId: string, body: AuthSolveCheckpointBody): Promise<AuthSolveCheckpointResult> {
    return this.ctx.request<AuthSolveCheckpointResult>({
      method: "POST",
      path: "/v1/auth/checkpoint/solve",
      body: { account_id: accountId, ...body },
    });
  }

  /**
   * Re-request the pending checkpoint notification (OTP / 2FA / mobile-app
   * push). `resent` is honest: `true` once the notification was actually
   * re-sent, `false` when there was nothing to re-send for that challenge
   * type (e.g. an authenticator-app code); this call never throws just
   * because a re-send wasn't applicable. Does not reset the checkpoint's
   * expiry.
   *
   * @param accountId - the (provisional) `account_id` from the 202 response.
   */
  requestCheckpoint(accountId: string): Promise<AuthRequestCheckpointResult> {
    return this.ctx.request<AuthRequestCheckpointResult>({
      method: "POST",
      path: "/v1/auth/checkpoint/request",
      body: { account_id: accountId },
    });
  }

  /**
   * Poll for mobile-app approval of a pending checkpoint challenge until it
   * leaves `pending`.
   *
   * On `status: "expired"`, the response carries `challenge_type`
   * (`"mobile_app_approval"`) and a human-readable `recovery_hint`.
   *
   * @param accountId - the (provisional) `account_id` from the 202 response.
   */
  pollCheckpoint(accountId: string): Promise<AuthPollCheckpointResult> {
    return this.ctx.request<AuthPollCheckpointResult>({
      method: "POST",
      path: "/v1/auth/checkpoint/poll",
      body: { account_id: accountId },
    });
  }

  /**
   * Poll a credential connect session by its account id, a pure status read
   * that makes no external call and does not itself complete the connection.
   * `status` is `checkpoint_required` until resolved, then `done` (with
   * `account_id`), or `expired` / `failed`.
   *
   * @param sessionId - the acc_... id returned by {@link intent} or a checkpoint response.
   */
  getSession(sessionId: string): Promise<AuthGetSessionResult> {
    return this.ctx.request<AuthGetSessionResult>({
      method: "GET",
      path: apiPath`/v1/auth/sessions/${sessionId}`,
    });
  }
}
