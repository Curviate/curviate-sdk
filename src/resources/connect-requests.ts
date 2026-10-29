/**
 * Connect requests resource: 3 methods (root-scoped), `curviate.connectRequests`.
 *
 * The credential-free way for an agent to get a LinkedIn account connected or
 * reconnected. Create a request, relay its `url` to the person, and they
 * connect in their own Curviate dashboard. Your code never handles a LinkedIn
 * password, cookie or verification code: never ask for one.
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
   * `warm_up: false` connects the new account with warm-up off (default
   * `true`); with `account_id` it is `400 INVALID_REQUEST`.
   *
   * @example
   * const req = await curviate.connectRequests.create();
   * console.log(`Open this link to connect your LinkedIn account: ${req.url}`);
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
