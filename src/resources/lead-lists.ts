/**
 * Lead lists resource: 5 methods (root-scoped), `curviate.leadLists`.
 *
 * A Lead list is a named, static set of your team's Leads (up to 1,000
 * lists). Names are unique in the team in any casing; a taken one is refused
 * with `NAME_TAKEN`. Add or remove members with `leads.updateMany`
 * (`add_list_id`, `remove_list_id`), `leads.upsert` or an import; list them
 * with `leads.list({ list_id })`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type LeadListCreateBody = NonNullable<paths["/v1/lead-lists"]["post"]["requestBody"]>["content"]["application/json"];
export type LeadListObject = paths["/v1/lead-lists"]["post"]["responses"]["201"]["content"]["application/json"];
export type LeadListListParams = NonNullable<paths["/v1/lead-lists"]["get"]["parameters"]["query"]>;
export type LeadListListPage = paths["/v1/lead-lists"]["get"]["responses"]["200"]["content"]["application/json"];
export type LeadListGetResult = paths["/v1/lead-lists/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type LeadListUpdateBody = NonNullable<paths["/v1/lead-lists/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type LeadListUpdateResult = paths["/v1/lead-lists/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class LeadListsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Create a static Lead list: empty, or with `from`, a filter as in
   * `leads.updateMany({ filter })`, holding every Lead it matches right
   * now (up to 10,000; more throws `INVALID_REQUEST` naming the count and
   * creates nothing). `from.list_id` of two lists combines them (a Lead in
   * both counts once), `list_match: "all"` keeps those in both and
   * `not_list_id` leaves some out. The lists named in `from` are not changed,
   * and `lead_count` is how many Leads matched.
   * `POST /v1/lead-lists`
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * @example
   * const list = await curviate.leadLists.create({ name: "Q4 webinar" });
   * const both = await curviate.leadLists.create({ name: "Both", from: { list_id: ["cl_1", "cl_2"], list_match: "all" } });
   */
  create(body: LeadListCreateBody): Promise<LeadListObject> {
    return this.ctx.request<LeadListObject>({
      method: "POST",
      path: "/v1/lead-lists",
      body,
    });
  }

  /**
   * List your team's Lead lists with their `lead_count`; `q` matches
   * names. Pages with an opaque `cursor` until it is `null`.
   * `GET /v1/lead-lists`
   *
   * @example
   * const { items } = await curviate.leadLists.list({ q: "webinar" });
   */
  list(params?: LeadListListParams): Promise<LeadListListPage> {
    return this.ctx.request<LeadListListPage>({
      method: "GET",
      path: "/v1/lead-lists",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Read one Lead list.
   * `GET /v1/lead-lists/{id}`
   *
   * @example
   * const { name, lead_count } = await curviate.leadLists.get("cl_123");
   */
  get(listId: string): Promise<LeadListGetResult> {
    return this.ctx.request<LeadListGetResult>({
      method: "GET",
      path: apiPath`/v1/lead-lists/${listId}`,
    });
  }

  /**
   * Rename a Lead list or change its `description`.
   * `PATCH /v1/lead-lists/{id}`
   *
   * Needs a subscription: a Team without one is refused with `TIER_REQUIRED`.
   *
   * @example
   * await curviate.leadLists.update("cl_123", { name: "Q4 webinar (attended)" });
   */
  update(listId: string, body: LeadListUpdateBody): Promise<LeadListUpdateResult> {
    return this.ctx.request<LeadListUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/lead-lists/${listId}`,
      body,
    });
  }

  /**
   * Delete a Lead list (bodyless, 204); its Leads stay. A list a live Campaign
   * (not `completed` or `archived`) or a running import uses is refused with `RESOURCE_IN_USE`. Owners and
   * Managers only.
   * `DELETE /v1/lead-lists/{id}`
   *
   * @example
   * await curviate.leadLists.delete("cl_123");
   */
  async delete(listId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({
      method: "DELETE",
      path: apiPath`/v1/lead-lists/${listId}`,
    });
  }
}
