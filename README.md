# @curviate/sdk

The official TypeScript SDK for the [Curviate API](https://docs.curviate.com). Agent-native
LinkedIn infrastructure for AI engineers and agent builders.

> **Status:** pre-1.0. Full v2 API parity; the surface is public but not yet stability-promised.

---

## Install

```bash
npm install @curviate/sdk
```

Requires Node 18+. Works in Cloudflare Workers and Vercel Edge.

---

## Auth: construct the client

Get your API key from the Curviate dashboard. Store it as an environment variable.

```ts
import { Curviate } from "@curviate/sdk";

const curviate = new Curviate({
  apiKey: process.env.CURVIATE_API_KEY!,
  // Optional:
  // baseUrl: "https://api.curviate.com", // default
  // timeout: 30_000,                     // per-attempt timeout, ms
  // maxRetries: 3,                        // GET/HEAD retries with backoff
  // client: "my-agent/1.2.0",             // Curviate-Client header; default sdk/<version>
});
```

An API key belongs to one person in one team and acts with that person's role there. `curviate.teams.getCurrent()` says which team and role. A key may work in one Team or in all of a person's Teams. A Team key acts only in its own Team: leave `team` unset with one; naming another team is refused with `TEAM_ACCESS_DENIED`. A key that works in all of your Teams, or a dashboard session token, picks one with `team: "tnt_..."` (sent as `X-Curviate-Team`), or per call with `curviate.withTeam("tnt_...")`, which overrides the option. Without one, an All-Teams key's Team-level operation is refused with `TEAM_REQUIRED` (a call on one of your accounts takes that account's Team), and a session token acts in your default Team.

---

## Connecting an account

Every LinkedIn operation (messages, member profiles, invites, posts) is tied to a **managed account**, a LinkedIn session connected to Curviate.

**Agents: use a connect request.** Your code never handles a LinkedIn password, cookie or verification code, so never ask for one. Create a request, give its `url` to the person, and they connect in their own Curviate dashboard:

```ts
const req = await curviate.connectRequests.create();             // new account
// const req = await curviate.connectRequests.create({ account_id: "acc_123" }); // reconnect
console.log(`Connect your LinkedIn account here: ${req.url}`);

// Poll until it leaves `pending`: completed, expired (15 minutes), failed or cancelled.
const done = await curviate.connectRequests.get(req.id);
if (done.status === "completed") console.log(done.account_id);
```

`create` is not retry-safe: a retry makes a second request. A pending request can be withdrawn with `connectRequests.cancel(id)`.

**Your own app, with the person's credentials in hand:** `curviate.auth.intent()`. A new connect names where LinkedIn sees the account connecting from, with exactly one of `country` (e.g. `"US"`), `ip` or your own `proxy`:

```ts
await curviate.auth.intent({ seat_id, auth_method: "credentials", credentials: { email, password }, country: "US" });
```

## Account-scoped accessor

The `curviate.account(id)` accessor fixes the `account_id` on every call so you do not have to thread it manually:

```ts
// Root-level: team-wide operations (accounts, auth, connectRequests, webhooks, drafts, teams, notifications)
const { items: accounts } = await curviate.accounts.list();

// Account-scoped: all LinkedIn ops under a specific account
const acc = curviate.account(accounts?.[0]?.account_id ?? "");

// Now every resource call is scoped to that account:
const { items: chats } = await acc.messaging.listChats();
const me = await acc.users.get("me");           // your own profile
const profile = await acc.users.get("some-user-id"); // someone else's
```

## Notifications

`curviate.notifications` is Curviate telling you something needs attention: an account needs reconnecting, a Motion paused, an import finished, a teammate joined or left. Each person has their own list and read state. Check it at session start:

```ts
const { unread_count } = await curviate.notifications.unreadCount();
if (unread_count > 0) {
  const { items } = await curviate.notifications.list({ filter: "unread" });
  for (const n of items) console.log(n.type, n.title);
  // Mark only what you saw: one that arrived since the list stays unread.
  await curviate.notifications.markAllRead({ before: items[0]!.created_at });
}
```

`type` is an open list: tolerate values you do not know. `curviate.account(id).notifications` is something else: that account's LinkedIn notifications.

## Teams

`curviate.teams` manages the team the credential acts in: `getCurrent`, `updateCurrent`, `listMembers`, `updateMember` (role), `removeMember` (`"me"` leaves), `createInvites`, `listInvites`, `resendInvite`, `revokeInvite`, plus `list` for every team you belong to. Member and invite writes are for Owners (`INSUFFICIENT_ROLE` otherwise). `curviate.accounts.setTeamAccess(accountId, false)` keeps an account you connected to yourself.

```ts
const team = await curviate.teams.create({ name: "Client A" }); // you become its Owner; no seat yet
// An All-Teams key: next_step.team_header is "X-Curviate-Team: <team_id>", usable at once (pass team_id as the `team` option).
// Any other credential: next_step.command and next_step.url (CLI setup, dashboard Teams page).
const { items } = await curviate.teams.list({ include: "counts" }); // tier, trial, accounts, active_motions, seats (Owner rows)
await curviate.teams.setLogo(await readFile("logo.png")); // a PNG up to 1 MB; Owners only; removeLogo() clears it

// Lend an unused seat to another of your Teams, and move it back (once no Account uses it).
const { seat_id } = await curviate.billing.seats.lend({ team_id: "tnt_456" });
await curviate.billing.seats.return(seat_id);
```

`teams.list({ include: "counts" })` adds counts on every row for a dashboard session and an All-Teams key, and only on its own row for a Team key. While a seat is lent, a connect naming it or a cancel of it throws `SEAT_LENT`. `curviate.billing.invoices.list()` pages the Team's invoices (Owners only) and `billing.invoices.pdf(number)` resolves with the PDF bytes. `TIER_REQUIRED` carries `err.details.account_id` when one Account (on a seat lent from another Team) lacks the feature while the Team has it.

## Tiers

A Team's Tier decides which features it has. Drafts, Contacts, Motions (and Network and Unibox) need Automate: a write in one of those groups on a Team below it is refused with `TIER_REQUIRED`, before the request is even validated. Reads, exports, deletes and stopping running work (`motions.pause`, `motions.archive`, `enrollments.stop`) pass on any Tier. The refusal names what is missing:

```ts
try {
  await curviate.motions.start("mot_123");
} catch (err) {
  if (isCurviateError(err) && err.code === "TIER_REQUIRED") {
    console.warn(`${err.feature} needs ${err.requiredTier}; this team has ${err.currentTier ?? "no Tier"}.`);
    // A team Owner also gets err.upgradeUrl; any other role has none and should ask an Owner.
  }
}

const { tier, features } = await curviate.tier.get(); // check first: no write is sent
```

`curviate.tier.get()` returns the Tier now (`null` for none), the bought Tier, the free trial or granted Tier that raises it, a downgrade due at the next renewal (`pending`), and the `features` it includes. It reports no prices. A Motion or a sync that stopped for the Tier reads `pause_reason` / `paused_reason: "tier_required"`.

## Contacts, lists and Tags

`curviate.contacts` keeps the people your team works with: a LinkedIn URL plus your own fields, Tags and Contact lists. Any spelling of one person's URL resolves to one Contact, so `upsert` is safe to repeat:

```ts
const { id, outcome } = await curviate.contacts.upsert({
  linkedin_url: "https://www.linkedin.com/in/ana/",
  job_title: "CTO",
  tags: ["warm"],
  list_name: "Q4 webinar", // created if new
});

// Bulk: rows or a CSV string, up to 10,000 rows. Over 500 runs in the background.
const csv = await readFile("leads.csv", "utf8"); // node:fs/promises
const imp = await curviate.contacts.imports.create({ csv, list_name: "Q4 webinar" });
// Once `status` is `completed` (poll `imports.get` for a background import):
const { items: skipped } = await curviate.contacts.imports.rows(imp.id, { outcome: "skipped" });

await curviate.contacts.updateMany({ contact_ids: [id], add_tags: ["vip"] });
const all = await curviate.contacts.export({ format: "json", tag: "vip" });

// One filter everywhere: several lists, an opt-in total, then act on exactly what it matches.
const filter = { list_id: ["cl_1", "cl_2"], list_match: "all" as const, not_list_id: ["cl_3"], has_email: true };
const { total } = await curviate.contacts.list({ ...filter, include_total: true, limit: 1 });
await curviate.contactLists.create({ name: "Both, with email", from: filter }); // a static list of what matches now
await curviate.contacts.updateMany({ filter, add_tags: ["vip"] }); // or deleteMany({ filter }); over 10,000 matches is refused
```

`list_id` and `not_list_id` take up to 20 Contact list ids (an array or a comma list). `curviate.doNotContact` is the Team-wide do-not-contact list (`list`, `get`, `add`, `update`, `remove`): no Motion contacts a person on it and a write toward them throws `DO_NOT_CONTACT`. `contacts.enrich` fills profile fields from what Curviate already stores, else queues paced live profile views from an account you name: a live view is a real profile view the person may see. `curviate.contactLists` and `curviate.tags` rename and delete; a Tag has no create call, the first write naming it creates it. Refusals: `NAME_TAKEN`, `RESOURCE_IN_USE` (a live Motion or a running import uses it), `CONTACT_LIMIT_REACHED`, `IMPORT_QUEUE_FULL`. Deletes are for Owners and Managers.

## Sequences

A Motion runs one Sequence: a JSON document of steps (`do`, `wait`, `until`, `if`, `tag`, and the legacy `emit`), run from the first step and ended explicitly with `"end"`. The SDK has an offline module for it: a typed builder that emits exactly that document, and `validateSequence`, which gives the verdict the API gives. Nothing in it touches the network, a key or the file system, so it runs in CI, browsers and edge functions. It needs TypeScript 5.0 or later.

```ts
import { Sequence, step } from "@curviate/sdk";

const seq = Sequence.create({ on_reply: "end" }).add(
  step.do("invite", "invite.send", { with: { note: null, withdraw_after: "21d" }, event: "invite_sent" }),
  step.until("accepted", "invite.accepted", { timeout: "21d", then: "opener", else: "end" }),
  step.do("opener", "message.send", {
    variants: [
      { id: "named", text: "Hi {{first_name}}, {{opener}}" },
      { id: "plain", text: "{{opener}}" },
    ],
    with: { fallback: "Hi, thanks for connecting." },
  }),
  step.until("r_opener", "message.replied", { timeout: "4d", then: "end" }),
  step.if("seen", { "message.seen": true }, { then: "bump", else: "end" }),
  step.do("bump", "message.send", { with: { text: "{{followup}}", fallback: "Quick follow-up in case this got buried." }, next: "end" }),
);

const document = seq.toDocument(); // the Sequence document, keys in canonical order
```

Field names are the document's keys (`on_reply`, `note_fallback`, `withdraw_after`). Variables: `{{first_name}}` (any standard Contact field), `{{my_first_name}}`, `{{my_last_name}}`, `{{my_full_name}}` (the sending account), and any other `{{<key>}}` is the custom field `contact.extra.<key>`; the long forms `{{contact.first_name}}`, `{{contact.extra.opener}}` and `{{account.first_name}}` stay valid. A messaging step takes one text in `with` or exactly 2 `variants` (A/B). An optional `event` on a `do` or `tag` step sends a custom event each time the step runs; `until event.<name>` waits for one your agent sends (`enrollments.events`). With literal arguments, the type checker refuses what the API would: a typo'd action, event, reaction or predicate, a `{{...}}` that is not a variable (`{{firstName}}`, `{{my_title}}`, a `| default:` filter), a text with a variable and no fallback, one variant, a duration like `"1w"`, the reserved id `"end"`, and a jump to a step you never added (at `toDocument()`). Text the type checker cannot see (a `string` variable) is checked when you call `validate()` or `toDocument()`.

Every builder operation (`add`, `insertBefore`, `replace`, `remove`, `onReply`) returns a new builder. `toDocument()` throws `SEQUENCE_INVALID` with every error in `err.errors`, the same list the API returns: `path`, `rule`, and the compiler-style `code` (`R1` to `R28`), `pointer` (a JSON Pointer into the document), `hint` (the fix), `docs_url`, `severity` and, for a did-you-mean, `candidates`. Warnings (`W1` to `W16`) never block, read them with `validate()`. `JSON.stringify(seq)` equals `JSON.stringify(seq.toDocument())`. `newStepId(document, kind)` names a new step as the dashboard editor does (`message`, `message_2`, `w_<step>` for a wait before a step).

Raw JSON stays first class. Validate a document you wrote by hand, or load one (a Motion's `sequence`) to edit it:

```ts
import { Sequence, step, validateSequence } from "@curviate/sdk";

const { errors, warnings } = validateSequence(JSON.parse(text));
for (const e of errors) console.error(`${e.path}: ${e.rule} (${e.code}: ${e.hint})`);

const edited = Sequence.fromDocument(motion.sequence) // throws SEQUENCE_INVALID when invalid
  .insertBefore("opener", step.wait("settle", "1d"))
  .toDocument();
```

Deprecated forms are accepted with warning `W13` until 2027-01-19, then refused: 3 to 5 variants (use 2), `until signal.<name>` (use `until event.<name>`) and `{{motion.<key>}}` (write the text in place or use a custom field; offline it also gives `W9`). Warnings that need the Motion's sending accounts or settings come from the API only. `SEQUENCE_SCHEMA_V1` is the published JSON Schema (`SEQUENCE_SCHEMA_URL`) for editors and tooling. R29 (an `until event.<name>` gate on a field the incoming event's sample does not carry) needs your Team's incoming events, so it comes from the API only. The validator is the API's own rule code, shipped with this SDK: a document using an action or event added to the API later is refused offline while the API accepts it; upgrade the SDK.

## Motions and Enrollments

A Motion runs one Sequence for the Contacts of its Contact lists, on its sending accounts, inside its schedule. `sequence` in `motions.create` and `motions.update` takes a builder or a document:

```ts
import { Sequence, step } from "@curviate/sdk";

const motion = await curviate.motions.create({
  name: "Q4 webinar follow-up",
  contact_list_ids: ["cl_123"],
  account_ids: ["acc_123"],
  schedule: { days: ["mon", "tue", "wed", "thu", "fri"] }, // read in each sending account's own time zone
  sequence: seq, // a builder: converted with toDocument(); an invalid one throws SEQUENCE_INVALID, nothing is sent
});

const { paths, samples, projection } = await curviate.motions.preview(motion.id); // a read: nothing is sent to LinkedIn
await curviate.motions.start(motion.id);

// Edit later: load the stored document into a builder. if_sequence_revision refuses the save
// with SEQUENCE_CONFLICT (the stored document in err.current) when someone saved since.
const current = await curviate.motions.get(motion.id);
await curviate.motions.update(motion.id, {
  sequence: Sequence.fromDocument(current.sequence).insertBefore("opener", step.wait("settle", "1d")),
  if_sequence_revision: current.sequence_revision,
});

// Enrollments: one Contact's run on one account.
const { items: failed } = await curviate.enrollments.list({ motion_id: motion.id, done_step: "opener", outcome: "failed" });
await curviate.enrollments.bulk({ action: "retry", ids: failed.map((e) => e.id) }); // one result per Enrollment
await curviate.enrollments.retry("enr_123"); // one: throws NOTHING_TO_RETRY unless its Step failed
await curviate.enrollments.events("enr_123", { name: "research_ready" }); // moves an `until event.research_ready`
```

A plain object goes as is and the API validates it; wrap hand-written JSON in `Sequence.fromDocument(json)` to have it checked offline first. `sequence: null` clears a draft's. Status operations: `start`, `pause`, `resume`, `archive` (irreversible), `delete` (drafts only); `addContacts` / `removeContacts` enroll or take out Contacts directly; `getSequenceVersion` reads a past version. `curviate.enrollments` lists one Contact's run per account (`list`, filtered by status, Step, Sequence version, or how a Step ended: `done_step` with `outcome`, `reason`, `variant_id`, `relationship_at_enrollment`; `get` with its Step history) and acts on it: `pause`, `resume()` (lift your pause), `retry(id)` (retry the failed Step; it acts only on a failure, else throws `NOTHING_TO_RETRY`, so a repeated call never sends a delivered message again), `resume({ at })` (an explicit jump to a Step, not guarded: it re-enters a Step that already sent; use `retry` for a failure), `events({ name })`, `reassign({ account_id })`, `stop`, and `bulk` for up to 1,000 at once by ids or filter. `signal` is the deprecated name of `events`, accepted until 2027-01-19. Refusals: `MOTION_NOT_STARTABLE` (every gap in `err.errors`), `MOTION_STATUS_CONFLICT`, `ENROLLMENT_NOT_ACTIVE`, `SEQUENCE_INVALID`, `SEQUENCE_CONFLICT`, `STEP_IN_FLIGHT` (retry in a minute), `NOTHING_TO_RETRY` (from `retry`, or per Enrollment in `bulk`), `ACCOUNT_ALREADY_ENGAGED`, `ALREADY_ENROLLED_ON_ACCOUNT`, `KNOWN_CHAT`.

## Network, Unibox and Analytics

Reads here come from what Curviate has stored: no LinkedIn call, no limit used. Lists with a cursor resolve to their first page when awaited and yield every item across pages under `for await`:

```ts
// Stored Connections of several accounts; read coverage before trusting an empty page.
const { items, coverage } = await curviate.network.connections.list({ account_id: ["acc_1", "acc_2"] });
for await (const c of curviate.network.connections.list({ q: "founder" })) console.log(c.public_profile_url);
const { items: sync } = await curviate.network.syncStatus();
await curviate.network.resync({ account_id: "acc_1" }); // once per account per 24 h
await curviate.network.resync(); // Resync all: network_resync_list, one item per account you can operate
for await (const p of curviate.network.connections.list({ group: "person" })) console.log(p.object); // connection_person: one per person

// One inbox over every account you can operate.
for await (const chat of curviate.unibox.list({ unread: true })) console.log(chat.chat_id);
const { items: theirs, total } = await curviate.unibox.list({ person: "con_1", motion_ids: ["none"], include_total: true }); // total: every match, not the page
const { unread_chats } = await curviate.unibox.unreadCount();
await curviate.unibox.accounts.update("acc_1", { sync_full_inbox: true }); // by the person who connected it
await curviate.unibox.refresh();
await curviate.unibox.tagContact("acc_1", "chat_1", { tags: ["warm"] });
await curviate.unibox.enroll("acc_1", "chat_1", { motion_id: "mot_1" });

// Motion results, activity in budget units, the events feed.
const overview = await curviate.analytics.motions.list({ from: "2026-10-01", to: "2026-10-31" });
const summary = await curviate.analytics.motions.list({ range: "30d", compare: "previous_period", origin: ["motion", "unibox"] });
const detail = await curviate.analytics.motions.get("mot_1");
const { types } = await curviate.analytics.activity(); // per BudgetRow; never add rows together
for await (const event of curviate.analytics.events.list({ kind: ["message.replied"] })) console.log(event.motion_name);
const { items: forOne } = await curviate.analytics.events.list({ contact_id: "con_1", origin: ["unibox", "api"] }); // 404 for an unknown, other-team or merged-away id

// Files: stream the Analytics tables now, or run a background export and download it within 24 hours.
const csv = await curviate.analytics.export({ table: ["daily"], range: "90d" }); // ArrayBuffer
const job = await curviate.exports.create({ entity: "analytics", format: "csv", tables: ["daily", "motions"], filters: { range: "12m" } });
const file = await curviate.exports.download(job.id); // EXPORT_NOT_READY until exports.get(job.id).status is "ready"

// One account at a glance, and its own daily numbers.
const { performance, flags } = await curviate.accounts.overview("acc_1", { range: "30d" });
const { items: metrics } = await curviate.accounts.metrics("acc_1", { from: "2026-08-01" });
```

Every rate is the outcome so far over what was sent in the window, not over old enough cohorts, so it keeps moving as replies arrive: read it with `maturing` (sent under 7 days ago) and `low_sample` (under 30). Messages and InMails are counted apart (`reply` and `inmail_reply`). Enrollment counts are by state right now (`queued`, `active`, `paused`, `finished`, `failed`, `skipped`); the window does not change them. One export runs per Team at a time (`EXPORT_IN_PROGRESS`, with `err.details.export_id`).

Unibox traps. A send through the API (`messaging.sendMessage`, `startChat`, `sendInMail`) marks the chat read, so `unread` turns `false` and `marked_unread` clears; a Motion send leaves it. `marked_unread` is `{origin: "unibox" | "api" | "linkedin", at}` when a chat was made unread without a new message from them. A disconnected account stays in `unibox.accounts.list()` and `unibox.list()` (`account_status: "disconnected"`), read-only: its messages come from the stored copy (`coverage.complete`, attachments `unavailable`), and a write on it throws `REAUTH_REQUIRED` (409). `unibox.refresh` runs once per account per 2 minutes (`cooldown` with `next_allowed_at` after that) and covers accounts with Motion chats or Motion outreach even without full-inbox sync; `not_synced` means none of those apply. A sent message carries `origin` (`motion`, `unibox`, `api`, `linkedin`; omitted when unknown, never on a received message or `last_message`) and `is_deleted`. Analytics `origin` is `motion`, `unibox` or `api`; `direct` is an alias for `unibox` and `api`.

Needs Automate: `network.resync`, `unibox.refresh`, `unibox.tagContact`, `unibox.enroll` and turning full-inbox sync on (off passes on any Tier). Messages and actions on a chat stay on `curviate.account(id).messaging`.

## Drafts and scheduled posts

A Draft is a stored, editable, unpublished post. Give it an account and a `scheduled_at` and Curviate publishes it at that time. Drafts are tenant-wide, so `drafts` hangs off the root client (a Draft's `account_id` is a field, and optional). `acc.posts.create()` still publishes immediately and does not schedule.

```ts
const draft = await curviate.drafts.create({
  account_id: "acc_...",
  text: "Three things we learned shipping our first agent integration.",
  scheduled_at: "2026-10-12T09:00:00+02:00", // ISO 8601 with offset; 5 min to 365 days ahead
});

// A video or PDF (up to 50 MiB) goes up as the raw body; images (up to 5 MiB) can ride inline as base64.
await curviate.drafts.uploadAttachment(draft.id, await readFile("clip.mp4"), {
  filename: "clip.mp4",
  contentType: "video/mp4",
});

await curviate.drafts.update(draft.id, { scheduled_at: null }); // unschedule
const { id: postId } = await curviate.drafts.publish(draft.id); // or publish now
const { items } = await curviate.drafts.list({ status: ["scheduled", "published"] });
```

Refusals carry their own codes: `DRAFT_LIMIT_REACHED`, `MEDIA_QUOTA_EXCEEDED`, `ACCOUNT_REQUIRED`, `DRAFT_NOT_PUBLISHABLE`, `SCHEDULE_CONFLICT` and `DRAFT_PUBLISHING`. A scheduled publish that fails raises the `post.publish_failed` webhook (`post.published` on success); a `failure_code` of `outcome_unknown` means the post may be live, so check the account's posts before retrying.

---

## First end-to-end call

This snippet lists your connected accounts, picks the first one, and sends a message, something an agent might do to automate outreach:

```ts
import { Curviate, isCurviateError } from "@curviate/sdk";

const curviate = new Curviate({ apiKey: process.env.CURVIATE_API_KEY! });

async function sendFirstMessage() {
  // 1. List connected accounts
  const { items: accounts } = await curviate.accounts.list();
  if (!accounts || accounts.length === 0) throw new Error("No active accounts.");

  const first = accounts[0]!;
  const acc = curviate.account(first.account_id ?? "");

  // 2. List recent chats
  const { items: chats } = await acc.messaging.listChats({ limit: 5 });
  if (!chats || chats.length === 0) return;

  // 3. Send a message to the first chat
  const chat = chats[0]!;
  await acc.messaging.sendMessage(chat.id ?? "", {
    text: "Hi, following up from our conversation.",
  });

  console.log("Message sent.");
}

sendFirstMessage().catch(console.error);
```

---

## Typed error handling

Every API error is a `CurviateError`. Use `isCurviateError` to narrow in `catch`, then switch on `err.code` for exhaustive handling:

```ts
import { isCurviateError } from "@curviate/sdk";

try {
  await acc.messaging.sendMessage("c_123", { text: "hello" });
} catch (err) {
  if (!isCurviateError(err)) throw err; // re-throw network errors etc.

  switch (err.code) {
    case "RECIPIENT_UNREACHABLE":
      console.warn("Recipient can't receive messages.");
      break;
    case "RATE_LIMIT_ACCOUNT":
      // err.retryAfterMs tells you exactly how long to wait
      await sleep(err.retryAfterMs ?? 5_000);
      break;
    case "BUDGET_EXHAUSTED":
      // Curviate's OWN account-safety ceiling, not a request-rate limit:
      // nothing reached LinkedIn and nothing was spent, so backing off is the
      // wrong move. Wait until err.resetAt, or raise the setting the hint
      // names on PATCH /v1/{account_id}/safety-policy. The ceiling comes from the
      // account's safety policy or the Team default (GET/PATCH /v1/safety-policy).
      // Limits are always enforced. err.safetyReason "activity_window": a live
      // write outside the account's active hours (the hint names active_hours).
      // resetAt is null in the three cases no clock frees: the pending_invites
      // backlog, an InMail credit pool LinkedIn regrants on its own schedule,
      // and an account whose time zone is not known yet.
      console.warn(`${err.budgetRow} is spent until ${err.resetAt ?? "no fixed time"}`);
      console.warn(`change ${err.safetyHint?.parameter} to lift it`);
      break;
    case "TIER_REQUIRED":
      // The team's Tier lacks err.feature; err.requiredTier has it. A team
      // Owner also gets err.upgradeUrl. See "Tiers" above.
      console.warn(`${err.feature} needs ${err.requiredTier}`);
      break;
    case "ACCOUNT_NOT_FOUND":
      console.error("Account does not exist for this tenant.");
      break;
    case "NOT_STORED":
      // A cache_only read the store could not answer, so nothing was fetched.
      // The id may be perfectly good, so do not go looking for it again:
      // re-read with mode "refill" or "auto", and on a narrowed listing drop
      // the narrowing parameters. See "Retrieval modes" below.
      console.warn("Nothing stored for that resource under this mode.");
      break;
    default:
      if (err.retryLikelyToSucceed) {
        // Safe to retry: server-side transient error
        await retry();
      }
  }
}
```

No response within the client's `timeout` throws `CLIENT_TIMEOUT` (not `INTERNAL`): a read is retried first and carries `retryLikelyToSucceed: true`; a write is not retried, carries `false`, and may still have reached the API, so read back before resending. A network failure with no response is `INTERNAL` with no `httpStatus`.

Every error code is documented in the [API reference](https://docs.curviate.com). The
exported `ErrorCode` type is the complete set, so `tsc` tells you when a `switch` over
`err.code` has missed one.

---

## Three refusals, three codes

A `403` from this API is one of three completely separate refusals. They read alike
in prose and they are fixed in three different places, so branch on `err.code` and
never on the message.

| Code | What is missing | Who fixes it, and where |
|---|---|---|
| `NO_ACTIVE_SEAT` | Your Curviate workspace has no active paid seat covering the account. | You, in Curviate billing. Buy or attach a seat, then retry. |
| `LINKEDIN_FEATURE_NOT_SUBSCRIBED` | The LinkedIn account itself lacks the LinkedIn subscription the operation needs, such as Sales Navigator or Recruiter. | The account owner, on LinkedIn. No amount of Curviate billing lifts this one. |
| `BETA_NOT_ENABLED` | The operation is beta-gated and your workspace has not opted into beta operations. | A human, in Settings ("Allow beta operations"), or per request with the `X-Curviate-Beta` header. |

**There is no product tier.** One ordinary paid seat entitles the whole API surface,
Sales Navigator and Recruiter included. Nothing on a seat names a product, no refusal
asks you to upgrade a plan, and there is no field on the error saying which tier to
buy, because there are no tiers to buy. What a premium namespace still needs is the
LinkedIn account's own subscription, which is the second row above.

```ts
try {
  await acc.salesNavigator.searchPeople({ keywords: "cto" });
} catch (err) {
  if (!isCurviateError(err)) throw err;
  switch (err.code) {
    case "NO_ACTIVE_SEAT":
      // Curviate-side. Attach a seat in Billing.
      break;
    case "LINKEDIN_FEATURE_NOT_SUBSCRIBED":
      // LinkedIn-side. The account needs its own Sales Navigator subscription.
      break;
    case "BETA_NOT_ENABLED":
      // Consent-side. A human enables beta in Settings for this workspace.
      break;
  }
}
```

**Request validation runs before every entitlement check, so `INVALID_REQUEST` tells
you nothing about entitlement.** A malformed body is rejected with `400
INVALID_REQUEST` while the seat, the LinkedIn subscription and beta consent are all
still unexamined. A caller that reads a `400` as "my request was fine, my entitlement
is not" has it backwards: fix the request, send it again, and only then does a `403`
mean anything about what you are entitled to. The reverse holds too, and is the more
useful half: a `403` from one of the three codes above proves the request itself
parsed and validated cleanly.

---

## Beta operations

Some operations are marked beta, because they have not been exercised against a real
LinkedIn subscription yet and their response shapes may still move. Every beta method
in this SDK carries an `@beta` tag in its JSDoc, so your editor tells you before you
call it; whole namespaces that are beta say so on the namespace as well.

The Sales Navigator, Recruiter and `inboxes` surfaces are beta in full today. Beta is
per operation, not per namespace, so a mostly-stable namespace can carry a beta method:
`companies.chats()` and `companies.searchChats()` are beta while the rest of
`companies` is not. Read the tag on the method you are calling rather than inferring it
from its neighbours.

The badge is a superset of the gate: an operation can be badged beta and still be
callable by anyone. A beta-GATED operation is the narrower set that actually refuses
`BETA_NOT_ENABLED` until a human enables beta operations for the workspace in
Settings, or the individual request carries `X-Curviate-Beta: true`. Because the two
move independently, read the code on a refusal rather than inferring the gate from
the badge.

---

## Retrieval modes

Some reads can be answered from Curviate's own store instead of a live LinkedIn
fetch. Those reads take the same two query parameters, `mode` and `max_age`:

- `users.get()`, including `users.get("me")` (`GET /v1/{account_id}/users/{user_id}`)
- `messaging.getChat()` (`GET /v1/{account_id}/chats/{chat_id}`)
- `messaging.listMessages()` (`GET /v1/{account_id}/chats/{chat_id}/messages`)

No other read accepts them, so do not pass them elsewhere. These two keys are
refused rather than ignored: sending either to a read that does not declare it
is a `400`, and so is sending either one twice. A read that accepted
`mode=cache_only` and then called LinkedIn anyway would break the one guarantee
that parameter makes, so neither case is resolved quietly.

| `mode` | What the read does |
| --- | --- |
| `auto` (default) | serves a stored copy while it is inside the resource's freshness threshold, otherwise fetches |
| `live` | always fetches |
| `refill` | serves a stored copy at any age, and fetches once when this read has none |
| `cache_only` | never fetches, and throws `NOT_STORED` when the store cannot answer |

`max_age` is the mechanism the first three are presets over: the oldest stored
copy, in seconds, the read will accept. It overrides them in both directions,
and `max_age: 0` is the same as `mode: "live"`. It cannot be combined with
`cache_only`, whose guarantee is not a freshness threshold; that pair is
rejected with `INVALID_REQUEST` rather than one of the two being quietly
dropped.

```ts
// Serve whatever is stored, at any age; reach LinkedIn only if nothing is.
const chat = await acc.messaging.getChat("chat_1", { mode: "refill" });

// Never reach LinkedIn. Throws NOT_STORED when the store holds nothing.
const profile = await acc.users.get("me", { mode: "cache_only" });

// Accept a stored copy up to five minutes old, fetch otherwise.
const page = await acc.messaging.listMessages("chat_1", { max_age: 300 });
```

Every one of these responses carries fields that say what you are holding:

- `source` is `"store"` or `"live"`, and `observed_at` is when the data was seen
  on LinkedIn. A stored answer can carry less than a live one, because some
  fields are dropped before anything is written, so `source: "store"` is how you
  know to ask again with `mode: "live"` when a field you need is missing.
- `withdrawn` is always present, never inferred from a missing field. `true`
  means LinkedIn has said the resource is gone, such as a removed profile, and
  the answer you are holding is the copy Curviate still has: do not act on it.
  `withdrawn_at` rides along when it is `true`. This is the field to branch on
  before messaging or acting on anything served from the store, and `refill`,
  which serves a copy at any age, is the mode most likely to hand you one.

`NOT_STORED` under `cache_only` does not always mean the resource is unknown.
On `listMessages` it also fires when the request narrows the page in a way the
stored copy cannot reproduce, so a fully stored chat can refuse a narrowed
`cache_only` read. Re-read without the narrowing parameters, or with a mode that
may fetch.

---

## Cursor pagination

`network.connections.list`, `unibox.list` and `analytics.events.list` iterate themselves (`for await (const x of curviate.unibox.list())`). For the other lists, `curviate.paginate()` is an async iterator that follows the `cursor` field automatically, so you pull items one at a time without managing cursors:

```ts
// Iterate over every chat across all pages
for await (const chat of curviate.paginate(acc.messaging.listChats.bind(acc.messaging), {})) {
  console.log(chat.id);
}

// With initial params
for await (const account of curviate.paginate(
  curviate.accounts.list.bind(curviate.accounts),
  { limit: 50 },
)) {
  console.log(account.account_id);
}
```

---

## Webhook verification

Register a webhook to receive real-time events, then verify each delivery with `constructEvent`:

```ts
import { constructEvent, WebhookSignatureError } from "@curviate/sdk";

// Express (Node 18+)
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["curviate-signature"] as string;
  const secret = process.env.CURVIATE_WEBHOOK_SECRET!;

  let event;
  try {
    event = await constructEvent(req.body, sig, secret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      // 'invalid_signature' | 'replay_detected' | 'malformed_header' | 'malformed_payload'
      console.warn("Bad webhook:", err.reason);
      return res.sendStatus(400);
    }
    throw err;
  }

  switch (event.event) {
    case "message.received":
      // event.data is MessagePayload: account_id, message_id, and so on.
      handleNewMessage(event.data);
      break;
    case "account.connected":
      handleAccountConnected(event.data);
      break;
    // Every other event type is a case in the CurviateEvent union.
  }

  res.sendStatus(200);
});

// Hono / Vercel Edge. Always await; Web Crypto is async.
app.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const event = await constructEvent(rawBody, c.req.header("curviate-signature")!, secret);
  return c.text("ok");
});
```

`constructEvent` always returns a `Promise<CurviateEvent>`. Always `await` it.

Each event also carries its delivery metadata: `event.id`, `event.webhook_id`, and
`event.delivered_at`.

### De-duplicating retries

Delivery is at-least-once, so your handler can see the same event more than once. Key on
`event.id`: it is the delivery id (`wdl_`), the same on every attempt and every redelivery
(before this release it changed per attempt). `event.delivered_at` is when the body was
rendered, also the same on every attempt.

```ts
if (await alreadyProcessed(event.id)) return res.sendStatus(200);
```

`curviate.webhooks.deliveries.get(event.webhook_id, event.id)` reads that delivery's status and
attempts; `deliveries.list(id, { failed: true })` lists what did not get through, and
`webhooks.redeliver(id, deliveryId)` sends one again, byte for byte, within 24 hours.

### Rotating the secret

`webhooks.rotateSecret(id)` returns a new secret once. For 24 hours every delivery is signed
with both (`Curviate-Signature: t=...,v1=<new>,v1=<old>`) and `constructEvent` accepts the
delivery when any `v1` matches the secret you pass, so the old and the new secret both verify
while you deploy. Older SDK versions check only the last `v1`: upgrade before you rotate.

### Body templates

A webhook's `body_template` replaces the standard payload with your own JSON (`{{variables}}`
inside its strings; `webhooks.variables({ source })` lists them). Check it offline with the
API's own lint, and preview it:

```ts
import { renderWebhookTemplate, validateWebhookTemplate } from "@curviate/sdk";

const { errors } = validateWebhookTemplate(template, { source: "motion" });
for (const e of errors) console.error(`${e.line}:${e.col} ${e.code} ${e.rule}`);
const body = renderWebhookTemplate(template, { event: "enrollment.finished", contact: { email: "alex@example.com" } });
```

A webhook's `request_url` reads back masked (`https://host/•••`); sending that value back on
`update` keeps the stored URL. A `headers` entry with a key and no value keeps that header's
stored value.

`WebhookSignatureError` is NOT a `CurviateError`. Narrow with `instanceof WebhookSignatureError`.
Its `reason` tells you where to look: `malformed_header` means the signature header could not be
read, `invalid_signature` means the HMAC did not match (check the secret, and check that you passed
the raw request bytes), `replay_detected` means the event is outside the replay window, and
`malformed_payload` means the signature was **valid** but the body was not a Curviate event, so
your secret and header are both fine.

> **Upgrading from 0.18.x or earlier?** The event discriminant is `event.event`, not `event.type`.
> See the 0.19.0 entry in [CHANGELOG.md](./CHANGELOG.md); the change is a one-word edit and it
> breaks no working code, because `constructEvent` never returned successfully before 0.19.0.

---

## Links

- API reference: https://docs.curviate.com
- Issues: https://github.com/curviate/curviate-sdk/issues
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT © Redmer Holding GmbH
