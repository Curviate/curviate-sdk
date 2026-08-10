/**
 * Notifications resource: 3 methods (NEW namespace).
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar), never a
 * query param or body field.
 *
 * The connected account's own notification centre: list its cards, delete
 * one, or apply "show less like this" to one. Both writes are self-actions;
 * they act only on the account's OWN cards and never notify or touch a
 * third party. Both share a `card_urn` path param: the card's ENTITY urn
 * (`urn:li:fsd_notificationCard:(...)`, the `card_urn` field of a
 * {@link NotificationsResource.list} item), not its secondary `object_urn`,
 * which targets the wrong notification. A card urn embeds `(`, `)`, `:`,
 * `,`; pass it to `delete`/`showLess` raw, the SDK percent-encodes it into
 * the path segment, and the server decodes it back.
 *
 * Both writes are **idempotent** and **effective within a few seconds**:
 * deleting (or show-lessing) a card that is already gone succeeds with 200,
 * not an error, only a `card_urn` that never existed on this account 404s.
 * A `list()` read immediately after a write may still include the card for
 * a moment; that alone is not a failure signal; the 200 already confirms
 * the card was resolved and the removal accepted. (An early, unverified
 * assumption of a ~30s eventual-consistency window did not hold up under
 * measurement, removal lands in ~2-6s in practice; re-read after a short
 * delay, not instantly, if you need to confirm.)
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type NotificationListPage =
  paths["/v1/{account_id}/notifications"]["get"]["responses"]["200"]["content"]["application/json"];
export type NotificationListQuery = NonNullable<
  paths["/v1/{account_id}/notifications"]["get"]["parameters"]["query"]
>;

export type NotificationDeleteResult =
  paths["/v1/{account_id}/notifications/{card_urn}"]["delete"]["responses"]["200"]["content"]["application/json"];

export type NotificationShowLessResult =
  paths["/v1/{account_id}/notifications/{card_urn}/show-less"]["post"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class NotificationsResource {
  constructor(protected readonly ctx: RequestContext) {}

  /**
   * List the connected account's notification cards, newest first, plus
   * the account-level `unread_count` (the unseen badge, NOT a count of
   * `items`) and `latest_published_at` (a cheap poll watermark). Injected
   * promo/suggestion cards are included and flagged (`injected:true`),
   * never filtered.
   * `GET /v1/{account_id}/notifications`
   *
   * @param params - optional `filter` (7-token enum, default `all`),
   *   `limit` (1-100, default 20), and an opaque `cursor` from a prior
   *   response. Page until the returned `cursor` is `null`.
   */
  list(params?: NotificationListQuery): Promise<NotificationListPage> {
    return this.ctx.request<NotificationListPage>({
      method: "GET",
      path: "/v1/{account_id}/notifications",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Delete one of the connected account's own notification cards by its
   * card urn. A self-action, no third party is notified. This cannot be
   * undone.
   *
   * **Safe to retry.** Idempotent: deleting a card you already deleted
   * succeeds with `200`, not an error; a client that retries after a
   * timeout is never punished for it. Only a `card_urn` that never existed
   * on this account 404s.
   *
   * **Timing.** The removal takes effect within a few seconds; a
   * {@link list} read immediately after this call may still include the
   * card for a moment. That is not a failure signal; the `200` is already
   * confirmation the card was resolved and the removal accepted. Re-read
   * after a short delay, not instantly, if you need to visually confirm.
   *
   * `DELETE /v1/{account_id}/notifications/{card_urn}`
   *
   * @param cardUrn - the card's entity urn, raw/unencoded (the `card_urn`
   *   field of a {@link list} item, `urn:li:fsd_notificationCard:(...)`,
   *   NOT `object_urn`, which targets the wrong notification). The SDK
   *   percent-encodes it into the path.
   */
  delete(cardUrn: string): Promise<NotificationDeleteResult> {
    return this.ctx.request<NotificationDeleteResult>({
      method: "DELETE",
      path: apiPath`/v1/{account_id}/notifications/${cardUrn}`,
    });
  }

  /**
   * Apply "show less like this" to the source of one of the connected
   * account's own notification cards, a self-action, same card handle and
   * timing/retry contract as {@link delete}. For network-activity cards (a
   * repost, comment, or reaction by your network) this **removes the
   * card**, the same effect as `delete`; LinkedIn exposes no separate,
   * softer signal for these cards; this method exists so the calling
   * intent reads clearly, not because it behaves differently. This cannot
   * be undone.
   *
   * **Safe to retry**, same timing as {@link delete}: idempotent (a repeat
   * is a `200`, not an error), effective within a few seconds, a
   * still-visible card on an immediate {@link list} re-read is not a
   * failure signal.
   *
   * `POST /v1/{account_id}/notifications/{card_urn}/show-less`
   *
   * @param cardUrn - the card's entity urn, raw/unencoded (see
   *   {@link delete}). The SDK percent-encodes it into the path.
   */
  showLess(cardUrn: string): Promise<NotificationShowLessResult> {
    return this.ctx.request<NotificationShowLessResult>({
      method: "POST",
      path: apiPath`/v1/{account_id}/notifications/${cardUrn}/show-less`,
    });
  }
}
