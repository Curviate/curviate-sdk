/**
 * Connect requests resource: 3 methods (root-scoped), `curviate.connectRequests`.
 *
 * The credential-free way for an agent to get a LinkedIn account connected or
 * reconnected. Create a request, relay its `url` to the person, and they
 * connect in their own Curviate dashboard. Your code never handles a LinkedIn
 * password, cookie or verification code: never ask for one.
 *
 * The same request connects or reconnects a Mailbox (`kind` `mailbox_connect`
 * or `mailbox_reconnect`): pass `mailbox` (new) or `mailbox_id` (reconnect).
 * The one secret in this resource is a Mailbox's app or host password, and it
 * goes in the `credentials` field of the create body and nowhere else: not a
 * URL, a query, a log line, a prompt or a tool argument. The answer never
 * holds it. Pass it only when the person handed it to you for this; a sign-in
 * connection (`microsoft_sign_in`, `google_sign_in`) takes no password at all.
 *
 * Poll {@link ConnectRequestsResource.get} until `status` leaves `pending`:
 * `completed` (then `account_id` is the connected account), `expired` (not
 * started within 15 minutes), `failed` or `cancelled`.
 *
 * `create` is not retry-safe: a retry makes a second request.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type ConnectRequestCreateBody = NonNullable<
  paths["/v1/auth/connect-requests"]["post"]["requestBody"]
>["content"]["application/json"];
export type ConnectRequest =
  paths["/v1/auth/connect-requests"]["post"]["responses"]["201"]["content"]["application/json"];
export type ConnectRequestGetResult =
  paths["/v1/auth/connect-requests/{request_id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ConnectRequestCancelResult =
  paths["/v1/auth/connect-requests/{request_id}/cancel"]["post"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class ConnectRequestsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Ask a person to connect a new LinkedIn account (omit `account_id`) or to
   * reconnect an existing one (pass its `acc_...` id).
   * `POST /v1/auth/connect-requests`
   *
   * A reconnect that signs in to a different LinkedIn account fails with
   * `LINKEDIN_ACCOUNT_MISMATCH` and leaves the account unchanged.
   *
   * `warm_up: true` connects the new account with warm-up on (default off:
   * full limits from the start); with `account_id` it is
   * `400 INVALID_REQUEST`.
   *
   * **A Mailbox** instead of a LinkedIn account: send `mailbox: { connection,
   * address, imap?, smtp? }` for a new one (`kind` `mailbox_connect`) or
   * `mailbox_id` (`mbx_...`) to reconnect one of your Team's
   * (`mailbox_reconnect`). `connection` is `google_app_password` (Gmail and
   * Google Workspace), `google_sign_in` (a Google Workspace whose
   * administrator trusts Curviate; a private Gmail address is refused with
   * `MAILBOX_APP_PASSWORD_REQUIRED`), `microsoft_sign_in` or `imap_smtp`.
   * `imap_smtp` needs `imap` and `smtp` (`host`, `port`, `security` of `tls` or
   * `starttls`, never cleartext): the settings from
   * `curviate.mailboxes.discover`, as the person confirmed them.
   *
   * `credentials: { password }` is for `google_app_password`, `imap_smtp` and
   * (reconnect only) `google_sign_in`. Curviate checks the password before it
   * answers and keeps it sealed; the answer and every later read never return
   * it. It belongs only in this request body: keep it out of URLs, logs and
   * anything an agent echoes. On a sign-in connection `credentials` is
   * `400 INVALID_REQUEST`. Relay the answer's `url` to the person, and
   * `admin_consent_url` for an administrator where the provider needs one;
   * poll `get` until `status` leaves `pending`, then `mailbox_id` names the
   * connected Mailbox. An address already connected is
   * `MAILBOX_ALREADY_CONNECTED`.
   *
   * @example
   * const req = await curviate.connectRequests.create();
   * console.log(`Open this link to connect your LinkedIn account: ${req.url}`);
   *
   * @example
   * // A Mailbox: sign in with Microsoft, no password anywhere.
   * const req = await curviate.connectRequests.create({
   *   mailbox: { connection: "microsoft_sign_in", address: "anna@acme.example" },
   * });
   *
   * @example
   * // An app password the person handed you, read from your own secret store.
   * const req = await curviate.connectRequests.create({
   *   mailbox: { connection: "google_app_password", address: "anna@acme.example" },
   *   credentials: { password: process.env.MAILBOX_APP_PASSWORD! },
   * });
   */
  create(body: ConnectRequestCreateBody = {}): Promise<ConnectRequest> {
    return this.ctx.request<ConnectRequest>({
      method: "POST",
      path: "/v1/auth/connect-requests",
      body,
    });
  }

  /**
   * Read a connect request; poll until `status` leaves `pending`.
   * `GET /v1/auth/connect-requests/{request_id}`
   *
   * @param requestId - the connect request id (`creq_...`).
   *
   * @example
   * const { status, account_id } = await curviate.connectRequests.get("creq_123");
   */
  get(requestId: string): Promise<ConnectRequestGetResult> {
    return this.ctx.request<ConnectRequestGetResult>({
      method: "GET",
      path: apiPath`/v1/auth/connect-requests/${requestId}`,
    });
  }

  /**
   * Cancel a pending connect request; its link stops working. A request that
   * is no longer pending is refused with `CONNECT_REQUEST_NOT_PENDING`.
   * `POST /v1/auth/connect-requests/{request_id}/cancel`
   *
   * @example
   * await curviate.connectRequests.cancel("creq_123");
   */
  cancel(requestId: string): Promise<ConnectRequestCancelResult> {
    return this.ctx.request<ConnectRequestCancelResult>({
      method: "POST",
      path: apiPath`/v1/auth/connect-requests/${requestId}/cancel`,
    });
  }
}
