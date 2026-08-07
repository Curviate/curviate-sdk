/**
 * Invites resource: 6 methods.
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar).
 *
 * The old combined `respond(invitationId, {action, ...})` splits into two
 * dedicated, bodyless POSTs, `accept` / `decline`, matching the served
 * surface. `respond` is removed.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type SendInviteBody =
  paths["/v1/{account_id}/invites"]["post"]["requestBody"]["content"]["application/json"];
export type SendInviteResult =
  paths["/v1/{account_id}/invites"]["post"]["responses"]["201"]["content"]["application/json"];

export type SentInviteListPage =
  paths["/v1/{account_id}/invites/sent"]["get"]["responses"]["200"]["content"]["application/json"];
export type SentInviteListQuery = NonNullable<
  paths["/v1/{account_id}/invites/sent"]["get"]["parameters"]["query"]
>;

export type ReceivedInviteListPage =
  paths["/v1/{account_id}/invites/received"]["get"]["responses"]["200"]["content"]["application/json"];
export type ReceivedInviteListQuery = NonNullable<
  paths["/v1/{account_id}/invites/received"]["get"]["parameters"]["query"]
>;

export type AcceptInviteResult =
  paths["/v1/{account_id}/invites/received/{invitation_id}/accept"]["post"]["responses"]["200"]["content"]["application/json"];

export type DeclineInviteResult =
  paths["/v1/{account_id}/invites/received/{invitation_id}/decline"]["post"]["responses"]["200"]["content"]["application/json"];

export type CancelInviteResult =
  paths["/v1/{account_id}/invites/sent/{invitation_id}"]["delete"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class InvitesResource {
  constructor(protected readonly ctx: RequestContext) {}

  /** Send a connect-request. `POST /v1/{account_id}/invites` */
  send(body: SendInviteBody): Promise<SendInviteResult> {
    return this.ctx.request<SendInviteResult>({
      method: "POST",
      path: "/v1/{account_id}/invites",
      body,
    });
  }

  /** List sent connect-requests. `GET /v1/{account_id}/invites/sent` */
  listSent(params?: SentInviteListQuery): Promise<SentInviteListPage> {
    return this.ctx.request<SentInviteListPage>({
      method: "GET",
      path: "/v1/{account_id}/invites/sent",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /** List received connect-requests. `GET /v1/{account_id}/invites/received` */
  listReceived(params?: ReceivedInviteListQuery): Promise<ReceivedInviteListPage> {
    return this.ctx.request<ReceivedInviteListPage>({
      method: "GET",
      path: "/v1/{account_id}/invites/received",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Accept a received connect-request (bodyless). An unrecognized or
   * non-pending `invitationId` returns `status: "not_found"`, not an error.
   * `POST /v1/{account_id}/invites/received/{invitation_id}/accept`
   */
  accept(invitationId: string): Promise<AcceptInviteResult> {
    return this.ctx.request<AcceptInviteResult>({
      method: "POST",
      path: `/v1/{account_id}/invites/received/${invitationId}/accept`,
    });
  }

  /**
   * Decline a received connect-request (bodyless). An unrecognized or
   * non-pending `invitationId` returns `status: "not_found"`, not an error.
   * `POST /v1/{account_id}/invites/received/{invitation_id}/decline`
   */
  decline(invitationId: string): Promise<DeclineInviteResult> {
    return this.ctx.request<DeclineInviteResult>({
      method: "POST",
      path: `/v1/{account_id}/invites/received/${invitationId}/decline`,
    });
  }

  /**
   * Withdraw a sent connect-request (bodyless). An already-absent or
   * unrecognized `invitationId` returns `status: "not_found"`, not an error.
   * `DELETE /v1/{account_id}/invites/sent/{invitation_id}`
   */
  cancel(invitationId: string): Promise<CancelInviteResult> {
    return this.ctx.request<CancelInviteResult>({
      method: "DELETE",
      path: `/v1/{account_id}/invites/sent/${invitationId}`,
    });
  }
}
