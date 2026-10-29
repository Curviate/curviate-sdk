// Public-surface bijection.
//
// The SDK must expose EXACTLY the intended public method surface — one method
// per served operation, no more, no fewer. This test pins that surface as a
// table (namespace -> exact method set), enumerates the real prototype methods
// on a constructed client, and asserts set-equality per namespace. A phantom
// (extra) public method fails by name; a missing method fails by name; the
// total must be 270 methods across 43 namespaces. A separate compile-time block
// proves every removed method is gone at the type level.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Curviate } from "../src/index.js";

const client = new Curviate({ apiKey: "cvt_test_parity" });
const acc = client.account("acc_test");

// Root-scoped namespaces (hang off the root client only).
const ROOT_SURFACE: Record<string, readonly string[]> = {
  accounts: [
    "list",
    "listSeats",
    "get",
    "update",
    "disconnect",
    "addSeats",
    "cancelSeat",
    "revertSeatCancellation",
    "setTeamAccess",
    "metrics",
    "overview",
    "getSafetyPolicy",
    "updateSafetyPolicy",
  ],
  auth: [
    "intent",
    "solveCheckpoint",
    "requestCheckpoint",
    "pollCheckpoint",
    "getSession",
  ],
  webhooks: ["create", "list", "listEvents", "get", "update", "delete", "variables", "test", "redeliver", "rotateSecret"],
  "webhooks.deliveries": ["list", "get"],
  drafts: [
    "create",
    "list",
    "get",
    "update",
    "delete",
    "publish",
    "uploadAttachment",
  ],
  connectRequests: ["create", "get", "cancel"],
  teams: [
    "list",
    "getCurrent",
    "updateCurrent",
    "listMembers",
    "updateMember",
    "removeMember",
    "createInvites",
    "listInvites",
    "resendInvite",
    "revokeInvite",
    "create",
    "setLogo",
    "removeLogo",
  ],
  // Curviate's own Notifications. Same key as the account-scoped LinkedIn
  // notifications below, different class.
  notifications: ["list", "unreadCount", "update", "markAllRead"],
  contacts: ["list", "get", "upsert", "update", "delete", "deleteMany", "updateMany", "enrich", "export"],
  "contacts.imports": ["create", "get", "list", "rows"],
  contactLists: ["create", "list", "get", "update", "delete"],
  tags: ["list", "update", "delete"],
  motions: [
    "create", "list", "get", "update", "delete", "start", "pause", "resume", "archive",
    "preview", "getSequenceVersion", "addContacts", "removeContacts",
  ],
  enrollments: ["list", "get", "stop", "pause", "resume", "events", "reassign", "bulk", "retry", "signal"],
  tier: ["get"],
  network: ["syncStatus", "resync"],
  "network.connections": ["list"],
  unibox: ["list", "get", "unreadCount", "refresh", "tagContact", "enroll"],
  "unibox.accounts": ["list", "update"],
  analytics: ["activity", "export"],
  "analytics.motions": ["list", "get"],
  "analytics.events": ["list"],
  "billing.seats": ["lend", "return"],
  "billing.invoices": ["list", "pdf"],
  doNotContact: ["list", "get", "add", "update", "remove"],
  exports: ["create", "get", "download"],
  incomingEvents: ["create", "list", "get", "update", "delete", "rotate", "capture", "arrivals"],
  "tenant.beta": ["get", "set"],
};

// Account-scoped namespaces (hang off account(id) only).
const ACCOUNT_SURFACE: Record<string, readonly string[]> = {
  users: [
    "get",
    "update",
    "listRelations",
    "listFollowers",
    "listFollowing",
    "follow",
    "unfollow",
    "getInMailCredits",
    "endorseSkill",
  ],
  companies: [
    "get",
    "employees",
    "posts",
    "jobs",
    "managed",
    "followers",
    "invitableFollowers",
    "followInvite",
    "chats",
    "chat",
    "messages",
    "message",
    "searchChats",
    "sendMessage",
  ],
  search: [
    "getParameters",
    "people",
    "companies",
    "posts",
    "jobs",
    "fromUrl",
    "groups",
    "services",
    "getServiceParameters",
  ],
  messaging: [
    "listChats",
    "startChat",
    "getChat",
    "markChatRead",
    "listMessages",
    "sendMessage",
    "getMessage",
    "editMessage",
    "deleteMessage",
    "addReaction",
    "getAttachment",
    "sendInMail",
    "searchChats",
  ],
  comments: [
    "listUserComments",
    "create",
    "edit",
    "delete",
    "reply",
    "listReplies",
    "listReactions",
    "addReaction",
    "removeReaction",
  ],
  profile: ["subscription", "analytics", "visitors", "ssi"],
  groups: ["list", "get", "members"],
  feed: ["home"],
  inboxes: ["list", "listChats"],
  notifications: ["list", "delete", "showLess"],
  posts: [
    "listComments",
    "get",
    "delete",
    "create",
    "listUserPosts",
    "listReactions",
    "react",
    "unreact",
    "listUserReactions",
    "listSaved",
    "save",
    "unsave",
  ],
  invites: ["send", "listSent", "listReceived", "accept", "decline", "cancel"],
  jobs: [
    "list",
    "create",
    "get",
    "update",
    "getBudget",
    "publish",
    "close",
    "listApplicants",
    "getApplicant",
    "downloadResume",
  ],
  recruiter: [
    "getProfile",
    "startChat",
    "searchPeople",
    "searchParameters",
    "searchTalentPool",
    "searchFromUrl",
    "listProjects",
    "getProject",
    "updateProject",
    "listPipeline",
    "getProjectJob",
    "createProjectJob",
    "getProjectJobBudget",
    "createJob",
    "listJobs",
    "getJob",
    "updateProjectJob",
    "publishJob",
    "closeJob",
    "saveCandidate",
    "listApplicants",
    "getApplicant",
    "downloadResume",
  ],
  salesNavigator: [
    "searchPeople",
    "searchCompanies",
    "getParameters",
    "startChat",
    "getProfile",
    "accountLists",
    "leadLists",
    "browseAccountList",
    "browseLeadList",
    "saveAccount",
    "saveLead",
    "searchFromUrl",
  ],
};

/** The real public methods on a resource instance's prototype. */
function ownMethods(instance: object): Set<string> {
  const proto = Object.getPrototypeOf(instance) as object;
  return new Set(
    Object.getOwnPropertyNames(proto).filter(
      (name) =>
        name !== "constructor" &&
        typeof (instance as Record<string, unknown>)[name] === "function",
    ),
  );
}

const rootInstances: Record<string, object> = {
  accounts: client.accounts,
  auth: client.auth,
  webhooks: client.webhooks,
  "webhooks.deliveries": client.webhooks.deliveries,
  drafts: client.drafts,
  connectRequests: client.connectRequests,
  teams: client.teams,
  notifications: client.notifications,
  contacts: client.contacts,
  "contacts.imports": client.contacts.imports,
  contactLists: client.contactLists,
  tags: client.tags,
  motions: client.motions,
  enrollments: client.enrollments,
  tier: client.tier,
  network: client.network,
  "network.connections": client.network.connections,
  unibox: client.unibox,
  "unibox.accounts": client.unibox.accounts,
  analytics: client.analytics,
  "analytics.motions": client.analytics.motions,
  "analytics.events": client.analytics.events,
  "billing.seats": client.billing.seats,
  "billing.invoices": client.billing.invoices,
  doNotContact: client.doNotContact,
  exports: client.exports,
  incomingEvents: client.incomingEvents,
  "tenant.beta": client.tenant.beta,
};

const accountInstances: Record<string, object> = {
  users: acc.users,
  companies: acc.companies,
  search: acc.search,
  messaging: acc.messaging,
  comments: acc.comments,
  profile: acc.profile,
  groups: acc.groups,
  feed: acc.feed,
  inboxes: acc.inboxes,
  notifications: acc.notifications,
  posts: acc.posts,
  invites: acc.invites,
  jobs: acc.jobs,
  recruiter: acc.recruiter,
  salesNavigator: acc.salesNavigator,
};

describe("namespace mounting", () => {
  it("root client exposes exactly its root namespaces", () => {
    for (const ns of Object.keys(ROOT_SURFACE)) {
      expect(client, `root namespace ${ns}`).toHaveProperty(ns);
    }
    // None of the account-scoped namespaces leak onto the root client.
    // `notifications` is the one shared key: a different class at the root.
    for (const ns of Object.keys(ACCOUNT_SURFACE).filter((n) => n !== "notifications")) {
      expect(client, `${ns} must not be root-mounted`).not.toHaveProperty(ns);
    }
    // The old profiles name is gone at the root too.
    expect(client).not.toHaveProperty("profiles");
  });

  it("account(id) exposes exactly the 15 account-scoped namespaces", () => {
    expect(new Set(Object.keys(acc))).toEqual(new Set(Object.keys(ACCOUNT_SURFACE)));
    // Root-only namespaces and the retired profiles name are absent.
    for (const ns of ["accounts", "auth", "connectRequests", "webhooks", "drafts", "teams", "contacts", "contactLists", "tags", "motions", "enrollments", "tier", "network", "unibox", "analytics", "profiles"]) {
      expect(acc, `${ns} must not be account-mounted`).not.toHaveProperty(ns);
    }
  });
});

describe("per-namespace method bijection", () => {
  for (const [ns, expected] of Object.entries(ROOT_SURFACE)) {
    it(`root ${ns} exposes exactly its ${expected.length} methods`, () => {
      expect(ownMethods(rootInstances[ns]!)).toEqual(new Set(expected));
    });
  }
  for (const [ns, expected] of Object.entries(ACCOUNT_SURFACE)) {
    it(`account ${ns} exposes exactly its ${expected.length} methods`, () => {
      expect(ownMethods(accountInstances[ns]!)).toEqual(new Set(expected));
    });
  }
});

describe("total mapped surface", () => {
  it("the intended table sums to 270 methods across 43 namespaces", () => {
    const namespaces = [
      ...Object.values(ROOT_SURFACE),
      ...Object.values(ACCOUNT_SURFACE),
    ];
    expect(namespaces.length).toBe(43);
    const total = namespaces.reduce((n, methods) => n + methods.length, 0);
    expect(total).toBe(270);
  });

  it("the real runtime surface also sums to exactly 270", () => {
    const roots = Object.values(rootInstances).reduce(
      (n, inst) => n + ownMethods(inst).size,
      0,
    );
    const accounts = Object.values(accountInstances).reduce(
      (n, inst) => n + ownMethods(inst).size,
      0,
    );
    expect(roots + accounts).toBe(270);
  });
});

describe("removed methods are gone", () => {
  it("the 13 reverse-orphans (plus the split respond) do not exist at runtime", () => {
    const absent: Array<[object, string]> = [
      [client.accounts, "createConnectLink"],
      [client.accounts, "createReconnectLink"],
      [client.accounts, "reconnect"],
      [client.webhooks, "getStateDiff"],
      [acc.messaging, "syncChat"],
      [acc.messaging, "syncMessages"],
      [acc.posts, "list"],
      [acc.recruiter, "syncMessages"],
      [acc.recruiter, "addApplicant"],
      [acc.recruiter, "rejectApplicant"],
      [acc.recruiter, "solveJobCheckpoint"],
      [acc.salesNavigator, "syncMessages"],
      [acc.users, "getCompany"],
      [acc.invites, "respond"],
    ];
    for (const [instance, method] of absent) {
      expect(
        (instance as Record<string, unknown>)[method],
        `${method} must be undefined`,
      ).toBeUndefined();
    }
  });

  it("removed methods are also a compile-time type error", () => {
    // @ts-expect-error connect-link minting has no served operation
    void client.accounts.createConnectLink;
    // @ts-expect-error reconnect-link minting has no served operation
    void client.accounts.createReconnectLink;
    // @ts-expect-error reconnect has no served operation
    void client.accounts.reconnect;
    // @ts-expect-error webhook state diff has no served operation
    void client.webhooks.getStateDiff;
    // @ts-expect-error chat sync has no served operation
    void acc.messaging.syncChat;
    // @ts-expect-error message sync has no served operation
    void acc.messaging.syncMessages;
    // @ts-expect-error the orphaned post list has no served operation
    void acc.posts.list;
    // @ts-expect-error recruiter message sync has no served operation
    void acc.recruiter.syncMessages;
    // @ts-expect-error recruiter add-applicant has no served operation
    void acc.recruiter.addApplicant;
    // @ts-expect-error recruiter reject-applicant has no served operation
    void acc.recruiter.rejectApplicant;
    // @ts-expect-error recruiter job-checkpoint solving has no served operation
    void acc.recruiter.solveJobCheckpoint;
    // @ts-expect-error sales-navigator message sync has no served operation
    void acc.salesNavigator.syncMessages;
    // @ts-expect-error getCompany was dropped when profiles became users
    void acc.users.getCompany;
    // @ts-expect-error the combined respond split into accept and decline
    void acc.invites.respond;
    // @ts-expect-error the profiles namespace was renamed to users
    void acc.profiles;
    expect(true).toBe(true);
  });
});

describe("root value exports", () => {
  it("are exactly the client, the error model, the webhook surface and the offline Sequence module", async () => {
    const entry = await import("../src/index.js");
    expect(Object.keys(entry).sort()).toEqual(
      [
        "Curviate",
        "CurviateError",
        "ERROR_CODES",
        "WebhookSignatureError",
        "constructEvent",
        "isCurviateError",
        // offline, never on the client
        "renderWebhookTemplate",
        "validateWebhookTemplate",
        // offline, never on the client
        "SEQUENCE_SCHEMA_URL",
        "SEQUENCE_SCHEMA_V1",
        "Sequence",
        "newStepId",
        "step",
        "validateSequence",
      ].sort(),
    );
  });
});

describe("surface header (Curviate-Client)", () => {
  it("one request carries exactly one Curviate-Client: sdk/<version>; a `client` replaces it", async () => {
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    const seen: string[][] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      seen.push(Object.entries(init.headers as Record<string, string>).filter(([k]) => k.toLowerCase() === "curviate-client").map(([, v]) => v));
      return new Response(JSON.stringify({ object: "tier", tier: "starter" }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof globalThis.fetch;
    await new Curviate({ apiKey: "k", fetch }).tier.get();
    await new Curviate({ apiKey: "k", fetch, client: "acme-agent/2.0.0" }).withTeam("tnt_1").tier.get();
    expect(seen).toEqual([[`sdk/${version}`], ["acme-agent/2.0.0"]]);
  });
});
