/**
 * Webhooks resource: 10 methods plus `deliveries` (2 methods), root-scoped.
 *
 * Root-scoped: webhooks are tenant-wide, not account-scoped. All methods are
 * mounted directly on the root client (like `accounts`). `getStateDiff` had
 * no served equivalent and is removed.
 *
 * Reads that look the same but mean something new:
 * - `request_url` is read back masked (`https://host/•••`): the path and query
 *   often carry a secret. Sending the masked value back on `update` keeps the
 *   stored URL; `request_url_fingerprint` changes when the URL does.
 * - A `headers` entry on `update` with a key and no value keeps that header's
 *   stored value; a new key needs a value.
 * - A delivered body's `id` is the delivery id (`wdl_`), the same on every
 *   attempt and redelivery, and `delivered_at` is when the body was rendered,
 *   not when an attempt was made.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { pageable, type Pageable } from "../internal/paginate.js";

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

export type WebhookVariablesParams = paths["/v1/webhooks/variables"]["get"]["parameters"]["query"];
export type WebhookVariablesResult =
  paths["/v1/webhooks/variables"]["get"]["responses"]["200"]["content"]["application/json"];

export type WebhookTestBody = NonNullable<
  paths["/v1/webhooks/{id}/test"]["post"]["requestBody"]
>["content"]["application/json"];
export type WebhookTestResult =
  paths["/v1/webhooks/{id}/test"]["post"]["responses"]["202"]["content"]["application/json"];

export type WebhookRotateSecretResult =
  paths["/v1/webhooks/{id}/rotate-secret"]["post"]["responses"]["200"]["content"]["application/json"];

export type WebhookDeliveryListParams = NonNullable<
  paths["/v1/webhooks/{id}/deliveries"]["get"]["parameters"]["query"]
>;
export type WebhookDeliveryPage =
  paths["/v1/webhooks/{id}/deliveries"]["get"]["responses"]["200"]["content"]["application/json"];
export type WebhookDelivery =
  paths["/v1/webhooks/{id}/deliveries/{delivery_id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type WebhookRedeliverResult =
  paths["/v1/webhooks/{id}/deliveries/{delivery_id}/redeliver"]["post"]["responses"]["202"]["content"]["application/json"];

// ─── Resource classes ───────────────────────────────────────────────────────────

/** `curviate.webhooks.deliveries`: what was sent to a webhook, metadata only. */
export class WebhookDeliveriesResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * The webhook's deliveries of the last 30 days, newest first: one item per
   * delivery (one event rendered once), attempts counted. `failed: true` keeps
   * those that ended `failed` or `not_retried`. No body is kept. An item's `id`
   * is the same value as the delivered body's `id`. `await` it for one page;
   * `for await` it for every delivery across pages.
   * `GET /v1/webhooks/{id}/deliveries`
   *
   * @example
   * for await (const d of curviate.webhooks.deliveries.list("wh_123", { failed: true })) console.log(d.id, d.status);
   */
  list(webhookId: string, params?: WebhookDeliveryListParams): Pageable<WebhookDeliveryPage> {
    return pageable(
      (p) =>
        this.ctx.request<WebhookDeliveryPage>({
          method: "GET",
          path: apiPath`/v1/webhooks/${webhookId}/deliveries`,
          ...(p ? { query: p } : {}),
        }),
      params,
    );
  }

  /**
   * One delivery: status, reason, attempts, the receiver's latest code and
   * timing, and `redeliverable_until`.
   * `GET /v1/webhooks/{id}/deliveries/{delivery_id}`
   *
   * @example
   * const d = await curviate.webhooks.deliveries.get("wh_123", "wdl_456");
   */
  get(webhookId: string, deliveryId: string): Promise<WebhookDelivery> {
    return this.ctx.request<WebhookDelivery>({
      method: "GET",
      path: apiPath`/v1/webhooks/${webhookId}/deliveries/${deliveryId}`,
    });
  }
}

export class WebhooksResource {
  /** The webhook's deliveries: `list` and `get`. */
  readonly deliveries: WebhookDeliveriesResource;

  constructor(protected readonly ctx: RequestContext) {
    this.deliveries = new WebhookDeliveriesResource(ctx);
  }

  /**
   * Register a new webhook endpoint to receive real-time events.
   * `POST /v1/webhooks`
   * The HMAC signing secret is returned exactly once in the 201 response.
   * `account_ids` scopes a webhook to specific accounts (`acc_` ids you own)
   * and is required for `messaging` and `user`. For `account_status` it is
   * optional: omit it to receive status events for every current and future
   * account of the workspace (reads then return `account_ids: null`). An
   * explicit `[]` is rejected.
   *
   * `body_template` (a JSON text with `{{variables}}` in its strings) replaces
   * the standard payload; check it offline first with
   * `validateWebhookTemplate`. A template that fails is refused with
   * `WEBHOOK_TEMPLATE_INVALID` (every finding with `line` and `col`); its
   * warnings come back in `warnings`. `custom_event_names` narrows
   * `motion.custom_event` to those names (`null`: every one).
   *
   * @example
   * await curviate.webhooks.create({ source: "account_status", request_url: "https://example.com/hooks" });
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
   * `request_url` reads masked (`https://host/•••`). `disabled_reason`,
   * `failing_since` and `last_delivery_status_code` say how it is delivering.
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
   * `account_ids: null` switches an `account_status` webhook to every current
   * and future account. Sending back the masked `request_url` you read keeps
   * the stored URL. A `headers` entry with a key and no value keeps that
   * header's stored value; a new key needs a value. Setting `body_template`
   * lints it (`WEBHOOK_TEMPLATE_INVALID` on an error; warnings in the result's
   * `warnings`). Never rotates the secret: use {@link rotateSecret}.
   *
   * @example
   * // keep the stored Authorization value, replace the rest
   * await curviate.webhooks.update("wh_123", { headers: [{ key: "Authorization" }, { key: "X-Env", value: "prod" }] });
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

  /**
   * The variables a body template of this source may use, each with its
   * scope, type and an example from the synthetic sample. On `motion` it also
   * lists every Enrollment value your Team's current Sequences save
   * (`{{enrollment.<key>}}`), with `saved_by`.
   * `GET /v1/webhooks/variables`
   *
   * @example
   * const { variables } = await curviate.webhooks.variables({ source: "motion" });
   */
  variables(params: WebhookVariablesParams): Promise<WebhookVariablesResult> {
    return this.ctx.request<WebhookVariablesResult>({
      method: "GET",
      path: "/v1/webhooks/variables",
      query: params,
    });
  }

  /**
   * Queue a synthetic delivery to confirm your endpoint receives and verifies
   * deliveries: one signed attempt with `Curviate-Test: true`, never changing
   * the webhook's health. `event` picks the subscribed event it stands for
   * (default: the first); the delivered `event` is always `webhook.test`, with
   * `data.test_event` the one you picked. Read the attempt with
   * `deliveries.get(id, delivery_id)`.
   * `POST /v1/webhooks/{id}/test`
   *
   * @example
   * const { delivery_id } = await curviate.webhooks.test("wh_123", { event: "enrollment.finished" });
   */
  test(id: string, body?: WebhookTestBody): Promise<WebhookTestResult> {
    return this.ctx.request<WebhookTestResult>({
      method: "POST",
      path: apiPath`/v1/webhooks/${id}/test`,
      body: body ?? {},
    });
  }

  /**
   * Send a delivery's original request again, byte for byte (never
   * re-rendered), freshly signed, as one attempt with no retries. Works until
   * `redeliverable_until` (receipt + 24 h) on an enabled webhook; a success
   * cancels its pending retries. Refusals: `NOTHING_TO_REDELIVER` (never
   * sent), `REDELIVERY_EXPIRED`, `WEBHOOK_DISABLED`, `DELIVERY_IN_FLIGHT`
   * (retry shortly).
   * `POST /v1/webhooks/{id}/deliveries/{delivery_id}/redeliver`
   *
   * @example
   * await curviate.webhooks.redeliver("wh_123", "wdl_456");
   */
  redeliver(id: string, deliveryId: string): Promise<WebhookRedeliverResult> {
    return this.ctx.request<WebhookRedeliverResult>({
      method: "POST",
      path: apiPath`/v1/webhooks/${id}/deliveries/${deliveryId}/redeliver`,
    });
  }

  /**
   * Issue a new signing secret, returned once: store it now. For 24 hours
   * (`previous_valid_until`) every delivery carries both signatures
   * (`v1=<new>,v1=<old>`) and `constructEvent` accepts either secret, so
   * deploy the new one inside that window. A second rotation before then
   * drops the oldest secret at once. Only the webhook's creator may rotate.
   * `POST /v1/webhooks/{id}/rotate-secret`
   *
   * @example
   * const { secret, previous_valid_until } = await curviate.webhooks.rotateSecret("wh_123");
   */
  rotateSecret(id: string): Promise<WebhookRotateSecretResult> {
    return this.ctx.request<WebhookRotateSecretResult>({
      method: "POST",
      path: apiPath`/v1/webhooks/${id}/rotate-secret`,
    });
  }
}
