/**
 * Webhooks resource: 6 methods (root-scoped).
 *
 * Root-scoped: webhooks are tenant-wide, not account-scoped. All methods are
 * mounted directly on the root client (like `accounts`). `getStateDiff` had
 * no served equivalent and is removed.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type WebhookCreateBody =
  paths["/v1/webhooks"]["post"]["requestBody"]["content"]["application/json"];
export type WebhookCreateResult =
  paths["/v1/webhooks"]["post"]["responses"]["201"]["content"]["application/json"];

export type WebhookListParams = NonNullable<
  paths["/v1/webhooks"]["get"]["parameters"]["query"]
>;
export type WebhookListResult =
  paths["/v1/webhooks"]["get"]["responses"]["200"]["content"]["application/json"];

export type WebhookListEventsResult =
  paths["/v1/webhooks/events"]["get"]["responses"]["200"]["content"]["application/json"];

export type WebhookGetResult =
  paths["/v1/webhooks/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type WebhookUpdateBody =
  paths["/v1/webhooks/{id}"]["patch"]["requestBody"]["content"]["application/json"];
export type WebhookUpdateResult =
  paths["/v1/webhooks/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type WebhookDeleteResult =
  paths["/v1/webhooks/{id}"]["delete"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class WebhooksResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * Register a new webhook endpoint to receive real-time events.
   * `POST /v1/webhooks`
   * The HMAC signing secret is returned exactly once in the 201 response.
   * `account_ids` is required (each webhook is scoped to specific accounts).
   */
  create(body: WebhookCreateBody): Promise<WebhookCreateResult> {
    return this.ctx.request<WebhookCreateResult>({
      method: "POST",
      path: "/v1/webhooks",
      body,
    });
  }

  /**
   * List the tenant's registered webhooks, cursor-paginated.
   * `GET /v1/webhooks`
   */
  list(params?: WebhookListParams): Promise<WebhookListResult> {
    return this.ctx.request<WebhookListResult>({
      method: "GET",
      path: "/v1/webhooks",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Return the complete canonical webhook event catalogue, grouped by source.
   * The response counts itself; no size is stated here, because a hand-typed
   * one is wrong the next time the catalogue grows.
   * `GET /v1/webhooks/events`
   */
  listEvents(): Promise<WebhookListEventsResult> {
    return this.ctx.request<WebhookListEventsResult>({
      method: "GET",
      path: "/v1/webhooks/events",
    });
  }

  /**
   * Return a single webhook owned by the calling tenant.
   * `GET /v1/webhooks/{id}`
   * The plaintext secret is never present on a read, only `secret_prefix`.
   */
  get(id: string): Promise<WebhookGetResult> {
    return this.ctx.request<WebhookGetResult>({
      method: "GET",
      path: apiPath`/v1/webhooks/${id}`,
    });
  }

  /**
   * Update a webhook in place. `source` is immutable.
   * `PATCH /v1/webhooks/{id}`
   */
  update(id: string, body: WebhookUpdateBody): Promise<WebhookUpdateResult> {
    return this.ctx.request<WebhookUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/webhooks/${id}`,
      body,
    });
  }

  /**
   * Permanently remove a webhook subscription.
   * `DELETE /v1/webhooks/{id}`
   */
  delete(id: string): Promise<WebhookDeleteResult> {
    return this.ctx.request<WebhookDeleteResult>({
      method: "DELETE",
      path: apiPath`/v1/webhooks/${id}`,
    });
  }
}
