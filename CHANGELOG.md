# Changelog

All notable changes to `@curviate/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: semantic. Minor for additive changes, patch for bug fixes; no stability promise before 1.0.

---

## [Unreleased]

## [0.20.0] - 2026-08-07

Generated types are rebuilt from the **served** OpenAPI document rather than a
hand-refreshed snapshot, and the snapshot itself now records where it came from.
Source of this release: `https://api.staging.curviate.com` at server commit
`1015999221a2dafc505cc565369a40b8ceca1888`, recorded in
`fixtures/PROVENANCE.json`.

### Changed

- **BREAKING (type-level): `headers[].value` is gone from every webhook response,
  replaced by `headers[].value_prefix`.** It affects `webhooks.create` (201),
  `webhooks.get`, `webhooks.update`, and `webhooks.list`. The API stopped
  returning the plaintext header value some time ago and returns a masked prefix
  instead; the vendored snapshot had not caught up, so the SDK typed a field the
  server no longer sends. `tsc` will point at every `h.value` read:

  ```diff
  - const configured = webhook.headers?.[0]?.value;
  + const configured = webhook.headers?.[0]?.value_prefix; // masked, never the full value
  ```

  This is the only breaking change in the release. Read the label honestly: the
  old type was already wrong at runtime, so any code relying on it was reading
  `undefined`; the break is `tsc` finally saying so.

- `POST /v1/auth/checkpoint/poll` reports three further `status` values
  (`reconnect_needed`, `restricted`, `disconnected`) on top of the five it
  already had. Purely additive, but an exhaustive `switch` over `status` with a
  `never` fallthrough will need the new arms.

- `GET /v1/{account_id}/search/jobs`, `POST /v1/{account_id}/search`, and the
  company jobs listing now mark `id` required on a job item alongside
  `job_urn` (same value, shorter name, chains into `get_job`).

- **Punctuation swept out of the published copy.** The README, this changelog,
  and every JSDoc comment that ships inside `dist/index.d.ts` used typographic
  characters with no plain-ASCII equivalent on the keyboard: em and en dashes,
  the single-glyph ellipsis, arrows. They are gone, replaced with commas,
  semicolons, colons, `...` and `->`. No release note changed what it claims;
  the word stream is byte-identical apart from one inserted "and". Version
  headers now use the ` - ` separator that Keep a Changelog specifies.

### Added

- **`account.restricted` is now a member of the `CurviateEvent` union.** The
  server publishes it and delivers it by default on the `account_status` source,
  but the SDK union did not carry it, so an exhaustive `switch (event.event)`
  could not compile a handler for the one event that means "stop sending on this
  account". The union is pinned at compile time to the generated create-events
  enum, so this addition was produced by the regeneration rather than typed by
  hand.

- **`EventPayloadBase`**, exported: the `account_id`, `event`, and `occurred_at`
  every webhook payload carries. `occurred_at` was previously reachable only
  through the payload index signature, typed `unknown`, which meant the
  de-duplication key documented below could not be built without a cast.

- Response fields surfaced by the regeneration: `notices[]` on every search and
  company-employees listing, `visibility` on people / services / company-employee
  results, `id` on job results, `recovered` on a checkpoint poll,
  `trial_premium` on an auth intent, `next_action` / `notices` / `unresolved` on
  the shared `Error` schema, a `409` on checkpoint poll and a `403` on the user
  read.

- `pnpm gen:fixture` (`scripts/refresh-fixture.mjs`): fetches the live document,
  refuses to write it if it carries a forbidden name, canonicalizes the
  environment-dependent `servers` order so a refresh from staging and one from
  production produce identical bytes, and writes `fixtures/PROVENANCE.json`. The
  snapshot previously had no writer at all, which is why nobody could tell how
  old it was.

- **`pnpm check:copy`**, a pre-publish copy-quality gate, chained into
  `prepack` alongside the existing internal-reference scan. It fails the pack
  on any non-ASCII typographic character in the published copy and reports
  (without failing) emoji and wording from the generic-marketing register. See
  the header of `scripts/check-copy.mjs` for why only the first tier blocks.
  `test/check-copy.test.ts` exercises each pattern on its own, because a
  pattern set that silently stops matching still reports zero.

### Fixed

- **The documented webhook de-duplication key did not work.** The README said
  the delivered `event.id` was something you "can de-duplicate retries on". Every
  delivery attempt mints a fresh `wdl_` id, so a retry arrives with a different
  one and a consumer following that advice stored the same logical event twice,
  double-processing exactly the retries the guidance claimed to cover. The stable
  key is the payload composite `event.event` plus `event.data.account_id` plus
  `event.data.occurred_at`, which the platform re-sends identically on every
  attempt. The README, the `CurviateEventEnvelope.id` JSDoc, and the 0.19.0
  entry below all carried the wrong claim; all three are corrected, and the
  0.19.0 entry was edited in place rather than left standing as advice someone
  would still follow.

- Doc comments no longer hardcode the size of a set that grows. "27 events" on
  `webhooks.listEvents`, "24 canonical events" on the `CurviateEvent` union,
  "22 more event types" and "34 error codes" in the README were each hand-typed
  and each stale. The served catalogue description counts itself and the union is
  pinned to the generated enum, so the numbers were redundant as well as wrong.

- `test/docs-contract.test.ts`: the two claim families above now go red in the
  suite. Prose was the one representation of the contract that nothing checked,
  which is why both defects shipped.

- The banner on `src/generated/types.ts` carried an em dash. The file ships (it
  is in `files[]` and is inlined into `dist/index.d.ts`), so the banner is
  published copy and the dash was the same tell the sweep removed everywhere
  else. It is fixed where it is emitted rather than in the output, and the
  string now has one home: `gen-types.mjs` wrote it and `check-types.mjs`
  reconstructed it to diff against, so the two hand-written copies could
  disagree and red the drift gate over a file nobody had touched. Both now
  import `GENERATED_HEADER` from `scripts/openapi-sanitize.mjs`.

## [0.19.0] - 2026-08-03

### Fixed

- **`constructEvent` now parses real webhook deliveries. It previously rejected
  every single one.** The Curviate platform sends the event name in `event`;
  the SDK required a `type` field that no delivery has ever contained, so
  verification threw `WebhookSignatureError` on 100% of genuine webhooks. The
  HMAC path was never at fault (a tampered body was correctly rejected as
  `invalid_signature`); the parse step was. If webhook verification has never
  worked for you, this is why, and this release fixes it.

- **A body problem no longer reports a header problem.** A payload whose
  signature verifies but whose body cannot be parsed used to fail with
  `reason: "malformed_header"`, pointing at the two things that had just been
  proven correct: the header and the signing secret. Integrators read that and
  rotated a secret that was never wrong. Those cases now report the new
  `reason: "malformed_payload"`, and the message no longer mentions the header,
  the signature, or the secret.

### Changed

- **BREAKING (type-level), and it breaks no working code.** The `CurviateEvent`
  discriminant is now `event`, not `type`:

  ```diff
  - if (event.type === "message.received") { ... }
  + if (event.event === "message.received") { ... }
  ```

  Read the label carefully before deferring the upgrade: **there is no working
  consumer of `event.type` to break.** `constructEvent` has never once returned
  successfully for a real delivery, so no `event.type` branch has ever executed
  in production. Any handler you have written behind it is unreachable code
  today. `event.type` is now a compile error precisely so `tsc` points you at
  every site that needs the one-word edit; nothing changes at runtime for code
  that was previously working, because there was none.

  `WebhookSignatureError["reason"]` gains the `"malformed_payload"` member. An
  exhaustive `switch` over `reason` will need the new arm.

### Added

- **`CurviateEventEnvelope`**: the per-delivery metadata now carried on every
  event. `event.id` is the `wdl_...` delivery id, `event.webhook_id` is the
  registration, `event.delivered_at` is the attempt timestamp. These are typed
  optional and are **not** required by the parser:
  requiring an envelope field is what caused this defect, so nothing beyond the
  discriminant can fail a verification again.

- Forward compatibility: a payload carrying `type` instead of `event` is
  accepted and normalized onto `event`, so a future platform-side change to the
  envelope cannot break verification a second time. `type` is never required.

- `test/webhooks.dispatcherEnvelope.test.ts` and
  `test/fixtures/webhook-delivery.capture.json`: the regression test replays
  bytes and a signature header **captured off the wire from the real dispatch
  worker**, rather than constructing its own payload. The pre-existing suite was
  green throughout this defect because it built its own `{ type: ... }` fixtures;
  a suite that constructs its own input cannot detect an emitter/parser
  divergence, and that is what let this ship.

## [0.18.1] - 2026-07-18

### Changed

- **`companies.sendMessage(identifier, chatId, body)`** now takes the normal `2-...`
  chat id that `companies.chats()` / `chat()` / `searchChats()` return; the endpoint
  resolves the page mailbox internally from `identifier`. The previous send-ready
  `COMPANY_` chat-id requirement is gone: pass the id straight from the company chat
  reads. Method signature and response shape are unchanged (documentation/behavior
  only).

## [0.18.0] - 2026-07-17

### Added

- **`companies.sendMessage(identifier, chatId, body)`**: reply to a company-inbox
  conversation as the page. `POST /v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages`.
  `chatId` must be the send-ready `COMPANY_` chat id from `inboxes.listChats()`, not the
  `2-...` id `companies.chats()`/`chat()`/`searchChats()` return; a non-`COMPANY_` id is
  rejected with a guiding 400. Reply-only. The response echoes `sent_as`, the acting
  identity actually used.

## [0.17.0] - 2026-07-17

### Added

- **`companies.followInvite(identifier, body)`**: invite the connected
  account's 1st-degree connections to follow a company page it administers with the
  invite-to-follow entitlement. Pass the `AC...` member ids from an `invitableFollowers()`
  read. `POST /v1/{account_id}/companies/{identifier}/follow-invite`. All-or-nothing:
  for an all-valid request, resolves to one outcome per requested invitee, in request
  order (`status: "invited" | "already_invited" | "ineligible" | "not_found"`); if any
  invitee id is invalid, the whole request rejects with a 404, not a partial result.
  Re-inviting an already-invited member is a safe no-op (the same `invitation_id`,
  never a duplicate).

## [0.16.0] - 2026-07-17

Mostly additive, plus one breaking removal on the connect/reconnect body.

### Breaking

- **`disabled_features` is removed from `auth.intent()`'s request body**
  (`AuthIntentBody`). The negative-list model could not express the `company`
  product or the one-Premium-per-profile XOR. Connection scope (which
  LinkedIn products get synced) is now **seat-derived**: there is no products
  input on connect/reconnect at all. Drop any `disabled_features` you were
  passing: a body still carrying it is now rejected 400 by the server. The
  scope actually recorded for an account reads back as the new
  `requested_products` field (see Added, below). A reconnect that changes
  scope must use `auth_method: "credentials"`, since a cookie replay cannot
  change scope and now throws `CurviateError(code: "REAUTH_REQUIRED")`.

### Added

- **New account-scoped `inboxes` namespace (2 methods, Beta), the reply-as-a-page
  surface.** `inboxes.list(query?)` discovers the account's personal inbox
  plus, when the company product is attached, one entry per company page (id
  like `"COMPANY_83734124_PRIMARY"`). `inboxes.listChats(inboxId, query?)`
  lists a single inbox's conversations, cursor-paginated. Every returned chat
  `id` is send-ready: pass it straight to the existing `messaging.sendMessage()`
  to reply, no separate start/send endpoint. Company pages are reply-only
  (`reply_only: true`) and cannot start a new conversation. **Beta:**
  single-page listing is verified; deep pagination against a busier inbox is
  still being validated.
- **`sendMessage()` echoes the acting identity as `sent_as`,** additive on
  the existing send-message response. A `COMPANY_` chat id (from
  `inboxes.listChats()`) sends AS THE PAGE and echoes
  `sent_as: { kind: "company", company_id, name }` (`company_id` is `null`
  when the page could not be correlated to a managed page). Any other chat id
  sends as the connected member and echoes `sent_as: { kind: "personal" }`.
  Never infer the acting identity from a message's `sender` field, only from
  `sent_as`.
- **`accounts.list()` / `accounts.get()` gain `requested_products`,** the
  seat-derived connection scope (e.g. `["classic", "company",
  "sales_navigator"]`) the account was last connected with. `null` for
  accounts connected before this was recorded, and not attachment truth for
  Company Pages (that is decidable only via `inboxes.list()`).
- **Two new error codes:** `PREMIUM_CONFLICT` (a seat resolving to both
  individual-Premium tiers at once, since LinkedIn permits only one per
  profile; `user_fixable`, never retryable) and `REAUTH_REQUIRED` (a
  scope-changing reconnect attempted with a cookie instead of credentials;
  `user_fixable`, never retryable).
- **New account-scoped `profile` namespace (4 methods)**, the connected
  account's own insight surface: `profile.subscription()`, `profile.analytics()`,
  `profile.visitors(query?)`, `profile.ssi()`. Distinct from the retired
  `profiles` namespace (renamed to `users` in 0.15.0).
- **New account-scoped `groups` namespace (3 methods)**, `groups.list(query?)`
  (own groups by default, or another member's via `{ profile }`),
  `groups.get(group)`, and `groups.members(group, query?)` (with the folded-in
  `{ name }` member search).
- **New account-scoped `feed` namespace (1 method)**, `feed.home(query?)` reads
  the connected account's home feed as agent-actionable posts, with `relevant`
  or `recent` sort orders.
- **`companies` gains 3 company-insights methods**, `companies.managed(query?)`
  lists the pages the connected account administers; `companies.followers(identifier,
  query?)` lists a page's followers (**re-added** under a different item shape
  than the pre-0.15.0 method of the same name: `company_follower`, carrying
  `degree`/`followed_at`); `companies.invitableFollowers(identifier, query?)`
  lists connections invitable to follow the page. All three require the
  connected account to administer the target page.
- **`companies` gains 5 Beta company-inbox methods**, `companies.chats(identifier,
  query?)`, `companies.chat(identifier, chatId)`, `companies.messages(identifier,
  chatId, query?)`, `companies.message(identifier, chatId, messageId)`, and
  `companies.searchChats(identifier, query?)` (exactly one of `query`/`topic`/
  `unread` per call). A distinct conversation surface from the account's own
  `messaging` namespace, scoped to one administered company page. **Beta:**
  single-page listing and termination are verified; deep pagination (many
  pages / large cursor round-trips) is still being validated against a busier
  inbox. `companies` is now 12 methods (was 4).
- **`search` gains 3 methods**, `search.groups(query)` searches LinkedIn
  groups by keyword; `search.services(body & query)` searches Services
  Marketplace providers with structured filters; `search.getServiceParameters(query)`
  resolves human-readable service-category/location terms into the opaque
  filter ids `services()` accepts. `search` is now 9 methods (was 6).
- **`messaging` gains 1 method**, `messaging.searchChats(params)` free-text
  searches the account's own inbox (participant names and message content).
  `messaging` is now 13 methods (was 12).
- **`posts` gains 3 saved-posts methods**, `posts.listSaved(query?)` lists the
  connected account's own saved posts (a self resource: previews only,
  `snippet` capped at <=140 chars, never the full body); `posts.save(postId)`
  and `posts.unsave(postId)` add/remove a bookmark, both idempotent and
  accepting either `urn:li:activity:<id>` or a bare numeric id. `posts` is now
  12 methods (was 9).
- **New account-scoped `notifications` namespace (3 methods)**, the connected
  account's own notification centre: `notifications.list(query?)` (cards +
  the account-level `unread_count`/`latest_published_at`);
  `notifications.delete(cardUrn)` and `notifications.showLess(cardUrn)`, two
  self-action writes on the account's own cards. Both writes are idempotent
  and take effect within a few seconds; a list read immediately after may
  still show the card for a moment, which is not a failure signal. The SDK
  percent-encodes `cardUrn` (which embeds `(`, `)`, `:`, `,`) into the path.
- **Parity pin: 143 methods across 18 namespaces** (was 135 / 16 at the start
  of this release cycle). The `inboxes` namespace is the final addition.

## [0.15.0] - 2026-07-11

Full v2 parity. The SDK is re-aligned 1:1 to the served API surface: every
operation is now exactly one method at the exact wire encoding, the entire
account-scoped surface moves to the account-first path grammar, and three
namespaces are reorganized. This is a **breaking** release touching nearly
every namespace. The five breaking categories below (removals, namespace
reorganization, method renames/relocations, request/response shape changes, and
the account-first path-grammar migration) are the complete set of breaks a
`0.14.1` -> `0.15.0` upgrade must reconcile, gathered here so a consumer finds
every break in one place.

### Removed (BREAKING)

- **14 methods that map to no served operation are removed, with no alias:**
  - `accounts.createConnectLink()`, `accounts.createReconnectLink()`, `accounts.reconnect()`: hosted connect/reconnect link minting and in-place reconnect are no longer part of the API surface.
  - `messaging.syncChat()`, `messaging.syncMessages()`, `recruiter.syncMessages()`, `salesNavigator.syncMessages()`: explicit sync operations are gone; accounts sync continuously and deliver via webhooks.
  - `posts.list()`: the standalone feed list has no served operation (use `posts.listUserPosts(userId)` for a member's posts).
  - `companies.followers()`: no served operation.
  - `recruiter.addApplicant()`, `recruiter.rejectApplicant()`, `recruiter.solveJobCheckpoint()`: superseded by the project-centric pipeline surface.
  - `webhooks.getStateDiff()`: no served operation.
- **`invites.respond()` is removed**, split into two dedicated bodyless methods, `invites.accept(invitationId)` and `invites.decline(invitationId)` (see below).
- **`profiles.getCompany()` stays removed**, dropped ahead of this release with no return; company reads live on the `companies` namespace.

### Changed (BREAKING): namespaces reorganized

- **`profiles` namespace renamed to `users`.** Every `curviate.account(id).profiles.*` call becomes `...users.*`; the served group is "Users" and every path is `/users/{user_id}`.
- **New root-scoped `auth` namespace, split out of `accounts`.** The connect/checkpoint operations move off `accounts`: `accounts.link` -> `auth.intent`, `accounts.solveCheckpoint` -> `auth.solveCheckpoint`, plus `auth.requestCheckpoint`, `auth.pollCheckpoint`, and `accounts.getConnectSession` -> `auth.getSession(sessionId)`. `accounts` now carries only `list` / `get` / `update` / `disconnect`.
- **New account-scoped `comments` namespace.** The comment-thread surface (create / edit / delete / reply / list replies / reactions) plus the relocated `listUserComments` live here rather than on `posts`.
- **Root and account surfaces are now strictly disjoint.** The root client exposes only `accounts`, `auth`, `webhooks`. Every other namespace is reachable exclusively through `curviate.account(id)`; the account-scoped namespaces are no longer mounted on the root client (they cannot build a valid path without a bound `account_id`).

### Changed (BREAKING): methods renamed / relocated

- `profiles.endorse(userId, { skill_endorsement_id })` -> **`users.endorseSkill(userId, { endorsement_id })`**, renamed, and the body key changed from `skill_endorsement_id` to `endorsement_id`.
- `profiles.listConnections()` -> **`users.listRelations()`**.
- `messaging.getInMailBalance()` -> **`users.getInMailCredits()`** (relocated onto `users`).
- `posts.comment(postId, ...)` -> **`comments.create(postId, ...)`**.
- `profiles.listComments(userId)` -> **`comments.listUserComments(userId)`**.
- `profiles.listPosts(userId)` -> **`posts.listUserPosts(userId)`**.
- `profiles.listReactions(userId)` -> **`posts.listUserReactions(userId)`**.
- `invites.respond(...)` -> **`invites.accept(invitationId)` / `invites.decline(invitationId)`** (split; both bodyless).
- `recruiter.addCandidate(...)` -> **`recruiter.saveCandidate(projectId, { stage_id, candidate_id })`**.
- `recruiter.getParameters(...)` (GET) -> **`recruiter.searchParameters(body)` (POST)**, the HTTP verb changed GET->POST, with a `source`-discriminated body.
- `recruiter.listProjectJobs(projectId)` -> **`recruiter.getProjectJob(projectId)`**, the operation returns the single attached job posting, not a list.

### Changed (BREAKING): request / response shapes

- **`users.update(userId, body)`** never sends `description`; accepted keys are `{ first_name, last_name, headline, bio, skills, picture, background_picture }`.
- **`users.endorseSkill`** body key is `endorsement_id` (was `skill_endorsement_id`).
- **`jobs.publish` / `recruiter.publishJob`** take a `mode`-discriminated body (`FREE` | `PROMOTED` | `PROMOTED_PLUS`; the `PROMOTED*` modes require a `budget { currency, amount, scope }`) and respond `{ object, job_state }`.
- **`jobs.close` / `recruiter.closeJob`** are bodyless POSTs responding `{ object }`.
- **`invites.cancel`** withdrawal now discriminates on `invitation_withdrawn`.
- **Message operations are re-homed under the chat.** `getMessage` / `editMessage` / `deleteMessage` / `addReaction` / `getAttachment` now path under `/chats/{chat_id}/messages/...` and take `chatId` as the leading argument.
- **`messaging.sendInMail`** body drops the `surface` field.
- **Media-bearing writes moved from multipart to JSON + base64** where the surface retired multipart (recruiter, sales-navigator, posts, messaging); read each operation's declared content-type; some remain multipart.
- **Sales Navigator `saveAccount` / `saveLead` bodies shrank** to the minimal saved-entity shape.
- **`recruiter.startChat`** now requires a `signature` (alongside `attendees_ids`, `text`, `subject`).
- **`recruiter.createJob`** now requires `project_name` and responds `{ job_id, object, project_id }` (was a full job object).
- **`recruiter.saveCandidate`** body is `{ stage_id, candidate_id }`.

### Changed (BREAKING): account-first path grammar

- **Every account-scoped method now carries `account_id` as the leading path segment** (`/v1/{account_id}/...`), never as a query parameter, body field, or omitted. Bind it once with `curviate.account(id)` and it is injected on every call. Companies and relations, which previously carried `account_id` as a query argument, drop it entirely.

### Added

- **`comments` namespace (9 methods):** `listUserComments`, `create`, `edit`, `delete`, `reply`, `listReplies`, `listReactions`, `addReaction`, `removeReaction`; `removeReaction` is a DELETE that carries a `{ reaction }` body.
- **`jobs` write surface (9 new methods):** `list`, `create`, `update`, `getBudget`, `publish`, `close`, `listApplicants`, `getApplicant`, `downloadResume` (binary `ArrayBuffer`). `jobs.create` takes object-shaped `job_title` / `company` and a `method`-discriminated `apply_method`.
- **Project-centric `recruiter` surface (9 new methods):** `searchTalentPool`, `searchFromUrl`, `updateProject`, `listPipeline`, `getProjectJob`, `createProjectJob`, `getProjectJobBudget`, `updateProjectJob`, `closeJob`, with `getApplicant` / `downloadResume` re-homed under the project scope.
- **`users.follow` / `users.unfollow`** (bodyless POST / DELETE), **`users.listFollowing`**, **`users.update`**.
- **`messaging.markChatRead(chatId, { read })`**.
- **`search.fromUrl({ url })`** and **`salesNavigator.searchFromUrl({ url })`**: resolve a LinkedIn search-results URL into a search.
- **`posts.delete`** (bodyless, 204) and **`posts.unreact(postId, { reaction })`** (DELETE with body).
- **`users.get(userId)` accepts `'me'`**: `users.get('me')` reads the caller's own profile (folds in the old `getMe`).
- **New `ErrorCode` value: `LINKEDIN_OPERATION_NOT_SUPPORTED`.** The `422` a permanent LinkedIn platform limitation for the attempted operation returns (e.g. listing a non-self user's following list): `user_fixable: true`, `retry_likely_to_succeed: false` (not a transient failure; retrying will not help). Added to the `ErrorCode` union and the transport's known-code set; previously this narrowed to `INTERNAL`, which is retryable.

### Fixed

- **`CONNECTION_REQUEST_CONFLICT` was silently downgraded to `INTERNAL`.** The `409` the API returns when a connect-request to a member already exists (or you are already a first-degree connection) is a real, documented error code, but the transport's runtime known-code set omitted it, so callers received `code: "INTERNAL"` with the wrong semantics (`INTERNAL` is retryable, whereas this conflict is `user_fixable: true`, `retry_likely_to_succeed: false` and must never be re-sent). The transport now decodes `CONNECTION_REQUEST_CONFLICT` to itself. To eliminate the class of bug: the `ErrorCode` type and the transport's runtime known-code set are now both **derived from one source array**, so the code a caller narrows on and the code the transport recognizes can never drift apart again.
- **`RATE_LIMITED` was silently downgraded to `INTERNAL`.** The `429` the Recruiter and Sales Navigator read surface returns under LinkedIn-platform throttling (dedicated `RateLimit-Policy` / `RateLimit` / `Retry-After` response headers, `retry_likely_to_succeed: true`) is a real, documented error code, but the transport's runtime known-code set omitted it, so callers received `code: "INTERNAL"`, which happened to auto-retry on `GET`/`HEAD` by accident but with the wrong (generic backoff) delay instead of honoring `Retry-After`. The transport now decodes `RATE_LIMITED` to itself and retries it on `GET`/`HEAD` like the other rate-limit codes, honoring `Retry-After`.
- **`users.update` forwarded an unsupported `description` key if a caller smuggled one in.** The `UserUpdateBody` type never declared `description`, so a typed caller was already rejected at compile time, but an untyped/JS caller (or an `as`-cast) could still put it on the object, and `update()` forwarded the body verbatim with no runtime check. `update()` now strips `description` from the outgoing payload before the request is sent, regardless of caller strictness.

---

## [0.14.1] - 2026-07-07

### Fixed

- **`constructEvent` examples referenced a wrong header name (`X-Curviate-Signature` -> `Curviate-Signature`); corrected a stale default-count description.** The JSDoc and both code examples (Express/Node, Hono) for `constructEvent` named the header `X-Curviate-Signature`; the dispatcher actually sends `Curviate-Signature` (Node lowercases it to `curviate-signature` on `req.headers`), so integrators copying the examples verbatim got `undefined` for the signature header. Also corrected the generated `events` field description on the webhook-create schema from a stale "default: all 7" to "default: all 11 lifecycle events", matching the account_status catalogue.

---

## [0.14.0] - 2026-07-07

Webhooks surface re-based onto the v2 catalogue. Additive minor: one new method,
one type-only breaking note for `CurviateEvent` (see below).

### Added

- **`webhooks.get(id)`.** Return a single webhook owned by the calling tenant (`GET /v1/webhooks/{id}`). The plaintext secret is never present on a read, only `secret_prefix`. Type `WebhookGetResult`. The `webhooks` namespace is now 7 methods (was 6).
- **Webhook event catalogue expanded 21 -> 27** (`webhooks.listEvents()`), grouped messaging (8) / user (2) / account_status (14), plus 3 tier-gated. New subscribable-but-not-default events: `chat.updated`, `chat.deleted` (messaging), `connection.new` (user), `account.initial_sync.running` / `account.initial_sync.completed` / `account.initial_sync.failed` (account_status). Catalogue entries may now carry an `availability: "realtime" | "no_longer_realtime" | "not_realtime"` field.

### Changed (type-only breaking note)

- **`CurviateEvent` union re-keyed 19 -> 24 deliverable events** to match the create-subscribable catalogue. Renamed/removed: `account.stopped`, `account.sync_started`, `account.sync_complete`, `account.creation_success`, `account.sync_success`, `account.reconnect_required`, `account.checkpoint` are gone; the account-lifecycle names now split across `account.synced`, `account.reconnected`, `account.reconnect_needed`, `account.paused`, `account.connecting`, `account.permission_revoked`. Net-new members: `chat.updated`, `chat.deleted`, `connection.new`, `account.initial_sync.running`, `account.initial_sync.completed`, `account.initial_sync.failed`. A `switch`/exhaustiveness check on `event.type` for any of the 7 removed names will now fail to compile; update the case list. Runtime HMAC verification (`constructEvent`) is unaffected; this is a types-only change.

---

## [0.13.0] - 2026-07-05

Accounts/Auth surface migration. This is a **breaking** minor (pre-1.0): the account
connection and checkpoint surface was reshaped end-to-end. All changes are on the
`accounts` namespace; no other namespace is affected.

### Removed (BREAKING)

- **`accounts.refresh(accountId)` removed**: the underlying endpoint (`POST /v1/accounts/{account_id}/refresh`) no longer exists and has no alias. Accounts now restart and re-sync automatically; status freshness is served by the real-time account-status webhook, the nightly reconcile, and `accounts.get()`'s stale-while-revalidate background refresh. Remove any `accounts.refresh()` call sites. Type `AccountRefreshResult` is removed.
- **`accounts.submitCheckpoint(body)` removed**, renamed to `accounts.solveCheckpoint(accountId, { code })` (see below). No alias.
- **`accounts.resendCheckpoint(body)` removed**, renamed to `accounts.requestCheckpoint(accountId)` (see below). No alias.

### Changed (BREAKING)

- **Checkpoint operations are now account-in-path.** The three checkpoint methods take the account id as a **path argument** instead of an `account_id` body field:
  - `submitCheckpoint({ account_id, code })` -> **`solveCheckpoint(account_id, { code })`** (`POST /v1/accounts/{account_id}/checkpoint/solve`). Returns the connected account (201) or a chained checkpoint (202).
  - `resendCheckpoint({ account_id })` -> **`requestCheckpoint(account_id)`** (`POST /v1/accounts/{account_id}/checkpoint/request`). Returns `{ object, account_id, resent }`; `resent` is still honest (`false` when there is nothing to re-send).
  - `pollCheckpoint({ account_id })` -> **`pollCheckpoint(account_id)`** (`POST /v1/accounts/{account_id}/checkpoint/poll`), same name, now a single string arg (no body).
  - Migration: `submitCheckpoint({ account_id, code })` -> `solveCheckpoint(account_id, { code })`; `resendCheckpoint({ account_id })` -> `requestCheckpoint(account_id)`; `pollCheckpoint({ account_id })` -> `pollCheckpoint(account_id)`.
  - Types: `AccountSubmitCheckpointBody`/`AccountSubmitCheckpointResult` -> `AccountSolveCheckpointBody`/`AccountSolveCheckpointResult`; `AccountResendCheckpointBody`/`AccountResendCheckpointResult` -> `AccountRequestCheckpointResult` (no body type); `AccountPollCheckpointBody` removed (no body).
- **`accounts.createConnectLink()` is create-only.** The `purpose` and `account_id` body fields are removed; it now only mints a link to connect a **new** account (`{ seat_id, expires_in_seconds?, redirect_url? }`). To re-authorize an existing account via a hosted link, use the new `accounts.createReconnectLink()` (below). Type `AccountConnectLinkBody` no longer carries `purpose`/`account_id`.
- **`accounts.update()` body reshaped.** The managed `country` / `ip` knobs are removed from `PATCH /v1/accounts/{account_id}`; the body is now `{ metadata?, proxy? }`. `metadata` is a flat string map that **replaces** the account's custom-data store wholesale; `proxy` sets a custom egress proxy (the managed location is now chosen at connect time, not here). Passing `country`/`ip` is rejected with `INVALID_REQUEST`. Type `AccountUpdateBody` changed. *(Known limitation: the generated body type does not yet express `proxy: null` to clear a custom proxy; the server accepts it, but a strict TypeScript caller must cast until the schema surfaces the nullability. The CLI's `account update --clear-proxy` sends it directly.)*
- **Cookie auth requires `user_agent`.** `accounts.link()` and `accounts.reconnect()` now require a `user_agent` when `auth_method: "cookie"`; without one the request is rejected with `INVALID_REQUEST`. It stays optional for `auth_method: "credentials"`. (Enforced server-side; the flat request-body type cannot make it conditionally required, so pass it whenever you connect by cookie.)
- **`accounts.reconnect()` result is now a `200 | 202` union.** A reconnect can itself surface a checkpoint challenge; resolve it with `solveCheckpoint` / `pollCheckpoint`, exactly like `accounts.link()`. Discriminate on `result.object`. Type `AccountReconnectResult` is now a union.

### Added

- **`accounts.createReconnectLink(accountId, body?)`.** Mint a one-time hosted **re-authorization** link for an existing disconnected account (`POST /v1/accounts/{account_id}/reconnect-link`), the hosted counterpart of `accounts.reconnect()`. Body is optional (`{ expires_in_seconds?, redirect_url? }`). Returns `{ object: "hosted_auth_url", url, session_id, expires_at, account_id }`; poll completion with `accounts.getConnectSession(session_id)`. Types: `AccountReconnectLinkBody`, `AccountReconnectLinkResult`. The `accounts` namespace stays at 12 methods (`refresh` out, `createReconnectLink` in).
- **New `ErrorCode` value: `ACCOUNT_ALREADY_LINKED`.** The `409` a duplicate connect now returns from `accounts.link()`, `accounts.reconnect()`, and `accounts.solveCheckpoint()`; the substrate refused linking a LinkedIn identity that's already linked. `user_fixable: true`, `retry_likely_to_succeed: false` (reconnect or disconnect the existing account instead of retrying). When the caller's own tenant already owns the existing account, the error body's `account_id` names it; otherwise it stands alone. Added to the `ErrorCode` union and the transport's known-code set; previously this narrowed to `INTERNAL`, which is retryable, so a client would have retried a request that can never succeed.
- **Wider checkpoint challenge vocabulary.** The 202 `challenge_type` enum now covers `otp | two_factor_sms | two_factor_app | two_factor_whatsapp | mobile_app_approval | otp_or_mobile_app_approval | contract_selection`, and a `contract_selection` challenge additionally carries `contracts: [{ id, name }]` (choose one and pass its id to `solveCheckpoint`).
- **422 dead-end challenge error documents a `challenge_type`, but it isn't typed yet.** When a checkpoint challenge can't be resolved automatically (e.g. a CAPTCHA or a phone-number registration), the `422` response carries a machine-readable `challenge_type: "captcha" | "phone_register"` in prose (`fixtures/openapi.json`), but the response schema is still the generic `Error` type, so a caller can't type-branch on it programmatically yet.
- **Connect-recovery + honest terminal signals on the connection responses (additive, non-breaking).**
  - `accounts.link()` and `accounts.solveCheckpoint()` 201 responses now carry an optional `recovered` boolean, `true` only when the connect reclaimed a LinkedIn identity already present on the workspace (claiming it into your account) rather than connecting a brand-new one; absent on a normal connect.
  - The `status` on those same 201 responses is widened from `"active"` to `"active" | "reconnect_needed" | "restricted" | "disconnected"`; it now reflects the account's real observed state, which a recovered identity often reports as needing a reconnect.
  - `accounts.pollCheckpoint()` now carries `challenge_type` (`"mobile_app_approval"`) and a human-readable `recovery_hint` on a `status: "expired"` mobile-approval timeout, so a client can render the right recovery guidance without parsing prose.

### Changed

- Regenerated types from the current API surface. `accounts.get()` / `accounts.list()` still return the six cached enrichment fields, but `username`, `premium_id`, `public_identifier`, `signatures`, and `groups` are no longer refreshed by background enrichment; they read `null`/`[]` for newly connected accounts (any previously cached value is retained). `full_name` and `substrate_created_at` continue to populate; `substrate_created_at` remains ISO-8601 UTC.

## [0.12.0] - 2026-07-05

### Added

- **New `companies` namespace (5 methods).** `companies.get(identifier)` retrieves a company's full LinkedIn profile, and accepts either a public handle (the slug in `linkedin.com/company/<handle>`, e.g. `"t-systems"`) or a numeric id. `companies.employees(identifier, params?)`, `companies.posts(identifier, params?)`, and `companies.jobs(identifier, params?)` list company sub-resources (filterable with `keywords`/`location` where supported); `companies.followers(identifier, params?)` lists company followers (requires the acting account to administer the target page). The four sub-resource methods require the company's **numeric provider_id** (the same `id` field `companies.get()` returns); a handle or URN is rejected server-side before any upstream call. Types: `CompanyProfile`, `CompanyEmployeeListPage`, `CompanyPostListPage`, `CompanyJobListPage`, `CompanyFollowerListPage`.
- **New `ErrorCode` value: `RESOURCE_ACCESS_RESTRICTED`.** The non-admin mapping for `companies.followers()`, surfaced when the acting account does not administer the target company page. Added to the `ErrorCode` union and the transport's known-code set (previously unknown codes silently narrowed to `INTERNAL`).
- **`salesNavigator` gains 5 new v2 list-surface methods (7->12).** `salesNavigator.accountLists(query?)` and `salesNavigator.leadLists(query?)` list the operator's saved-account/saved-lead lists (`account_id` required, `limit`/`cursor` paginate). `salesNavigator.browseAccountList(listId, body?, query?)` and `salesNavigator.browseLeadList(listId, body?, query?)` return the saved items in one list, with optional enum filters (`filter`/`sort_by`/`sort_order` for accounts; `spotlight`/`sort_by`/`sort_order` for leads) in the body. `salesNavigator.saveAccount({ list_id, company_id, account_id })` saves a company into an account list; a `2xx` response **is** the success signal; no `saved` boolean is invented. All five are additive. Types: `SNAccountListsQuery/Result`, `SNLeadListsQuery/Result`, `SNBrowseAccountListQuery/Body/Result`, `SNBrowseLeadListQuery/Body/Result`, `SNSaveAccountBody/Input/Result`.

### Removed (BREAKING)

- **`profiles.getCompany(companyId)` removed**, hard-moved to `companies.get(identifier)`. The underlying endpoint (`GET /v1/profiles/companies/{company_id}`) no longer exists; there is no alias. Update call sites to `companies.get()`.

### Changed (BREAKING)

- **`salesNavigator.saveLead` re-signed for the v2 save-lead surface.** The v1 `saveLead(userId, { account_id, list_id? })` (`POST /v1/sales-navigator/leads/{user_id}`) is **retired, no alias**; the endpoint itself no longer exists server-side. The replacement `saveLead({ list_id, user_id, account_id })` calls `POST /v1/sales-navigator/lead-lists/{list_id}/save`; `list_id` is now **mandatory** (the v1 `list_id`-optional semantics do not exist in v2) and addresses the path instead of the member id. Update call sites: `saveLead(userId, { account_id, list_id })` -> `saveLead({ list_id, user_id, account_id })`. Types: `SNSaveLeadBody`/`SNSaveLeadResult` now alias the v2 endpoint; new `SNSaveLeadInput`.

## [0.11.0] - 2026-07-04

### Added

- **`accounts.getConnectSession(session_id)`.** Poll a hosted connect session minted by `accounts.createConnectLink()`. A pure status read; it makes no external call and does not itself complete the connection (the connection is signalled complete out-of-band once the end user finishes the hosted flow). Returns `{ object: "connect_session", session_id, status, account_id, expires_at }`, where `status` is `"pending" | "resolved" | "expired" | "failed"` and `account_id` is populated only once `status` is `"resolved"`. Poll until it leaves `pending`. Type: `AccountConnectSessionResult`. Extends the Accounts surface to 12 methods.
- **`accounts.resendCheckpoint({ account_id })`.** Re-sends the pending verification challenge notification for an account (e.g. when the end user says they never received the OTP/2FA code or the mobile-app push). Returns `{ object: "checkpoint", account_id, resent }`; `resent` echoes the outcome honestly (`false` when there was nothing to re-send for that challenge type; this never throws just because a resend wasn't applicable). Does not reset the checkpoint's expiry.
- **`session_id` on the `accounts.createConnectLink()` 201 response**, the durable poll handle to pass to `accounts.getConnectSession()`. Type: `AccountConnectLinkResult`.
- **`seat_id` on the account-connection responses.** `accounts.link()` (201), `accounts.submitCheckpoint()` (201), and `accounts.pollCheckpoint()` now carry `seat_id` (`string | null`), the seat the account occupies. `accounts.createConnectLink()` (201) also carries it. This is the canonical replacement for the deprecated `attached_seat_id` (same value).
- **`auth_method: "hosted"`** is now a possible value on `accounts.list()` items (accounts connected through a hosted link). Response-only; the `link()` / `reconnect()` request `auth_method` remains `"credentials" | "cookie"`.
- **`"disconnected"` account status.** Now a possible `status` on `accounts.list()` items, `accounts.get()`, and both sides of the account `state-diff` event, whose `previous_status` / `current_status` are now typed enums (`"active" | "reconnect_needed" | "restricted" | "connecting" | "disconnected"`) rather than free-form strings.

### Deprecated

- **`attached_seat_id`** (on `accounts.link()`, `accounts.submitCheckpoint()`, and `accounts.pollCheckpoint()` responses); use `seat_id` instead (identical value). Retained for backward compatibility; slated for removal at the GA `/v1` cutover.

### Changed

- Regenerated types from the current API surface (full refresh). Beyond the additions above, `accounts.update()` (`PATCH /v1/accounts/{account_id}`) gains a `501` response variant, returned when a managed-proxy configuration isn't supported for the account's current plan (not retryable as-is; change the request rather than resubmitting). No resource method signatures changed.

## [0.10.0] - 2026-07-03

### Added

- **New `jobs` namespace.** `jobs.get(jobIdOrUrl)` retrieves one public LinkedIn job posting's full detail: title, company, location, description, applicant count, and more. Accepts either a bare numeric job id (e.g. `"4428113858"`) or a full job URL (`"https://www.linkedin.com/jobs/view/4428113858"`); the SDK extracts the numeric id client-side, so both forms issue the identical request. Passing a value with no extractable numeric id throws `CurviateError({ code: "INVALID_REQUEST" })` synchronously, before any network call. Type: `JobPosting`.
- `recruiter.getJob(jobIdOrUrl)`: the Recruiter-lens sibling, retrieving any public job posting (not only the operator's own postings). Accepts the same bare-id-or-URL forms as `jobs.get()` and returns the identical `JobPosting` type (no separate response shape to learn). Extends the Recruiter surface to 18 methods.

## [0.9.0] - 2026-07-03

### Added

- **Account enrichment fields.** `accounts.list()` items and `accounts.get()` now carry six cached account-detail fields, populated by an async background enrichment on every successful account activation: `username`, `premium_id`, `public_identifier`, `substrate_created_at` (ISO-8601 UTC), `signatures` (`{title, content}[]`), and `groups` (`string[]`). All six are `null`/`[]` until the account's first enrichment pass completes, never `undefined`, never a missing key. Types: `AccountListPage`, `AccountDetail`.
- `accounts.get()` gains `seat_id` (`string | null`), the seat the account occupies, `null` for an admin seatless account. Previously only `accounts.list()` items carried this field.

### Changed

- `connected_at` (on both `accounts.list()` items and `accounts.get()`) and `last_checked_at` (`accounts.get()`) now consistently emit ISO-8601 UTC (`...Z`) timestamps; a prior docs-vs-runtime drift meant these could reach callers in raw Postgres wire format. No type change (already typed as `string`/`string | null`); this is a runtime-correctness fix reflected in the regenerated example values.
- Regenerated types from the current API surface. No resource method signatures changed; purely additive response fields.
- `quotas[]` (on `accounts.get()`) is now documented as advisory usage-safety recommendations: daily families never cause a rejected request; only `account.per_minute` is a binding limit enforced with HTTP 429. `recommended_throttle_hint` semantics documented per level (`none` / `slow_down` / `backoff` are advisory; `stop` is reserved for the binding per-minute limit). JSDoc-only, no type shape change.

---

## [0.8.0] - 2026-07-02

### Added

- **Recruiter job-lifecycle endpoints are now fully implemented server-side.** The following operations no longer return `501` and are safe to call in production: getting/rejecting an applicant, downloading an applicant's resume, listing a job's applicants, solving a job's publish checkpoint, publishing a job, and fetching a Recruiter profile. Their generated response types no longer include a `501` variant; if your code branched on it, that branch is now dead and can be removed.
- Richer parameter documentation across the Recruiter and search surfaces: job/applicant/hiring-project IDs now describe where to obtain them (e.g. `job_id` from `GET /v1/recruiter/jobs`, `user_id` from a people-search result), and several previously-terse descriptions were corrected (e.g. the saved-search `industry` filter's cross-reference).
- Server-side parameter defaults are now surfaced in the generated JSDoc (`@default`) wherever the API applies one when a param is omitted: link-expiry seconds, chat visibility, hiring-project list `limit`, webhook delivery `format`/`enabled`/`headers`/`data`, and more.
- **Breaking (typed consumers):** the Sales Navigator company-search `annual_revenue.min`/`max` filter is now a bucketed numeric enum (`0 | 0.2 | 1 | 2.5 | 5 | 10 | 20 | 50 | 100 | 500 | 1000 | 1001`) instead of a free-form `number`, matching what the API actually accepts. Code passing arbitrary numbers no longer typechecks; pick the nearest bucket value. Runtime behavior is unchanged (the API already only accepted these buckets).

### Changed

- **Search filter guard-rails are now documented.** `search.companies` `limit` requires a minimum of 2 (was 1); the API rejects single-result company searches. `search.jobs` `benefits` and `commitments` filters now document their accepted values. `search.people` `open_to` now documents its accepted values (`proBono`, `boardMember`). The `search.posts` request examples were corrected to use the actual `member`/`company` array filter shape instead of a `member_urn` string.
- Regenerated types from the current API surface. No resource method signatures changed.

---

## [0.7.0] - 2026-07-01

### Changed

- **Breaking (typed consumers):** `recruiter.startChat` 201 response: the `attendee_ids` field is removed and replaced by `message_id` (the opening message identifier). Final shape: `{ object: "chat_started", chat_id, message_id }`, matching `messaging.startChat` and `salesNavigator.startChat`. `chat_id` is now non-nullable on a 201. Type: `RecruiterStartChatResult`. Migration: read `res.message_id`.
  - *Why:* product-API + core / Sales Navigator parity: the underlying LinkedIn start-chat operation returns an identical `{ object, chat_id, message_id }` for every product; the prior `attendee_ids` echo had no product-API basis.
- The `recruiter.startChat` request body is unchanged (`attendees_ids` plus all recruiter-specific params).
- Regenerated types from the updated API surface.

---

## [0.6.0] - 2026-07-01

### Added

- **Recruiter start-chat response gains `object: "chat_started"` discriminator.** The 201 response from `recruiter.startChat` now includes `object: "chat_started"` as a required field. Type: `RecruiterStartChatResult`.

### Changed

- **Breaking (typed consumers):** `salesNavigator.syncMessages` and `recruiter.syncMessages`: the 200 response field `sync_status` is renamed to `status`. Enum values (`sync_started | running | done | error`) are unchanged. Types: `SNSyncMessagesResult`, `RecruiterSyncMessagesResult`.
- **Breaking (typed consumers):** `recruiter.startChat` request body field `attendee_ids` -> `attendees_ids`. The **response** `attendee_ids` field is unchanged. Type: `RecruiterStartChatBody`.
- Recruiter start-chat 201 response no longer surfaces a separate `quota` field; remaining InMail capacity is read from `GET /v1/accounts/{account_id}`.
- Regenerated types from the updated API surface (SN/Recruiter messaging parity).

---

## [0.5.0] - 2026-07-01

### Added

- Posts search gains nested `posted_by`, `mentioning`, and `author` filter objects. `posted_by` and `mentioning` take `member` / `company` arrays of opaque IDs (from `GET /v1/search/parameters`); `posted_by` also accepts `me`, `first_connections`, and `people_you_follow` booleans; `author` filters by `industry`, `company`, or `keywords`.
- Search-parameters items (`GET /v1/search/parameters`) now carry nullable company-disambiguation fields: `industry`, `location`, `headcount` (human-readable size range), and `followers_count`, populated only for `type=COMPANY` results.

### Changed

- **Breaking (typed consumers):** people-search `connections_of` and `followers_of` are now arrays of opaque member IDs (`string[]`) instead of a single `string`. Pass one or more IDs resolved from `GET /v1/search/parameters`.
- **Breaking (typed consumers):** posts-search replaces the flat `member_urn` / `company_urn` filters with the nested `posted_by` / `mentioning` / `author` objects described above.
- **Breaking (typed consumers):** jobs-search `location_within_area` is now a `number` (search radius in miles) instead of a `string`.
- Company-size (`headcount`) bucket bounds are documented with their explicit valid values.
- De-branded the four search method summaries in the SDK JSDoc (`Search people/companies/posts/jobs`).
- Regenerated types from the current API surface.

---

## [0.4.2] - 2026-07-01

### Added

- Invitation item `specifics` now includes `provider: "LINKEDIN"` on both `InvitationSent` and `InvitationReceived`, the platform the invitation belongs to, passed through alongside `shared_secret`.

### Changed

- Removed the `422` response from `invites.cancel` (`DELETE /v1/invites/{invitation_id}`) and `invites.respond` (`POST /v1/invites/received/{invitation_id}`): cancel is idempotent (`canceled`/`not_found` only) and a non-pending handle returns `not_found`, so neither surfaces an account-restricted `422`.
- Regenerated types from the current API surface, consolidating the invitation-item changes on top of the 0.4.1 people-search and 0.4.0 profile/messaging types.

---

## [0.4.1] - 2026-06-30

### Added

- `people_search_result` item now includes `id: string`, the raw LinkedIn provider id for the person (e.g. `ACoAA...` format). This is the first property on the item type.

---

## [0.4.0] - 2026-06-30

### Added

- `primary_locale` (`{ country, language } | null`) on the `Profile` and `OwnProfile` types, a profile's primary locale as set by LinkedIn (`language` is a BCP 47 tag, `country` an ISO 3166-1 alpha-2 code). Present on `GET /v1/profiles/{id}`; on `/me` it is populated when `linkedin_sections` is supplied.

### Changed

- The account re-sync response (`GET /v1/messages/sync`) field is now `status` (was `sync_status`), aligning with the chat-history sync response. Sales Navigator and Recruiter re-sync responses are unchanged (`sync_status`).
- Regenerated types from the current API: refreshed endpoint and error descriptions to neutral wording. No request shapes changed.

---

## [0.3.0] - 2026-06-29

### Added

- `sendInMail` now accepts `surface: "classic"` for sending InMail from an account's own premium InMail credits (in addition to `"sales_nav"` and `"recruiter"`). The `recipient_urn` field accepts either a member URN (`urn:li:member:<id>`) or a member provider id (`ACo...`).

### Changed

- Regenerated types from the current API: refreshed several endpoint descriptions (message delete, post id forms, reaction list) to match the live reference. No request/response shapes changed beyond the `surface` addition above.

---

## [0.2.1] - 2026-06-29

### Fixed

- `deleteMessage` and `addReaction` no longer inject `account_id` into the request. The server resolves the owning account from the message id; sending a client-supplied `account_id` was rejected by the server's strict schema, making both methods unusable via `client.account(id)`. The server's schemas are also relaxed (patch on the server side) so existing SDK installs continue to work without updating.

---

## [0.2.0] - 2026-06-28

### Added

- `profiles.getMe(params?)` now accepts an optional `linkedin_sections` array to request specific LinkedIn profile sections (e.g. education, experience, skills); responses include only the requested enrichment fields.
- `OwnProfile` type is normalized: `is_premium` and `is_open_profile` are always present on the response. Enriched section fields (`headline`, `summary`, `work_experience`, `education`, `skills`, and more) are present when the corresponding section was requested.
- `Chat` type now includes a `subject` field (nullable string) reflecting the conversation subject where available.

### Changed

- Array-valued query parameters are now serialized as repeated keys (`?key=a&key=b`) rather than as a comma-joined string. This matches the server's expected format for array parameters such as `linkedin_sections`.

---

## [0.1.1] - 2026-06-22

### Fixed

- Account-scoped write requests now send the account identifier in the request body where the API expects it. Previously the account identifier was always sent as a query parameter, regardless of the operation, which caused account-scoped write requests (sending invitations and InMail, posting and commenting, reacting, endorsing, saving leads, and the Recruiter pipeline writes) to be rejected. Read requests, body-less deletes, and filter-search requests are unaffected; they continue to carry the account identifier as a query parameter, matching the API. An account identifier you pass explicitly in a request still takes precedence and is never overwritten.

---

## [0.1.0] - 2026-06-21

Initial public release.

### Added

**Client and auth**
- `new Curviate({ apiKey })`: configures the SDK with a Bearer API key, base URL (`https://api.curviate.com`), timeout, and max retries.
- `curviate.account(accountId)`: returns an account-scoped accessor; all LinkedIn operations are tied to a managed account.

**Resource surface**

- `curviate.accounts.*`:
  - `list(params?)`: list managed accounts with optional `limit` and `cursor`.
  - `get(accountId)`: fetch a single managed account.
  - `link(body)`: connect a LinkedIn account via cookie or API key; returns an account or a checkpoint.
  - `reconnect(accountId, body)`: reconnect a disconnected account.
  - `refresh(accountId)`: force a session refresh.
  - `update(accountId, body)`: update account settings.
  - `disconnect(accountId)`: disconnect a managed account.
  - `submitCheckpoint(body)`: submit a 2FA / CAPTCHA checkpoint challenge.
  - `pollCheckpoint(body)`: poll for checkpoint resolution.
  - `createConnectLink(body)`: generate a hosted connect link.

- `curviate.account(id).messaging.*`:
  - `listChats(params?)`: list conversation threads.
  - `getChat(chatId)`: fetch a single chat.
  - `startChat(body)`: start a new conversation.
  - `listMessages(chatId, params?)`: list messages in a chat.
  - `getMessage(messageId)`: fetch a single message.
  - `sendMessage(chatId, body)`: send a message into a chat.
  - `editMessage(messageId, body)`: edit a sent message.
  - `deleteMessage(messageId)`: delete a sent message.
  - `addReaction(messageId, body)`: add an emoji reaction.
  - `getAttachment(messageId, attachmentId)`: download a message attachment.
  - `syncChat(chatId)`: trigger a chat history sync.
  - `syncMessages(params?)`: trigger a full message sync.
  - `sendInMail(body)`: send an InMail.
  - `getInMailBalance(params?)`: fetch InMail credit balance.

- `curviate.account(id).profiles.*`:
  - `get(profileId, params?)`: fetch a LinkedIn profile by id or handle.
  - `getMe()`: fetch the profile for the managed account holder.
  - `getCompany(companyId)`: fetch a company profile.
  - `listConnections(params?)`: list the account's connections.
  - `listFollowers(profileId, params?)`: list a profile's followers.
  - `listPosts(profileId, params?)`: list a profile's posts.
  - `listComments(profileId, params?)`: list a profile's post comments.
  - `listReactions(profileId, params?)`: list a profile's post reactions.
  - `endorse(profileId, body)`: endorse skills on a profile.

- `curviate.account(id).invites.*`:
  - `send(body)`: send a connection invitation.
  - `listSent(params?)`: list sent invitations.
  - `listReceived(params?)`: list received invitations.
  - `respond(invitationId, body)`: accept or ignore a received invitation.
  - `cancel(invitationId)`: cancel a sent invitation.

- `curviate.account(id).posts.*`:
  - `list(params?)`: list posts visible to the account.
  - `get(postId)`: fetch a single post.
  - `create(body)`: create a post.
  - `listComments(postId, params?)`: list comments on a post.
  - `comment(postId, body)`: comment on a post.
  - `listReactions(postId, params?)`: list reactions on a post.
  - `react(postId, body)`: react to a post.

- `curviate.account(id).salesNavigator.*`:
  - `searchPeople(body, params?)`: search people via Sales Navigator.
  - `searchCompanies(body, params?)`: search companies via Sales Navigator.
  - `getProfile(identifier, params?)`: fetch a Sales Navigator profile.
  - `getParameters(params)`: fetch available search filter parameters.
  - `saveLead(userId, body)`: save a lead.
  - `startChat(body)`: start a Sales Navigator conversation.
  - `syncMessages(params)`: sync Sales Navigator messages.

- `curviate.account(id).recruiter.*`:
  - `searchPeople(body, params?)`: search candidates via LinkedIn Recruiter.
  - `getProfile(identifier, params?)`: fetch a Recruiter candidate profile.
  - `getParameters(params)`: fetch available search filter parameters.
  - `syncMessages(params)`: sync Recruiter messages.
  - `startChat(body)`: start a Recruiter conversation.
  - `listProjects(params?)`: list Recruiter projects.
  - `getProject(projectId)`: fetch a single Recruiter project.
  - `addCandidate(userId, body)`: add a candidate to a project.
  - `addApplicant(userId, body)`: add an applicant to a job.
  - `rejectApplicant(userId, body)`: reject an applicant.
  - `listJobs(params?)`: list Recruiter job postings.
  - `createJob(body)`: create a Recruiter job posting.
  - `publishJob(jobId, body)`: publish a Recruiter job posting.
  - `solveJobCheckpoint(jobId, body)`: solve a job-posting checkpoint.
  - `listApplicants(jobId, params?)`: list applicants for a job.
  - `getApplicant(applicantId)`: fetch a single applicant.
  - `downloadResume(applicantId)`: download an applicant's resume.

- `curviate.account(id).search.*` (classic LinkedIn search):
  - `people(body)`: search people.
  - `companies(body)`: search companies.
  - `posts(body)`: search posts.
  - `jobs(body)`: search jobs.
  - `getParameters(query)`: fetch available search filter parameters.

- `curviate.webhooks.*`:
  - `create(body)`: register a new webhook endpoint.
  - `list(params?)`: list registered webhooks.
  - `update(id, body)`: update a webhook endpoint.
  - `delete(id)`: delete a webhook endpoint.
  - `listEvents()`: list available webhook event types.
  - `getStateDiff(accountId, params?)`: fetch an account state diff.

**Typed error model**
- `CurviateError`: single thrown type for all API errors, carrying a stable `code`, `httpStatus`, `retryHint`, `userFixable`, `retryLikelyToSucceed`, and `requiredTier`.
- `isCurviateError(err)`: type guard for narrowing in `catch` blocks.
- 34-member `ErrorCode` union covering every observable API error code.

**HTTP transport with retry and backoff**
- Exponential backoff with jitter for retryable GET/HEAD errors (configurable `maxRetries`).
- `Retry-After` header respected on 429 responses.
- Per-attempt abort controller timeout.
- JSON and binary (ArrayBuffer) response parsing.

**Cursor pagination**
- `curviate.paginate(method, params?)`: async iterator that follows the `cursor` field automatically.

**Webhook signature verification**
- `constructEvent(rawBody, signatureHeader, secret, opts?)`: verifies `HMAC-SHA256` webhook signatures using Web Crypto (`globalThis.crypto.subtle`); constant-time comparison prevents timing attacks; configurable replay window via `replayWindowSecs` (default 300 s). Always async, always `await` it.
- `WebhookSignatureError`: thrown on malformed header, invalid signature, or replay; not a `CurviateError`.
- `CurviateEvent`: 19-member discriminated union covering all canonical webhook event types.

**TypeScript types**
- Full OpenAPI-generated types at `src/generated/types.ts`: request bodies, responses, and path params.
- ESM-only build targeting ES2020; works in Node 18+, Cloudflare Workers, Vercel Edge.
