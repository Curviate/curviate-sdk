/**
 * Teams resource: 10 methods (root-scoped), `curviate.teams`.
 *
 * A team is the workspace your accounts, Drafts, webhooks and billing belong
 * to. A person can belong to several teams, with a role in each (`owner`,
 * `manager`, `member`). An API key acts in exactly one team, the one it was
 * created in; `current` below is that team. A dashboard session can choose a
 * team with the client's `team` option.
 *
 * Member and invite writes are for Owners; a refusal reads `INSUFFICIENT_ROLE`.
 * Every list pages with an opaque `cursor` until it is `null`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

type Json<T> = T extends { content: { "application/json": infer B } } ? B : never;

export type TeamListParams = NonNullable<paths["/v1/teams"]["get"]["parameters"]["query"]>;
export type TeamListPage = Json<paths["/v1/teams"]["get"]["responses"]["200"]>;
export type Team = Json<paths["/v1/teams/current"]["get"]["responses"]["200"]>;
export type TeamUpdateBody = Json<NonNullable<paths["/v1/teams/current"]["patch"]["requestBody"]>>;
export type TeamUpdateResult = Json<paths["/v1/teams/current"]["patch"]["responses"]["200"]>;

export type TeamMemberListParams = NonNullable<
  paths["/v1/teams/current/members"]["get"]["parameters"]["query"]
>;
export type TeamMemberListPage = Json<paths["/v1/teams/current/members"]["get"]["responses"]["200"]>;
export type TeamMemberUpdateBody = Json<
  NonNullable<paths["/v1/teams/current/members/{user_id}"]["patch"]["requestBody"]>
>;
export type TeamMemberUpdateResult = Json<
  paths["/v1/teams/current/members/{user_id}"]["patch"]["responses"]["200"]
>;
export type TeamMemberRemoveResult = Json<
  paths["/v1/teams/current/members/{user_id}"]["delete"]["responses"]["200"]
>;

export type TeamInviteCreateBody = Json<
  NonNullable<paths["/v1/teams/current/invites"]["post"]["requestBody"]>
>;
export type TeamInviteCreateResult = Json<paths["/v1/teams/current/invites"]["post"]["responses"]["201"]>;
export type TeamInviteListParams = NonNullable<
  paths["/v1/teams/current/invites"]["get"]["parameters"]["query"]
>;
export type TeamInviteListPage = Json<paths["/v1/teams/current/invites"]["get"]["responses"]["200"]>;
export type TeamInviteResendResult = Json<
  paths["/v1/teams/current/invites/{invite_id}/resend"]["post"]["responses"]["200"]
>;
export type TeamInviteRevokeResult = Json<
  paths["/v1/teams/current/invites/{invite_id}"]["delete"]["responses"]["200"]
>;

// ─── Resource class ───────────────────────────────────────────────────────────

export class TeamsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List the teams you belong to, with your role in each.
   * `GET /v1/teams`
   *
   * @example
   * const { items } = await curviate.teams.list();
   */
  list(params?: TeamListParams): Promise<TeamListPage> {
    return this.ctx.request<TeamListPage>({
      method: "GET",
      path: "/v1/teams",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * The team this credential acts in: its name, your role, and the Owner who
   * receives invoices.
   * `GET /v1/teams/current`
   *
   * @example
   * const { team_id, role } = await curviate.teams.getCurrent();
   */
  getCurrent(): Promise<Team> {
    return this.ctx.request<Team>({ method: "GET", path: "/v1/teams/current" });
  }

  /**
   * Rename the current team, or set `billing_owner_user_id` (an Owner of this
   * team, whose email receives invoices). Owners only.
   * `PATCH /v1/teams/current`
   *
   * @example
   * await curviate.teams.updateCurrent({ name: "Growth" });
   */
  updateCurrent(body: TeamUpdateBody): Promise<TeamUpdateResult> {
    return this.ctx.request<TeamUpdateResult>({
      method: "PATCH",
      path: "/v1/teams/current",
      body,
    });
  }

  /**
   * List the current team's members and their roles.
   * `GET /v1/teams/current/members`
   *
   * @example
   * const { items } = await curviate.teams.listMembers({ limit: 50 });
   */
  listMembers(params?: TeamMemberListParams): Promise<TeamMemberListPage> {
    return this.ctx.request<TeamMemberListPage>({
      method: "GET",
      path: "/v1/teams/current/members",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Change a member's role. The team always keeps one Owner (`LAST_OWNER`),
   * the invoice Owner stays an Owner until another is named
   * (`BILLING_OWNER_REQUIRED`), and nobody is demoted in their own default
   * team (`DEFAULT_TEAM_PROTECTED`). Owners only.
   * `PATCH /v1/teams/current/members/{user_id}`
   *
   * @example
   * await curviate.teams.updateMember("usr_123", { role: "manager" });
   */
  updateMember(userId: string, body: TeamMemberUpdateBody): Promise<TeamMemberUpdateResult> {
    return this.ctx.request<TeamMemberUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/teams/current/members/${userId}`,
      body,
    });
  }

  /**
   * Remove a member (Owners only), or pass `"me"` to leave the team yourself.
   * Their API key and connectors for this team stop working at once. Same
   * refusals as {@link TeamsResource.updateMember}.
   * `DELETE /v1/teams/current/members/{user_id}`
   *
   * @example
   * await curviate.teams.removeMember("me"); // leave the team
   */
  removeMember(userId: string): Promise<TeamMemberRemoveResult> {
    return this.ctx.request<TeamMemberRemoveResult>({
      method: "DELETE",
      path: apiPath`/v1/teams/current/members/${userId}`,
    });
  }

  /**
   * Invite 1 to 20 people by email, each with a role (`member` by default).
   * Each gets a link valid for 7 days. All or nothing: if any row is refused
   * (`ALREADY_MEMBER`, `INVITE_ALREADY_PENDING`, `INVITE_LIMIT_REACHED`),
   * nothing is created or sent and the error names the row. Owners only.
   * `POST /v1/teams/current/invites`
   *
   * @example
   * await curviate.teams.createInvites({ invites: [{ email: "ana@example.com" }] });
   */
  createInvites(body: TeamInviteCreateBody): Promise<TeamInviteCreateResult> {
    return this.ctx.request<TeamInviteCreateResult>({
      method: "POST",
      path: "/v1/teams/current/invites",
      body,
    });
  }

  /**
   * List the current team's invites, optionally by `status`.
   * `GET /v1/teams/current/invites`
   *
   * @example
   * const { items } = await curviate.teams.listInvites({ status: "pending" });
   */
  listInvites(params?: TeamInviteListParams): Promise<TeamInviteListPage> {
    return this.ctx.request<TeamInviteListPage>({
      method: "GET",
      path: "/v1/teams/current/invites",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Re-send a pending or expired invite; its link is valid for 7 more days.
   * An accepted or revoked one is refused with `INVITE_NOT_PENDING`.
   * `POST /v1/teams/current/invites/{invite_id}/resend`
   *
   * @example
   * await curviate.teams.resendInvite("tinv_123");
   */
  resendInvite(inviteId: string): Promise<TeamInviteResendResult> {
    return this.ctx.request<TeamInviteResendResult>({
      method: "POST",
      path: apiPath`/v1/teams/current/invites/${inviteId}/resend`,
    });
  }

  /**
   * Revoke an invite; its link stops working.
   * `DELETE /v1/teams/current/invites/{invite_id}`
   *
   * @example
   * await curviate.teams.revokeInvite("tinv_123");
   */
  revokeInvite(inviteId: string): Promise<TeamInviteRevokeResult> {
    return this.ctx.request<TeamInviteRevokeResult>({
      method: "DELETE",
      path: apiPath`/v1/teams/current/invites/${inviteId}`,
    });
  }
}
