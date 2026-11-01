/**
 * Incoming events (root-scoped): `curviate.incomingEvents` (8 methods).
 *
 * An incoming event is a private URL any tool can post JSON to. Curviate finds
 * the Contact by the `match` paths and moves the Enrollments waiting for the
 * event (`until: "event.<name>"`), keeping no part of the post. It starts
 * switched off: the first post is the sample (its paths and types only), then
 * switch it on with `update`. The `url` is in full only in the `create` and
 * `rotate` results, masked on every read: treat it like a password. A post to
 * a URL that was rotated out (after its 24 h) or deleted answers `410
 * INCOMING_URL_RETIRED`. Needs Automate.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";
import { apiPath } from "../internal/path.js";
import { pageable, type Pageable } from "../internal/paginate.js";

export type IncomingEventCreateBody = paths["/v1/incoming-events"]["post"]["requestBody"]["content"]["application/json"];
export type IncomingEvent = paths["/v1/incoming-events/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
export type IncomingEventCreateResult = paths["/v1/incoming-events"]["post"]["responses"]["201"]["content"]["application/json"];
export type IncomingEventListParams = NonNullable<paths["/v1/incoming-events"]["get"]["parameters"]["query"]>;
export type IncomingEventPage = paths["/v1/incoming-events"]["get"]["responses"]["200"]["content"]["application/json"];
export type IncomingEventUpdateBody = paths["/v1/incoming-events/{id}"]["patch"]["requestBody"]["content"]["application/json"];
export type IncomingEventArrivals = paths["/v1/incoming-events/{id}/arrivals"]["get"]["responses"]["200"]["content"]["application/json"];

export class IncomingEventsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Create an incoming event, switched off, waiting for its sample. Exactly
   * one of `event_name` (fixed) and `event_name_field` (a path in the post).
   * The result's `url` is the only time it is shown in full.
   * `POST /v1/incoming-events`
   *
   * @example
   * const { id, url } = await curviate.incomingEvents.create({ event_name: "reply_received", match: { email: "lead.email" } });
   */
  create(body: IncomingEventCreateBody): Promise<IncomingEventCreateResult> {
    return this.ctx.request<IncomingEventCreateResult>({ method: "POST", path: "/v1/incoming-events", body });
  }

  /**
   * The Team's incoming events (`url` masked); `event` keeps one event name.
   * `await` it for one page; `for await` it for every one across pages.
   * `GET /v1/incoming-events`
   */
  list(params?: IncomingEventListParams): Pageable<IncomingEventPage> {
    return pageable(
      (p) => this.ctx.request<IncomingEventPage>({ method: "GET", path: "/v1/incoming-events", ...(p ? { query: p } : {}) }),
      params,
    );
  }

  /**
   * One incoming event, `url` masked; `shape` is the captured sample as paths
   * and types only.
   * `GET /v1/incoming-events/{id}`
   */
  get(id: string): Promise<IncomingEvent> {
    return this.ctx.request<IncomingEvent>({ method: "GET", path: apiPath`/v1/incoming-events/${id}` });
  }

  /**
   * Change it; `enabled: true` switches it on once the sample is in. In
   * `match` and `required_header`, `null` removes an entry.
   * `PATCH /v1/incoming-events/{id}`
   *
   * @example
   * await curviate.incomingEvents.update("inc_123", { enabled: true });
   */
  update(id: string, body: IncomingEventUpdateBody): Promise<IncomingEvent> {
    return this.ctx.request<IncomingEvent>({ method: "PATCH", path: apiPath`/v1/incoming-events/${id}`, body });
  }

  /**
   * Delete it: its URL answers `410 INCOMING_URL_RETIRED` from then on.
   * `DELETE /v1/incoming-events/{id}`
   */
  async delete(id: string): Promise<void> {
    await this.ctx.request<unknown>({ method: "DELETE", path: apiPath`/v1/incoming-events/${id}` });
  }

  /**
   * Issue a new URL, in full in this result only. The old one keeps working
   * for 24 hours (`previous_url_valid_until`), then answers `410
   * INCOMING_URL_RETIRED`. Only the creator.
   * `POST /v1/incoming-events/{id}/rotate`
   */
  rotate(id: string): Promise<IncomingEvent> {
    return this.ctx.request<IncomingEvent>({ method: "POST", path: apiPath`/v1/incoming-events/${id}/rotate` });
  }

  /**
   * The next post replaces the sample (paths and types only) and, when
   * switched on, still moves Enrollments. Only the creator.
   * `POST /v1/incoming-events/{id}/capture`
   */
  capture(id: string): Promise<IncomingEvent> {
    return this.ctx.request<IncomingEvent>({ method: "POST", path: apiPath`/v1/incoming-events/${id}/capture` });
  }

  /**
   * The last 20 posts and what each did (`outcome`; accept values you do not
   * know), kept 30 days. Metadata only, never a value from the post.
   * `GET /v1/incoming-events/{id}/arrivals`
   */
  arrivals(id: string): Promise<IncomingEventArrivals> {
    return this.ctx.request<IncomingEventArrivals>({ method: "GET", path: apiPath`/v1/incoming-events/${id}/arrivals` });
  }
}
