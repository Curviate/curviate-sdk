/**
 * Do-not-contact list (root-scoped): `curviate.doNotContact` (5 methods).
 *
 * One list for the whole Team. No Motion contacts a person on it, and every
 * write toward them is refused with `DO_NOT_CONTACT` (an invitation, a chat
 * start or send, InMail, follow, endorse, a reaction or comment, a live
 * profile read). A reply in a conversation they wrote in stays allowed. An
 * entry whose Contact was deleted still applies (`contact` reads `null`).
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type DoNotContactListParams = NonNullable<paths["/v1/do-not-contact"]["get"]["parameters"]["query"]>;
export type DoNotContactPage = paths["/v1/do-not-contact"]["get"]["responses"]["200"]["content"]["application/json"];
export type DoNotContactEntry = paths["/v1/do-not-contact/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type DoNotContactAddBody = NonNullable<paths["/v1/do-not-contact"]["post"]["requestBody"]>["content"]["application/json"];
export type DoNotContactUpdateBody = NonNullable<paths["/v1/do-not-contact/{id}"]["patch"]["requestBody"]>["content"]["application/json"];

export class DoNotContactResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * The Team's do-not-contact list, newest first. `q` matches the Contact's
   * name. `await` it for one page; `for await` it for every entry across
   * pages.
   * `GET /v1/do-not-contact`
   *
   * @example
   * for await (const entry of curviate.doNotContact.list({ q: "ana" })) console.log(entry.id, entry.reason);
   */
  list(params?: DoNotContactListParams): Pageable<DoNotContactPage> {
    return pageable(
      (p) => this.ctx.request<DoNotContactPage>({ method: "GET", path: "/v1/do-not-contact", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * One entry. `reason` is one of `asked_to_stop`, `existing_customer`,
   * `competitor`, `partner`, `employee`, `other`, or `null`.
   * `GET /v1/do-not-contact/{id}`
   *
   * @example
   * const entry = await curviate.doNotContact.get("dnc_123");
   */
  get(id: string): Promise<DoNotContactEntry> {
    return this.ctx.request<DoNotContactEntry>({ method: "GET", path: apiPath`/v1/do-not-contact/${id}` });
  }

  /**
   * Add one person by `contact_id` or `linkedin_url` (someone who is not a
   * Contact yet becomes one first, from stored data only), with an optional
   * `reason`. A person already on the list resolves with their existing entry,
   * unchanged. Any team member may add. There is no bulk route: loop. Needs
   * Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   * `POST /v1/do-not-contact`
   *
   * @example
   * const entry = await curviate.doNotContact.add({ linkedin_url: "https://www.linkedin.com/in/ana/", reason: "asked_to_stop" });
   */
  add(body: DoNotContactAddBody): Promise<DoNotContactEntry> {
    return this.ctx.request<DoNotContactEntry>({ method: "POST", path: "/v1/do-not-contact", body });
  }

  /**
   * Set the entry's `reason` from the fixed list; `null` clears it. Needs
   * Automate: a Team below that Tier is refused with `TIER_REQUIRED`.
   * `PATCH /v1/do-not-contact/{id}`
   *
   * @example
   * await curviate.doNotContact.update("dnc_123", { reason: "existing_customer" });
   */
  update(id: string, body: DoNotContactUpdateBody): Promise<DoNotContactEntry> {
    return this.ctx.request<DoNotContactEntry>({ method: "PATCH", path: apiPath`/v1/do-not-contact/${id}`, body });
  }

  /**
   * Remove the entry (bodyless, 204): Motions and writes may reach the person
   * again. Owners and Managers only (`INSUFFICIENT_ROLE`).
   * `DELETE /v1/do-not-contact/{id}`
   *
   * @example
   * await curviate.doNotContact.remove("dnc_123");
   */
  async remove(id: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({ method: "DELETE", path: apiPath`/v1/do-not-contact/${id}` });
  }
}
