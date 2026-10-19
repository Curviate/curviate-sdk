/**
 * Contact lists resource: 5 methods (root-scoped), `curviate.contactLists`.
 *
 * A Contact list is a named, static set of your team's Contacts (up to 1,000
 * lists). Names are unique in the team in any casing; a taken one is refused
 * with `NAME_TAKEN`. Add or remove members with `contacts.updateMany`
 * (`add_list_id`, `remove_list_id`), `contacts.upsert` or an import; list them
 * with `contacts.list({ list_id })`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type ContactListCreateBody = NonNullable<paths["/v1/contact-lists"]["post"]["requestBody"]>["content"]["application/json"];
export type ContactListObject = paths["/v1/contact-lists"]["post"]["responses"]["201"]["content"]["application/json"];
export type ContactListListParams = NonNullable<paths["/v1/contact-lists"]["get"]["parameters"]["query"]>;
export type ContactListListPage = paths["/v1/contact-lists"]["get"]["responses"]["200"]["content"]["application/json"];
export type ContactListGetResult = paths["/v1/contact-lists/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ContactListUpdateBody = NonNullable<paths["/v1/contact-lists/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type ContactListUpdateResult = paths["/v1/contact-lists/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class ContactListsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Create an empty Contact list.
   * `POST /v1/contact-lists`
   *
   * @example
   * const list = await curviate.contactLists.create({ name: "Q4 webinar" });
   */
  create(body: ContactListCreateBody): Promise<ContactListObject> {
    return this.ctx.request<ContactListObject>({
      method: "POST",
      path: "/v1/contact-lists",
      body,
    });
  }

  /**
   * List your team's Contact lists with their `contact_count`; `q` matches
   * names. Pages with an opaque `cursor` until it is `null`.
   * `GET /v1/contact-lists`
   *
   * @example
   * const { items } = await curviate.contactLists.list({ q: "webinar" });
   */
  list(params?: ContactListListParams): Promise<ContactListListPage> {
    return this.ctx.request<ContactListListPage>({
      method: "GET",
      path: "/v1/contact-lists",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Read one Contact list.
   * `GET /v1/contact-lists/{id}`
   *
   * @example
   * const { name, contact_count } = await curviate.contactLists.get("cl_123");
   */
  get(listId: string): Promise<ContactListGetResult> {
    return this.ctx.request<ContactListGetResult>({
      method: "GET",
      path: apiPath`/v1/contact-lists/${listId}`,
    });
  }

  /**
   * Rename a Contact list or change its `description`.
   * `PATCH /v1/contact-lists/{id}`
   *
   * @example
   * await curviate.contactLists.update("cl_123", { name: "Q4 webinar (attended)" });
   */
  update(listId: string, body: ContactListUpdateBody): Promise<ContactListUpdateResult> {
    return this.ctx.request<ContactListUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/contact-lists/${listId}`,
      body,
    });
  }

  /**
   * Delete a Contact list (bodyless, 204); its Contacts stay. A list a live Motion
   * (not `completed` or `archived`) or a running import uses is refused with `RESOURCE_IN_USE`. Owners and
   * Managers only.
   * `DELETE /v1/contact-lists/{id}`
   *
   * @example
   * await curviate.contactLists.delete("cl_123");
   */
  async delete(listId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({
      method: "DELETE",
      path: apiPath`/v1/contact-lists/${listId}`,
    });
  }
}
