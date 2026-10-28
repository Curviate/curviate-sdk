/**
 * Teams resource: 13 methods (root-scoped), `curviate.teams`.
 *
 * A team is the workspace your accounts, Drafts, webhooks and billing belong
 * to. A person can belong to several teams, with a role in each (`owner`,
 * `manager`, `member`). A Team API key acts in exactly one team, the one it
 * was created in; `current` below is that team. A key that works in all of
 * your Teams, and a dashboard session, choose a team with the client's `team`
 * option. `create` makes a new team with you as its Owner.
 *
 * Member and invite writes are for Owners; a refusal reads `INSUFFICIENT_ROLE`.
 * Every list pages with an opaque `cursor` until it is `null`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type TeamListParams = NonNullable<paths["/v1/teams"]["get"]["parameters"]["query"]>;
export type TeamCreateBody = NonNullable<paths["/v1/teams"]["post"]["requestBody"]>["content"]["application/json"];
/** The new Team: the `GET /v1/teams` item shape plus `next_step`. */
export type TeamCreateResult = paths["/v1/teams"]["post"]["responses"]["201"]["content"]["application/json"];
export type TeamLogoResult = paths["/v1/teams/current/logo"]["put"]["responses"]["200"]["content"]["application/json"];
export type TeamListPage = paths["/v1/teams"]["get"]["responses"]["200"]["content"]["application/json"];
export type Team = paths["/v1/teams/current"]["get"]["responses"]["200"]["content"]["application/json"];
export type TeamUpdateBody = NonNullable<paths["/v1/teams/current"]["patch"]["requestBody"]>["content"]["application/json"];
export type TeamUpdateResult = paths["/v1/teams/current"]["patch"]["responses"]["200"]["content"]["application/json"];

export type TeamMemberListParams = NonNullable<
  paths["/v1/teams/current/members"]["get"]["parameters"]["query"]
>;
export type TeamMemberListPage = paths["/v1/teams/current/members"]["get"]["responses"]["200"]["content"]["application/json"];
export type TeamMemberUpdateBody = NonNullable<paths["/v1/teams/current/members/{user_id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type TeamMemberUpdateResult = paths["/v1/teams/current/members/{user_id}"]["patch"]["responses"]["200"]["content"]["application/json"];
export type TeamMemberRemoveResult = paths["/v1/teams/current/members/{user_id}"]["delete"]["responses"]["200"]["content"]["application/json"];

export type TeamInviteCreateBody = NonNullable<paths["/v1/teams/current/invites"]["post"]["requestBody"]>["content"]["application/json"];
export type TeamInviteCreateResult = paths["/v1/teams/current/invites"]["post"]["responses"]["201"]["content"]["application/json"];
export type TeamInviteListParams = NonNullable<
  paths["/v1/teams/current/invites"]["get"]["parameters"]["query"]
>;
export type TeamInviteListPage = paths["/v1/teams/current/invites"]["get"]["responses"]["200"]["content"]["application/json"];
export type TeamInviteResendResult = paths["/v1/teams/current/invites/{invite_id}/resend"]["post"]["responses"]["200"]["content"]["application/json"];
export type TeamInviteRevokeResult = paths["/v1/teams/current/invites/{invite_id}"]["delete"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class TeamsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List the teams you belong to, with your role in each. `is_current` marks
   * the team this credential acts in; `logo_url` is the team's public PNG or
   * `null`. Pages with an opaque `cursor` until it is `null`.
   *
   * `include: "counts"` adds to each row `tier` (or the Tier of a seat lent to
   * it; `null` with no subscription), `trial: { days_left }` while a trial is
   * all the team has, `accounts` and `active_motions` (what you would read in
   * that team), and `seats: { used, total, lent_out, lent_in }` on rows where
   * you are an Owner. Which rows get counts depends on the credential: a
   * dashboard session and an All-Teams key get them on every row; a Team API
   * key, or a token for one Team, only on its own row (the other rows come
   * back without them).
   * `GET /v1/teams`
   *
   * @example
   * const { items } = await curviate.teams.list();
   * const withCounts = await curviate.teams.list({ include: "counts" });
   */
  list(params?: TeamListParams): Promise<TeamListPage> {
    return this.ctx.request<TeamListPage>({
      method: "GET",
      path: "/v1/teams",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Create a team with you as its Owner and the Owner who receives its
   * invoices. It has no subscription and no seat yet. Any role may call it,
   * and two identical calls create two teams. The result is the
   * {@link TeamsResource.list} item shape plus `next_step`, which depends on
   * the credential: an All-Teams key gets `{ team_header }`, the header line
   * to send (`X-Curviate-Team: <team_id>`, usable at once; with this SDK pass
   * the `team_id` as the `team` option); any other credential gets
   * `{ command, url }` (the CLI command that sets up a key in the new team,
   * and the dashboard page with your teams).
   * `POST /v1/teams`
   *
   * @example
   * const { team_id, next_step } = await curviate.teams.create({ name: "Agency client A" });
   * if (next_step?.command) console.log(next_step.command); // set up a key for the new team
   */
  create(body: TeamCreateBody): Promise<TeamCreateResult> {
    return this.ctx.request<TeamCreateResult>({ method: "POST", path: "/v1/teams", body });
  }

  /**
   * The team this credential acts in: its name, your role, its `logo_url`, and
   * the Owner who receives invoices.
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
   * Set the current team's logo from a PNG of at most 1 MB. The file's own
   * bytes are checked, whatever its content type: a file that is not a PNG
   * throws `UNSUPPORTED_MEDIA_TYPE` (415) and a larger one `PAYLOAD_TOO_LARGE`
   * (413). Replaces the previous logo and resolves with the team, whose
   * `logo_url` is the new public PNG URL. Owners only.
   * `PUT /v1/teams/current/logo`
   *
   * @example
   * await curviate.teams.setLogo(await fs.promises.readFile("logo.png"));
   */
  setLogo(png: Blob | ArrayBuffer | Uint8Array): Promise<TeamLogoResult> {
    return this.ctx.request<TeamLogoResult>({
      method: "PUT",
      path: "/v1/teams/current/logo",
      rawBody: { data: png, contentType: "image/png" },
    });
  }

  /**
   * Remove the current team's logo; the team resolves with `logo_url: null`.
   * Owners only.
   * `DELETE /v1/teams/current/logo`
   *
   * @example
   * await curviate.teams.removeLogo();
   */
  removeLogo(): Promise<TeamLogoResult> {
    return this.ctx.request<TeamLogoResult>({ method: "DELETE", path: "/v1/teams/current/logo" });
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
