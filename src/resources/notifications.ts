/**
 * Notifications resource: 4 methods (root-scoped), `curviate.notifications`.
 *
 * What Curviate needs you to know: an account needs reconnecting, a Motion
 * paused, an import finished, someone joined or left the team. Each person has
 * their own list and read state, per team. Check `unreadCount()` at session
 * start.
 *
 * Not an account's LinkedIn notifications: those are account-scoped,
 * `curviate.account(id).notifications`.
 * Not webhook events either. Wire objects are `curviate_notification` and
 * `curviate_notification_list`.
 *
 * A Notification's `type` is an open list: new values may be added, so
 * tolerate ones you do not know.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type NotificationListQuery = NonNullable<
  paths["/v1/notifications"]["get"]["parameters"]["query"]
>;
export type NotificationListPage =
  paths["/v1/notifications"]["get"]["responses"]["200"]["content"]["application/json"];
export type Notification = NotificationListPage["items"][number];

export type NotificationUnreadCount =
  paths["/v1/notifications/unread-count"]["get"]["responses"]["200"]["content"]["application/json"];

export type NotificationUpdateBody = NonNullable<
  paths["/v1/notifications/{id}"]["patch"]["requestBody"]
>["content"]["application/json"];
export type NotificationUpdateResult =
  paths["/v1/notifications/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type NotificationMarkAllReadBody = NonNullable<
  paths["/v1/notifications/mark-all-read"]["post"]["requestBody"]
>["content"]["application/json"];
export type NotificationMarkAllReadResult =
  paths["/v1/notifications/mark-all-read"]["post"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class NotificationsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * List your Notifications, newest first, with your `unread_count`.
   * `GET /v1/notifications`
   *
   * @param params - optional `filter` (`all` default, `unread`, `archived`),
   *   `limit` (1-100, default 20) and an opaque `cursor` from a prior page.
   *   Page until `cursor` is `null`.
   *
   * @example
   * const { items, unread_count } = await curviate.notifications.list({ filter: "unread" });
   */
  list(params?: NotificationListQuery): Promise<NotificationListPage> {
    return this.ctx.request<NotificationListPage>({
      method: "GET",
      path: "/v1/notifications",
      ...(params ? { query: params } : {}),
    });
  }

  /**
   * Count your unread Notifications. Cheap; call it at session start.
   * `GET /v1/notifications/unread-count`
   *
   * @example
   * const { unread_count } = await curviate.notifications.unreadCount();
   */
  unreadCount(): Promise<NotificationUnreadCount> {
    return this.ctx.request<NotificationUnreadCount>({
      method: "GET",
      path: "/v1/notifications/unread-count",
    });
  }

  /**
   * Mark one Notification read, or archive or unarchive it. Archiving also
   * marks it read; a Notification is never marked unread.
   * `PATCH /v1/notifications/{id}`
   *
   * @param id - the Notification id (`ntf_...`).
   * @param body - `read: true` and/or `archived: true|false`.
   *
   * @example
   * await curviate.notifications.update("ntf_123", { archived: true });
   */
  update(id: string, body: NotificationUpdateBody): Promise<NotificationUpdateResult> {
    return this.ctx.request<NotificationUpdateResult>({
      method: "PATCH",
      path: apiPath`/v1/notifications/${id}`,
      body,
    });
  }

  /**
   * Mark all your Notifications read, or only those created at or before
   * `before` (ISO 8601 with an offset; default now, a future time acts as now).
   * `POST /v1/notifications/mark-all-read`
   *
   * @example
   * await curviate.notifications.markAllRead();
   */
  markAllRead(body: NotificationMarkAllReadBody = {}): Promise<NotificationMarkAllReadResult> {
    return this.ctx.request<NotificationMarkAllReadResult>({
      method: "POST",
      path: "/v1/notifications/mark-all-read",
      body,
    });
  }
}

