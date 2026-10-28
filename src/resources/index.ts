/**
 * Resource namespace assembly.
 *
 * The surface is split in two:
 * - **Root-scoped** (`accounts`, `auth`, `connectRequests`, `webhooks`, `drafts`,
 *   `teams`, `notifications`, `contacts`, `contactLists`, `tags`, `motions`,
 *   `enrollments`, `tier`) hang off the
 *   root client only. Connected-account management, connect/reconnect, webhook
 *   registration, Drafts (a Draft's account is optional), teams, Curviate's own
 *   Notifications and the team's Contacts, lists, Tags, Motions and Enrollments are
 *   team-wide concerns, not per-account ones; they carry no `account_id` path
 *   segment.
 * - **Account-scoped** (everything else) hang off `curviate.account(id)` only.
 *   Every one of their paths leads with the fixed `account_id` segment, so they
 *   cannot function without an account bound and are never mounted at the root.
 *
 * {@link buildRootNamespaces} and {@link buildAccountScopedNamespaces} realize
 * the two halves. One key appears in both with a different class:
 * `notifications` is Curviate's Notifications at the root
 * ({@link NotificationsResource}) and the account's LinkedIn notifications in
 * an account scope ({@link LinkedInNotificationsResource}).
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
import { LinkedInNotificationsResource } from "./linkedin-notifications.js";
import { NotificationsResource } from "./notifications.js";
import { ConnectRequestsResource } from "./connect-requests.js";
import { TeamsResource } from "./teams.js";
import { ContactsResource } from "./contacts.js";
import { ContactListsResource } from "./contact-lists.js";
import { TagsResource } from "./tags.js";
import { MotionsResource, EnrollmentsResource } from "./motions.js";
import { TierResource } from "./tier.js";
import { NetworkResource } from "./network.js";
import { UniboxResource } from "./unibox.js";
import { AnalyticsResource } from "./analytics.js";
import { BillingResource } from "./billing.js";
import { DoNotContactResource } from "./do-not-contact.js";
import { ExportsResource } from "./exports.js";
import { SalesNavigatorResource } from "./sales-navigator.js";
import { RecruiterResource } from "./recruiter.js";
import { JobsResource } from "./jobs.js";
import { CompaniesResource } from "./companies.js";
import { WebhooksResource } from "./webhooks.js";
import { DraftsResource } from "./drafts.js";

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
export { LinkedInNotificationsResource } from "./linkedin-notifications.js";
export { NotificationsResource } from "./notifications.js";
export { ConnectRequestsResource } from "./connect-requests.js";
export { TeamsResource } from "./teams.js";
export { ContactsResource, ContactImportsResource } from "./contacts.js";
export { ContactListsResource } from "./contact-lists.js";
export { TagsResource } from "./tags.js";
export { MotionsResource, EnrollmentsResource } from "./motions.js";
export { TierResource } from "./tier.js";
export { NetworkResource, NetworkConnectionsResource } from "./network.js";
export { UniboxResource, UniboxAccountsResource } from "./unibox.js";
export { AnalyticsResource, AnalyticsMotionsResource, AnalyticsEventsResource } from "./analytics.js";
export { BillingResource, BillingSeatsResource, BillingInvoicesResource } from "./billing.js";
export { DoNotContactResource } from "./do-not-contact.js";
export { ExportsResource } from "./exports.js";
export { SalesNavigatorResource } from "./sales-navigator.js";
export { RecruiterResource } from "./recruiter.js";
export { JobsResource } from "./jobs.js";
export { CompaniesResource } from "./companies.js";
export { WebhooksResource } from "./webhooks.js";
export { DraftsResource } from "./drafts.js";

/**
 * The shared namespace bag the account scope is cut from (`notifications` here
 * is the account's LinkedIn notifications).
 */
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
  notifications: LinkedInNotificationsResource;
  salesNavigator: SalesNavigatorResource;
  recruiter: RecruiterResource;
  jobs: JobsResource;
  companies: CompaniesResource;
  webhooks: WebhooksResource;
  drafts: DraftsResource;
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
    notifications: new LinkedInNotificationsResource(ctx),
    salesNavigator: new SalesNavigatorResource(ctx),
    recruiter: new RecruiterResource(ctx),
    jobs: new JobsResource(ctx),
    companies: new CompaniesResource(ctx),
    webhooks: new WebhooksResource(ctx),
    drafts: new DraftsResource(ctx),
  };
}

/**
 * The root-client surface: the team-wide namespaces. Account-scoped namespaces
 * are reachable only via `curviate.account(id)`.
 */
export interface RootNamespaces
  extends Pick<ResourceNamespaces, "accounts" | "auth" | "webhooks" | "drafts"> {
  connectRequests: ConnectRequestsResource;
  teams: TeamsResource;
  /** Curviate's own Notifications, not the account's LinkedIn ones. */
  notifications: NotificationsResource;
  contacts: ContactsResource;
  contactLists: ContactListsResource;
  tags: TagsResource;
  motions: MotionsResource;
  enrollments: EnrollmentsResource;
  tier: TierResource;
  network: NetworkResource;
  unibox: UniboxResource;
  analytics: AnalyticsResource;
  billing: BillingResource;
  doNotContact: DoNotContactResource;
  exports: ExportsResource;
}

/** Build the root-client namespace bag. */
export function buildRootNamespaces(ctx: RequestContext): RootNamespaces {
  return {
    accounts: new AccountsResource(ctx),
    auth: new AuthResource(ctx),
    connectRequests: new ConnectRequestsResource(ctx),
    webhooks: new WebhooksResource(ctx),
    drafts: new DraftsResource(ctx),
    teams: new TeamsResource(ctx),
    notifications: new NotificationsResource(ctx),
    contacts: new ContactsResource(ctx),
    contactLists: new ContactListsResource(ctx),
    tags: new TagsResource(ctx),
    motions: new MotionsResource(ctx),
    enrollments: new EnrollmentsResource(ctx),
    tier: new TierResource(ctx),
    network: new NetworkResource(ctx),
    unibox: new UniboxResource(ctx),
    analytics: new AnalyticsResource(ctx),
    billing: new BillingResource(ctx),
    doNotContact: new DoNotContactResource(ctx),
    exports: new ExportsResource(ctx),
  };
}

/**
 * The account-scoped accessor surface, every namespace except the four
 * root-only ones (`accounts`, `auth`, `webhooks`, `drafts`). The fixed `account_id` is
 * injected by the bound context as the leading path segment.
 */
export type AccountScopedNamespaces = Omit<
  ResourceNamespaces,
  "accounts" | "auth" | "webhooks" | "drafts"
>;

/**
 * Build the account-scoped namespace bag (drops `accounts`, `auth`,
 * `webhooks` and `drafts`, the root-only namespaces).
 */
export function buildAccountScopedNamespaces(
  ctx: RequestContext,
): AccountScopedNamespaces {
  const {
    accounts: _accounts,
    auth: _auth,
    webhooks: _webhooks,
    drafts: _drafts,
    ...rest
  } = buildNamespaces(ctx);
  void _accounts;
  void _auth;
  void _webhooks;
  void _drafts;
  return rest;
}
