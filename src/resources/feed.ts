/**
 * Feed resource: 1 method (NEW namespace).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * Reads the connected account's home feed, the raw material an agent works
 * from to decide what to engage with. The feed is an unbounded, reordering
 * stream, so the list carries no total count; walk it with the returned
 * `cursor`.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type FeedPostListPage =
  paths["/v1/{account_id}/feed/home"]["get"]["responses"]["200"]["content"]["application/json"];
export type FeedHomeQuery = NonNullable<
  paths["/v1/{account_id}/feed/home"]["get"]["parameters"]["query"]
>;

// ─── Resource class ───────────────────────────────────────────────────────────

export class FeedResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Read the connected account's LinkedIn home feed as agent-actionable posts.
   * `GET /v1/{account_id}/feed/home`
   *
   * Pass `{ sort }` to choose the order: `recent` (reverse-chronological,
   * the default) or `relevant` (LinkedIn's ranked "top" feed). The feed is an
   * unbounded, reordering stream with no total count; walk it with the
   * returned `cursor` until `cursor` is null. When a `cursor` is supplied its
   * carrier is authoritative and `sort` is ignored.
   *
   * @param params - optional `{ sort }`, `limit` (1-100, default 20), and an
   *   opaque `cursor` from a prior response.
   */
  home(params?: FeedHomeQuery): Promise<FeedPostListPage> {
    return this.ctx.request<FeedPostListPage>({
      method: "GET",
      path: `/v1/{account_id}/feed/home`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }
}
