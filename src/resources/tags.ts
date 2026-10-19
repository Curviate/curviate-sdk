/**
 * Tags resource: 3 methods (root-scoped), `curviate.tags`.
 *
 * Tags label your team's Contacts (up to 50 per Contact, 1,000 per team).
 * There is no create call: a Tag is created the first time a write names it
 * (`contacts.upsert`, `contacts.updateMany`, an import). Names are 1 to 64
 * characters without `,` or `;`, unique in the team in any casing; a rename to
 * a taken name is refused with `NAME_TAKEN`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type TagListParams = NonNullable<paths["/v1/tags"]["get"]["parameters"]["query"]>;
export type TagListPage = paths["/v1/tags"]["get"]["responses"]["200"]["content"]["application/json"];
export type TagUpdateBody = NonNullable<paths["/v1/tags/{id}"]["patch"]["requestBody"]>["content"]["application/json"];
export type Tag = paths["/v1/tags/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class TagsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List your team's Tags by name, with their `contact_count`. Pages with an opaque
   * `cursor` until it is `null`.
   * `GET /v1/tags`
   *
   * @example
   * const { items } = await curviate.tags.list({ limit: 100 });
   */
  list(params?: TagListParams): Promise<TagListPage> {
    return this.ctx.request<TagListPage>({
      method: "GET",
      path: "/v1/tags",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Rename a Tag; every Contact carrying it shows the new name. A case-only
   * rename is allowed; a Tag a live Motion uses (not `completed` or
   * `archived`) is refused with `RESOURCE_IN_USE`.
   * `PATCH /v1/tags/{id}`
   *
   * @example
   * await curviate.tags.update("ctg_123", { name: "hot lead" });
   */
  update(tagId: string, body: TagUpdateBody): Promise<Tag> {
    return this.ctx.request<Tag>({
      method: "PATCH",
      path: apiPath`/v1/tags/${tagId}`,
      body,
    });
  }

  /**
   * Delete a Tag from every Contact (bodyless, 204). A Tag a live Motion
   * or a running import uses is refused with `RESOURCE_IN_USE`. Owners and
   * Managers only.
   * `DELETE /v1/tags/{id}`
   *
   * @example
   * await curviate.tags.delete("ctg_123");
   */
  async delete(tagId: string): Promise<void> {
    // The transport hands a bodyless 204 back as an empty buffer; the contract is `void`.
    await this.ctx.request<unknown>({
      method: "DELETE",
      path: apiPath`/v1/tags/${tagId}`,
    });
  }
}
