/**
 * Mailboxes resource: 7 methods (root-scoped), `curviate.mailboxes`.
 *
 * A Mailbox is an email address your Team sends from. Connecting one is a
 * Connect request (`curviate.connectRequests.create({ mailbox: ... })`): there
 * is no create call here, and the password of a Mailbox belongs only in that
 * request's body, never in a URL, a log line or a prompt. No response from
 * this resource ever holds a password or a token.
 *
 * Mailboxes are available while your Team has them switched on; before that
 * every call answers `404 RESOURCE_NOT_FOUND`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type MailboxListParams = NonNullable<paths["/v1/mailboxes"]["get"]["parameters"]["query"]>;
export type MailboxListPage = paths["/v1/mailboxes"]["get"]["responses"]["200"]["content"]["application/json"];
export type Mailbox = paths["/v1/mailboxes/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type MailboxUpdateBody = NonNullable<paths["/v1/mailboxes/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type MailboxRemoveResult = paths["/v1/mailboxes/{id}"]["delete"]["responses"]["200"]["content"]["application/json"];
export type MailboxDiscoverResult =
  paths["/v1/mailboxes/discover"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class MailboxesResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List your Team's Mailboxes, newest first, one HTTP call per page. Filter by
   * `state`, by `sends_for` (an Account id, `shared` or `none`) or by `domain`.
   * Pages with an opaque `cursor` until it is `null`.
   * `GET /v1/mailboxes`
   *
   * @example
   * const { items } = await curviate.mailboxes.list({ state: "connected", limit: 100 });
   */
  list(params?: MailboxListParams): Promise<MailboxListPage> {
    return this.ctx.request<MailboxListPage>({
      method: "GET",
      path: "/v1/mailboxes",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * One Mailbox of your Team. An unknown id and another Team's id answer the
   * same `404 MAILBOX_NOT_FOUND`.
   * `GET /v1/mailboxes/{id}`
   *
   * @param mailboxId - the Mailbox id (`mbx_...`).
   *
   * @example
   * const { state, sends_for } = await curviate.mailboxes.get("mbx_123");
   */
  get(mailboxId: string): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "GET",
      path: apiPath`/v1/mailboxes/${mailboxId}`,
    });
  }

  /**
   * Set the daily cap (1 to 50), the signature (plain text, at most 2,000
   * characters, `null` clears it) and/or `sends_for`: `{ kind: "account",
   * account_id }` (sends only for that one Account), `{ kind: "shared" }` (any
   * Account of the Team may send from it) or `null` (sends nothing until
   * linked). One Account, never a list. Owners and Managers change any Mailbox;
   * a Member only the ones they connected.
   * `PATCH /v1/mailboxes/{id}`
   *
   * @example
   * await curviate.mailboxes.update("mbx_123", { sends_for: { kind: "account", account_id: "acc_123" }, daily_cap: 30 });
   */
  update(mailboxId: string, body: MailboxUpdateBody): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "PATCH",
      path: apiPath`/v1/mailboxes/${mailboxId}`,
      body,
    });
  }

  /**
   * Stop a Mailbox sending until it is resumed. Only a `connected` or
   * `ramping` Mailbox pauses; any other state is refused with
   * `MAILBOX_STATE_CONFLICT`.
   * `POST /v1/mailboxes/{id}/pause`
   *
   * @example
   * await curviate.mailboxes.pause("mbx_123");
   */
  pause(mailboxId: string): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "POST",
      path: apiPath`/v1/mailboxes/${mailboxId}/pause`,
    });
  }

  /**
   * Resume a paused Mailbox: it goes to `ramping`, starting again at 5 emails
   * a day. A Mailbox that is not paused, a provider pause before its
   * `paused_until`, and one Curviate is fixing are refused with
   * `MAILBOX_STATE_CONFLICT`.
   * `POST /v1/mailboxes/{id}/resume`
   *
   * @example
   * await curviate.mailboxes.resume("mbx_123");
   */
  resume(mailboxId: string): Promise<Mailbox> {
    return this.ctx.request<Mailbox>({
      method: "POST",
      path: apiPath`/v1/mailboxes/${mailboxId}/resume`,
    });
  }

  /**
   * Remove a Mailbox and delete its stored credentials in one step. It changes
   * no seat count. A Member removes only a Mailbox they connected.
   * `DELETE /v1/mailboxes/{id}`
   *
   * @example
   * await curviate.mailboxes.remove("mbx_123");
   */
  remove(mailboxId: string): Promise<MailboxRemoveResult> {
    return this.ctx.request<MailboxRemoveResult>({
      method: "DELETE",
      path: apiPath`/v1/mailboxes/${mailboxId}`,
    });
  }

  /**
   * Find the IMAP and SMTP settings for an email address, to show the person
   * and confirm before connecting (`confirm_required` marks settings that
   * arrived unencrypted). The call takes no password and the answer holds none.
   * `GET /v1/mailboxes/discover`
   *
   * @example
   * const found = await curviate.mailboxes.discover("anna@acme.example");
   * // found.connection: "google_app_password" | "microsoft_sign_in" | "imap_smtp"
   */
  discover(address: string): Promise<MailboxDiscoverResult> {
    return this.ctx.request<MailboxDiscoverResult>({
      method: "GET",
      path: "/v1/mailboxes/discover",
      query: { address },
    });
  }
}
