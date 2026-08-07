/**
 * Resource namespace assembly.
 *
 * The surface is split cleanly in two, with no overlap:
 * - **Root-scoped** (`accounts`, `auth`, `webhooks`) hang off the root client
 *   only. Connected-account management, connect/reconnect, and webhook
 *   registration are tenant-wide concerns, not per-account ones; they carry no
 *   `account_id` path segment.
 * - **Account-scoped** (everything else) hang off `curviate.account(id)` only.
 *   Every one of their paths leads with the fixed `account_id` segment, so they
 *   cannot function without an account bound and are never mounted at the root.
 *
 * {@link buildRootNamespaces} and {@link buildAccountScopedNamespaces} realize
 * the two disjoint halves.
 */
import type { RequestContext } from "../internal/context.js";
import { AccountsResource } from "./accounts.js";
import { AuthResource } from "./auth.js";
import { MessagingResource } from "./messaging.js";
import { UsersResource } from "./users.js";
import { InvitesResource } from "./invites.js";
import { SearchResource } from "./search.js";
import { PostsResource } from "./posts.js";
import { CommentsResource } from "./comments.js";
import { ProfileResource } from "./profile.js";
import { GroupsResource } from "./groups.js";
import { FeedResource } from "./feed.js";
import { InboxesResource } from "./inboxes.js";
import { NotificationsResource } from "./notifications.js";
import { SalesNavigatorResource } from "./sales-navigator.js";
import { RecruiterResource } from "./recruiter.js";
import { JobsResource } from "./jobs.js";
import { CompaniesResource } from "./companies.js";
import { WebhooksResource } from "./webhooks.js";

export { AccountsResource } from "./accounts.js";
export { AuthResource } from "./auth.js";
export { MessagingResource } from "./messaging.js";
export { UsersResource } from "./users.js";
export { InvitesResource } from "./invites.js";
export { SearchResource } from "./search.js";
export { PostsResource } from "./posts.js";
export { CommentsResource } from "./comments.js";
export { ProfileResource } from "./profile.js";
export { GroupsResource } from "./groups.js";
export { FeedResource } from "./feed.js";
export { InboxesResource } from "./inboxes.js";
export { NotificationsResource } from "./notifications.js";
export { SalesNavigatorResource } from "./sales-navigator.js";
export { RecruiterResource } from "./recruiter.js";
export { JobsResource } from "./jobs.js";
export { CompaniesResource } from "./companies.js";
export { WebhooksResource } from "./webhooks.js";

/** The full namespace surface, shared by the root client and account scopes. */
export interface ResourceNamespaces {
  accounts: AccountsResource;
  auth: AuthResource;
  messaging: MessagingResource;
  users: UsersResource;
  invites: InvitesResource;
  search: SearchResource;
  posts: PostsResource;
  comments: CommentsResource;
  profile: ProfileResource;
  groups: GroupsResource;
  feed: FeedResource;
  inboxes: InboxesResource;
  notifications: NotificationsResource;
  salesNavigator: SalesNavigatorResource;
  recruiter: RecruiterResource;
  jobs: JobsResource;
  companies: CompaniesResource;
  webhooks: WebhooksResource;
}

/** Build the namespace bag for a given request context. */
export function buildNamespaces(ctx: RequestContext): ResourceNamespaces {
  return {
    accounts: new AccountsResource(ctx),
    auth: new AuthResource(ctx),
    messaging: new MessagingResource(ctx),
    users: new UsersResource(ctx),
    invites: new InvitesResource(ctx),
    search: new SearchResource(ctx),
    posts: new PostsResource(ctx),
    comments: new CommentsResource(ctx),
    profile: new ProfileResource(ctx),
    groups: new GroupsResource(ctx),
    feed: new FeedResource(ctx),
    inboxes: new InboxesResource(ctx),
    notifications: new NotificationsResource(ctx),
    salesNavigator: new SalesNavigatorResource(ctx),
    recruiter: new RecruiterResource(ctx),
    jobs: new JobsResource(ctx),
    companies: new CompaniesResource(ctx),
    webhooks: new WebhooksResource(ctx),
  };
}

/**
 * The root-client surface, exactly the three tenant-wide namespaces. The root
 * client mounts these and nothing else; account-scoped namespaces are reachable
 * only via `curviate.account(id)`.
 */
export type RootNamespaces = Pick<
  ResourceNamespaces,
  "accounts" | "auth" | "webhooks"
>;

/** Build the root-client namespace bag (`accounts`, `auth`, `webhooks`). */
export function buildRootNamespaces(ctx: RequestContext): RootNamespaces {
  return {
    accounts: new AccountsResource(ctx),
    auth: new AuthResource(ctx),
    webhooks: new WebhooksResource(ctx),
  };
}

/**
 * The account-scoped accessor surface, every namespace except the three
 * root-only ones (`accounts`, `auth`, `webhooks`). The fixed `account_id` is
 * injected by the bound context as the leading path segment.
 */
export type AccountScopedNamespaces = Omit<
  ResourceNamespaces,
  "accounts" | "auth" | "webhooks"
>;

/**
 * Build the account-scoped namespace bag (drops `accounts`, `auth`, and
 * `webhooks`, the root-only namespaces).
 */
export function buildAccountScopedNamespaces(
  ctx: RequestContext,
): AccountScopedNamespaces {
  const {
    accounts: _accounts,
    auth: _auth,
    webhooks: _webhooks,
    ...rest
  } = buildNamespaces(ctx);
  void _accounts;
  void _auth;
  void _webhooks;
  return rest;
}
