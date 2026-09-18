# Changelog

All notable changes to `@curviate/sdk` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: semantic. Minor for additive changes, patch for bug fixes; no stability promise before 1.0.

---

## [0.34.0] - 2026-09-18

Fixture and types regenerated against the deployed production document
(`https://api.curviate.com`, 127 paths, server `dc4d3d9f0cce8159d7b6685a93291d71eec488c8`).

### Fixed

- **Ordinary-message subject retention copy corrected.** The served subject
  description previously read "...The InMail subject line, when the platform
  carries one on this message. Ordinary messages have none. ...", which a live
  round-trip disproved: a classic `start_chat` to a FIRST_DEGREE contact, sent
  with a subject, reads it back on `message.specifics.subject` and stores it
  on both sides. The description now reads "The message's subject line, when
  the platform carries one on this message. Typically an InMail opener, but an
  ordinary message sent with a subject carries one too. ...". No type shape
  change: description string only, at the three sites the served document
  carries it.

## [0.33.0] - 2026-09-17

The InMail subject on the message reads, now typed. Fixture and types
regenerated against the deployed production document
(`https://api.curviate.com`, 127 paths, server `a38f685e`); the exact source
commit is recorded in `fixtures/PROVENANCE.json`.

### Added

- **`MessageDetail["specifics"]`** types as `{ subject?: string | null }`, on
  `messaging.getMessage()` and each item of `messaging.listMessages()`. The
  served object is narrowed to `subject` alone (`additionalProperties: false`).
  `getChat()`, `listChats()` and `inboxes.listChats()` carry no `specifics` on
  their embedded `last_message`.

### Changed

- **`recruiter.startChat()` `follow_up.subject` retention copy corrected.** It
  previously read "Never stored and never logged, on any path", which is not
  supportable: a Recruiter follow-up is an InMail, so once sent it lands in the
  classic InMail inbox that the chat reads harvest. The served document now
  states the conditional, and the regenerated types and fixture carry it.
- **`messages.sendInmail()` `text`** and the `last_message` descriptions on the
  chat reads carry the same corrected retention wording.

### Documented

- **`messaging.listMessages()` / `messaging.getMessage()`**: an InMail thread's
  subject line arrives on a message as `specifics.subject`, set on the thread's
  opening message. The chat object carries no subject at all, and `chat.name` is
  the counterpart's display name, so the subject is read off the first message
  and not off the chat. An ordinary message returns `specifics: {}`. The served
  `specifics` object is narrowed to `subject` alone.
- **`messaging.getChat()` / `listChats()` / `inboxes.listChats()`**: a chat read
  carries no subject anywhere, its embedded `last_message` included. The preview
  is deliberately narrower than a message read so that a chat read returns the
  same fields whether it was answered live or from Curviate's stored copy. Read
  the chat's messages to get a subject.

### Fixture drift swept in by the refresh

The refresh also picked up already-deployed drift the previous fixture lagged
(it was captured from staging `c98d526`, 2026-09-15). All of it is real served
state, verified against both `api.curviate.com` and `api.staging.curviate.com`:

- Error-response `examples` blocks removed on **144** operations (343 response
  slots), on status codes 409, 422, 503 and 504 only. This is server commit
  `57afde5c5`, "error examples use only codes the API emits", which landed
  immediately after the previous fixture's base. The earlier estimate of ~38
  operations undercounted.
- Prose corrections to a handful of already-served descriptions: the 503 on the
  applicant-résumé read now names its code, the Sales Navigator chat 422 names
  only the code it emits, the auth-intent 402 describes both codes it can
  carry, and the safety-policy descriptions drop raw path templates and say
  "tenant" rather than "workspace".

---

## [0.32.0] - 2026-09-15

Seat discovery for connecting an account. Additive; nothing removed or renamed.

Fixture and types regenerated against the deployed staging document
(`https://api.staging.curviate.com`, 127 paths); the exact source commit is
recorded in `fixtures/PROVENANCE.json`.

### Added

- **`accounts.listSeats()`** (`GET /v1/accounts/seats`). Returns
  `{ object: "seat_list", items: { seat_id, occupied, account_id }[] }`: the
  workspace's live seats, whether an account occupies each, and that account
  (`null` when free). Not paginated. An empty seat is listed only when
  connecting an account to it would be accepted right now, so an empty seat
  that is provisional, cancelling, on an ended trial or blocked by billing is
  left out, and `items` can be `[]` while the workspace still has seats. Any seat with `occupied: false` is a valid `seat_id` for connecting a new
  account with `auth.intent`, so a connect no longer needs a seat id copied
  from the dashboard. Carries no billing fields. The response type is
  exported as `SeatList`.

- **Types only: `GET` and `PATCH /v1/safety-policy`** (tenant-wide safety
  defaults per limit profile and budget row). The generated `paths` type now
  describes them; there is no resource method yet, so call them through your
  own request if you need them today.

### Changed

- `auth.intent` documentation now points to `accounts.listSeats()` for finding
  a free seat, matching the regenerated `seat_id` description.
- Regenerated descriptions on `GET` and `PATCH /v1/{account_id}/safety-policy`:
  an account's values now resolve from its own setting, then the tenant
  default for its `limit_profile`, then the Curviate default, and `null` on the
  account write restores the tenant default where one is set. Documentation
  only; no type moved.

---

## [0.31.0] - 2026-09-11

Step two of the tier retirement, plus one billing refusal this SDK was about to
erase to `INTERNAL`. **Breaking** for any caller still branching on the two
retired codes; additive otherwise.

The trigger 0.30.0 named for the removal is met: every deployment now carries
the seat-based entitlement contract, so neither retired code can arrive.

Fixture and types regenerated against the deployed staging document
(`https://api.staging.curviate.com`, 125 paths); the exact source commit is
recorded in `fixtures/PROVENANCE.json`.

### Removed

- **`TIER_NOT_ACTIVE` and `PREMIUM_CONFLICT` are gone from `ErrorCode`,
  `ERROR_CODES` and `KNOWN_ERROR_CODES`.** Deprecated in 0.30.0; no deployment
  emits either any more. A `case "TIER_NOT_ACTIVE"` or
  `case "PREMIUM_CONFLICT"` now fails to type-check, which is the point: it was
  a branch that could never be taken. Handle `NO_ACTIVE_SEAT` for the seat
  refusal; `PREMIUM_CONFLICT` has no replacement, because the current connect
  input cannot express the conflict it reported.

  Should a wire body ever carry either code, it decodes to `INTERNAL` like any
  unknown code.

- **`seat_tier_mismatch` is gone from the safety-policy types**, on the read
  response, the write response and the write body. Seats no longer carry a
  tier, so there is nothing for it to disagree with, and the API has stopped
  returning it. Read `limit_profile` for what LinkedIn grants the account.

### Changed

- Two regenerated descriptions: job search `paging.total_count` now says it
  counts matching job postings and is `0` on an empty page, and the connect
  body's `recruiter_contract_id` is described by the LinkedIn Recruiter
  subscription rather than a Curviate tier. Documentation only; no type moved.

### Added

- **`STRIPE_DRIFT_DETECTED` (503).** Checkout refuses closed when Curviate's
  own seat-price configuration disagrees with the price it displays, so no one
  is charged an amount they were never shown. It is a Curviate-side
  misconfiguration: `userFixable` is `false`, a retry fails the same way until
  Curviate corrects the price, and nothing was charged. Surface it to a human
  or to support instead of backing off. Not in the transport's retryable set,
  so a GET carrying it is fetched once.

  Without this entry the refusal would have decoded to `INTERNAL`, reading as
  a generic server fault and being retried as one.

---

## [0.30.0] - 2026-09-09

Fixture and types regenerated against the deployed staging document
(`https://api.staging.curviate.com`, 125 paths); the exact source commit is
recorded in `fixtures/PROVENANCE.json`.

Product tiers are retired. Curviate no longer sells a Sales Navigator or
Recruiter product, no seat carries a tier flag, and one ordinary paid seat now
entitles the entire API surface.

**What actually happens to the error-code union: 45 codes to 67. Twenty-three
added, one removed, and the two retired tier codes KEPT.**

- **Added (23).** `NO_ACTIVE_SEAT` and `BETA_NOT_ENABLED`, plus twenty-one codes
  the API already returned that this SDK had been erasing to `INTERNAL`.
- **Removed (1).** `RATE_LIMITED`, which the API never produced at all.
- **Kept, deprecated (2).** `TIER_NOT_ACTIVE` and `PREMIUM_CONFLICT` are still
  exported. They are *not* gone, and that is deliberate: a client talks to a
  deployment rather than to a changelog, and an API that predates the
  seat-based entitlement rollout still answers them. See **Deprecated** below
  before you delete a `case`.
- **Removed field (1).** `CurviateError.requiredTier`, with `RequiredTier`,
  `REQUIRED_TIERS` and `KNOWN_REQUIRED_TIERS`. This one really is gone, so a
  pre-rollout deployment gives you the code without the field. See **Removed**.

**Breaking, and unusually so for a 0.x minor**, in two narrow places rather than
across the union: the `requiredTier` field is gone, and `RATE_LIMITED` is gone.
Everything else here is additive or a deprecation.

Ripple: this release follows the server-side gate collapse, the connect rework
and the beta consent gate, each already deployed. Nothing here is an SDK-only
decision; the wire contract moved first and this release catches the typed
client up to it, in one release rather than three.

### Deprecated

- **`TIER_NOT_ACTIVE` is replaced by `NO_ACTIVE_SEAT`, and `PREMIUM_CONFLICT`
  is withdrawn with no replacement, but BOTH ARE STILL EXPORTED.**

  Not a courtesy, and worth understanding before you delete a `case`: a client
  talks to a DEPLOYMENT, not to a changelog. An API that has not taken the
  seat-based entitlement rollout yet still answers `TIER_NOT_ACTIVE`, and a
  union that had dropped the code would decode it to `INTERNAL` there, turning
  a fixable billing refusal into what looks like a server fault, on exactly the
  deployments most likely to send it. Carrying a dead code for one release is
  the cheaper mistake.

  So handle both for now: `NO_ACTIVE_SEAT` from a current deployment,
  `TIER_NOT_ACTIVE` from an older one. They mean the same thing to a caller,
  and both are `user_fixable` 403s whose remedy is a seat. Each is marked
  `@deprecated` in its JSDoc with the replacement named, so your editor says so
  at the call site.

  They are removed in the first release after every deployment carries the new
  contract. That removal will be breaking and will say so.

  `CurviateError.requiredTier` is NOT kept, however: see Removed below. On a
  pre-rollout deployment you get the code without the field, which is enough to
  route on, since the message names the tier.

### Removed

- **`RATE_LIMITED` is gone: the API never produced it.** The substrate's own
  `RATE_LIMITED` is translated to `PLATFORM_RATE_LIMIT` (429) before any
  response is written, so no caller could ever receive the code this SDK was
  exporting. A `case "RATE_LIMITED"` was dead code, and worse than dead: it
  read as the handled branch for a throttle that actually arrives as
  `PLATFORM_RATE_LIMIT`, so the real one fell through to `default`.

  The codes to branch on for throttling are `RATE_LIMIT_ACCOUNT`,
  `RATE_LIMIT_TENANT`, `PLATFORM_RATE_LIMIT` and `LINKEDIN_RATE_LIMITED`. If
  you matched `RATE_LIMITED`, delete the arm; nothing was reaching it.

- **`CurviateError.requiredTier` is gone**, along with the `RequiredTier` type,
  the `REQUIRED_TIERS` array and the `KNOWN_REQUIRED_TIERS` set. There is no
  tier to name on a refusal any more, so the field carried nothing. It is also
  gone from `CurviateError.toJSON()`, so a serialized error no longer has the
  key at all. Code reading `err.requiredTier` to route an upgrade should read
  `err.code` instead and route on the three refusals described in the README.

### Added

- **Twenty-one codes previously collapsed to `INTERNAL` now surface.** Each is
  returned by a `/v1` route, the `/v1` catch-all, or a shared handler one of
  them calls, so each already reached this SDK's decoder, and because the
  exported union did not carry them, the decoder erased every one to
  `INTERNAL`. A refusal the caller could usually fix arrived looking like a
  server fault, with no `switch` arm possible.

  Routing and reads: `NOT_FOUND`, `REACTION_NOT_FOUND`. Upstream failures on
  connect and billing: `SUBSTRATE_LINK_FAILED`, `SUBSTRATE_CAP_REACHED`,
  `BILLING_CHECKOUT_FAILED`, `BILLING_PORTAL_UNAVAILABLE`. Tenant standing:
  `ACCOUNT_DISPUTED`, `ACCOUNT_LINKING_DISABLED`, `PERIOD_LOCKED`. Seat and
  subscription conflicts: `SEAT_NOT_EMPTY`, `SEAT_PROVISIONAL`,
  `SUBSCRIPTION_ALREADY_EXISTS`, `ALREADY_CANCELLED`,
  `CANCELLATION_ALREADY_EFFECTIVE`, `INVALID_CANCELLATION_SOURCE`. Free trial:
  `TRIAL_EXPIRED`, `TRIAL_SEAT_LIMIT`, `TRIAL_ACTIVE_SEAT_LIMIT`,
  `TRIAL_IDENTITY_ALREADY_USED`, `TRIAL_IDENTITY_UNRESOLVED`. Admin tenants:
  `ADMIN_BYPASS`.

  Additive for anyone who was already handling `INTERNAL` as their fallback:
  those cases now arrive with their real code instead, so a `default` arm that
  retried on `retryLikelyToSucceed` keeps working and can be narrowed. If you
  match on `INTERNAL` specifically to detect one of these, that check needs
  updating.

  `ADMIN_BYPASS` is a correction as much as an addition: this file previously
  named it as an example of a code that never reaches a caller, while the
  server constructed it at nine sites inside its versioned billing endpoints.

- **`BETA_NOT_ENABLED` (403).** A beta-gated operation refuses this until a
  human enables beta operations for the workspace in Settings, or the request
  carries the `X-Curviate-Beta` header. It is the third of three independent
  403 entitlement refusals, and nothing about it involves the seat or the
  LinkedIn subscription.

- **`@beta` JSDoc markers on every operation the served document badges beta**,
  which today is the whole Sales Navigator, Recruiter and inbox surface plus the
  two company-inbox reads. Your editor now says so before you call one. The
  badge is a superset of the gate: a badged operation is not necessarily gated,
  so read the code on a refusal rather than inferring it from the badge. The
  markers are derived from the served badge and checked in both directions, so
  they cannot silently drift from it.

- **README: "Three refusals, three codes"**, a table separating
  `NO_ACTIVE_SEAT` (fix it in Curviate billing) from
  `LINKEDIN_FEATURE_NOT_SUBSCRIBED` (fix it on LinkedIn) from
  `BETA_NOT_ENABLED` (a human opts the workspace in), because all three are 403
  and all three read alike in prose. It also states that request validation runs
  before every entitlement check, so an `INVALID_REQUEST` says nothing about
  entitlement, and a 403 from one of the three proves the request itself
  validated cleanly.

- **README: "Beta operations"**, on what the badge means and how it differs from
  the gate.

### Changed

- **Sales Navigator and Recruiter JSDoc no longer describes a Curviate-side
  entitlement.** Neither namespace has a product to buy and neither carries a
  tier: one ordinary paid seat entitles every method. What they do need is the
  LinkedIn account's own subscription, and an account whose LinkedIn lacks it
  refuses `LINKEDIN_FEATURE_NOT_SUBSCRIBED` with a remedy on LinkedIn rather
  than in Curviate billing. The namespace headers now say that instead of naming
  a tier.

- **`auth.intent()` connect scope is no longer seat-derived.** The connect asks
  for every product (classic, company, sales_navigator, recruiter) and LinkedIn
  activates whichever ones the account actually holds; `requested_products` on
  the account reports what was ASKED for, not what is attached. The optional
  `linkedin_premium` (`"sales_navigator"` | `"recruiter"`) narrows one
  connection, and **is never remembered**: a later connect or reconnect that
  omits it widens the scope back to every product, so it has to be restated on
  every call where Recruiter must win. `trial_premium` is gone from the connect
  surface.

- **The taxonomy is no longer documented as additive-only.** It tracks the
  served document: a code the API stops returning is removed and a renamed code
  is renamed, because a dead code in the union is worse than a breaking change
  a caller can see. Such changes are called out here, as this entry does.

---

## [0.29.0] - 2026-09-07

Fixture and types regenerated against the deployed staging document
(`https://api.staging.curviate.com`, 125 paths; source commit in `fixtures/PROVENANCE.json`).
Additive only: `safety-policy` now says where `limit_profile` came from, and an
operator override can be released without a reconnect.

### Added

- **`GET /v1/{account_id}/safety-policy` gains `limit_profile_source` and
  `limit_profile_detected_at`.** `limit_profile_source` is `"default"`,
  `"detected"` or `"operator"`: `default` means the value has never been
  observed and is the seeded `basic`, so it says nothing about the account;
  `detected` means Curviate read it from LinkedIn at `limit_profile_detected_at`,
  whether or not the value changed; `operator` means it was set through the
  PATCH. `limit_profile_detected_at` is an ISO date-time, or `null` until the
  value has been read at least once. Both fields appear on the PATCH response
  too.

- **`PATCH /v1/{account_id}/safety-policy` accepts `limit_profile_source`.**
  Sending `"default"` is a real write: it releases an operator override, and the
  value is re-read from LinkedIn on the account's next account read or connect.
  Sending `"detected"` or `"operator"` is accepted and ignored, so a document
  read from the GET round-trips unchanged. `limit_profile_detected_at` is
  read-only and likewise accepted and ignored on a write.

### Changed

- Description-only: the PATCH `limit_profile` description now states that
  Curviate re-reads the profile at most once a day on an account read (not only
  on connect and reconnect), and that the override is released by sending
  `limit_profile_source: "default"` rather than by writing `basic` back.

### Notes

- The server also removed `POST /v1/billing/seats/:seat_id/tier` in the same
  wave. `/v1/billing/*` has never been part of the served OpenAPI document, so
  there is no SDK surface change from it: the path count is unchanged at 125 and
  the generated types are untouched by that removal.
- `safety-policy` has no hand-written resource method in this SDK; it is reached
  through the generated `operations` types, which is where these two fields
  land.

---

## [0.28.0] - 2026-09-07

Fixture regenerated against the deployed staging document
(`https://api.staging.curviate.com`, 125 paths; source commit in `fixtures/PROVENANCE.json`).
**BREAKING**: `messaging.searchChats` now rejects a `query` shorter than 3
characters server-side. Pre-1.0 a breaking change ships as a minor, so a caret
range on `0.27.x` will not pick this up.

### BREAKING

- **`searchChats` requires a `query` of at least 3 characters.** A 1-2 character
  term previously returned `200`; it now returns `400 INVALID_REQUEST` with a
  message naming the minimum. The search is served from an index built out of
  overlapping 3-character sequences, so a shorter term cannot use it at all and
  falls back to a scan: measured at 238-292 ms against 4.5 ms for the same term
  one character longer. Returning `200` after 60x the work, with no way for a
  caller to learn why, was the worse contract.

  The bound is now expressed in the OpenAPI schema (`minLength: 3`) and in the
  generated parameter description. **TypeScript cannot express a string minimum
  length**, so the generated type is still `string`: the constraint is
  documented and enforced at the wire, not by the compiler. Debounce a
  type-ahead to 3 characters rather than relying on types to catch it.

  `companies.searchChats` is a different endpoint and is unaffected; its
  `query` stays optional and unbounded.

### Added

- **`accounts.retrieve` gains `event_log`**: `{ retained, row_cap, at_row_cap }`.
  Reports where the account stands against the retained event log's per-account
  row budget. While `at_row_cap` is true, events are still delivered to any
  registered webhook but are no longer retained, so the events resource has
  stopped being a complete record of what arrived. Additive and always present.

- Every string parameter and body field on the surface now publishes its real
  length bounds (`minLength` / `maxLength`) where the server enforces one. This
  was previously emitted only for numbers, so string constraints existed in
  descriptions and nowhere a generated client could read them.

---

## [0.27.0] - 2026-09-06

Fixture regenerated against the deployed production document
(`https://api.curviate.com`, 125 paths; source commit in `fixtures/PROVENANCE.json`).
**BREAKING**: the `message.delivered` webhook event is gone from the catalogue,
from `CurviateEvent`, and from the events a subscription can be created with.
Everything else here is additive or description-only. Pre-1.0 a breaking change
ships as a minor, so a caret range on `0.26.x` will not pick this up.

### BREAKING

- **`message.delivered` is removed from the webhook event catalogue.** The
  platform never emitted it, so no `event.event === 'message.delivered'` branch
  has ever run: the event was subscribable and undeliverable. Two surfaces lose
  the member.
  - `CurviateEvent` (hand-written, `src/webhooks.ts`) drops its
    `{ event: "message.delivered"; data: MessagePayload }` arm, going from 25
    arms to 24. A `switch` on `event.event` that still lists it stops
    compiling, and that arm was dead code in every build it ever shipped in.
  - The generated create-events enum, `events` on the `messaging` variant of
    the `POST /v1/webhooks` request body
    (`operations["postV1Webhooks"]["requestBody"]`), goes from 8 members to 7.
    Passing `"message.delivered"` to a create call is now a type error, and the
    server rejects the value.

  The two are pinned to each other by an exact two-way type equality in
  `test/webhooks.constructEvent.test.ts`, so they cannot drift apart: that pin
  is what failed first on this regeneration.

  `GET /v1/webhooks/events` now reports 27 events, messaging 7, where it
  reported 28 and 8.

  **The read path is untyped and deliberately unaffected.** `events` on a
  webhook returned by `GET /v1/webhooks` or `GET /v1/webhooks/{id}` is
  `string[]`, not the create enum. A subscription created before 2026-09-06 may
  still echo `message.delivered` in its stored `events` until the server-side
  cleanup migration lands; it was never delivered. Reading such a subscription
  back therefore neither breaks a build nor throws, and no migration is
  required of a consumer that only lists webhooks.

  **The replacement is a read, not an event**: `is_delivered` on the message
  resource.

### Regenerated types

- **BREAKING for an exhaustive `switch` - `notices[].code` gains
  `EXPANSION_WITHHELD_CEILING`.** On the same ten chat and message reads that
  accept `expand=public_identifier`, alongside `EXPANSION_LIMIT_REACHED` and
  `EXPANSION_WITHHELD_ACTIVITY_WINDOW`. The expansion was withheld because the
  account is at an account-safety ceiling, not because the page ran out of
  lookup budget and not because the account is outside its activity window.
  Same consequence for the reader as its two siblings, `public_identifier` is
  `null` for a reason that is not "no public profile", and a different remedy,
  which is why it is a separate code rather than a reuse. Additive on the wire:
  only a `switch` with a `never`-typed default arm stops compiling.
- Description-only, no type change:
  - `SafetyWarning` now states that `hint.message` is the one field whose text
    differs from the `BUDGET_EXHAUSTED` refusal. On a warn-posture ceiling
    breach it says the action went through and how far past the ceiling the row
    now stands, rather than telling the caller what was refused. The shape is
    unchanged, so no branch moves; the string is longer and more specific.
  - The `502` response documents that `retry_likely_to_succeed` is what
    separates its two cases: a temporary upstream error is worth retrying, an
    upstream response that could not be interpreted is not, and the latter
    carries `retry_hint: {"kind": "never"}`. No new field, and the SDK's own
    retry set is unchanged in this release.
  - The `notices` description on the ten expansion reads now lists the ceiling
    case as a third reason a person can go unresolved.

## [0.26.0] - 2026-09-06

Fixture regenerated against the deployed production document
(`https://api.curviate.com`, 125 paths; source commit in `fixtures/PROVENANCE.json`).
**BREAKING at the type level** for a consumer that reads `row` off an error
or a safety warning as a `string`: it is now `string | null` on both. Three
response enums also widen, which reds an exhaustive `switch` with a `never`
default. Everything else in this release is additive.

### Added

- **`NOT_STORED` in the error taxonomy.** The `422` a read gets when
  `mode=cache_only` (or `refill` on a resource that cannot be filled) finds
  nothing in Curviate's store, so the API refuses rather than reaching
  LinkedIn. It was missing from `ERROR_CODES`, so it decoded to `INTERNAL`:
  a caller could not branch on it, and, the harmful half, `INTERNAL` is
  retryable, so a `cache_only` miss was retried on a GET against an answer
  that cannot change until the caller picks another mode. It is now decoded to
  itself and is deliberately absent from the retryable set. Not the same as
  `RESOURCE_NOT_FOUND`: the resource may exist and this API simply holds no
  copy, so the fix is another mode, not another id. `cache_only` is the mode
  that raises it on these reads, and `refill` or `auto` is the remedy.

  **This reds `@curviate/cli`'s exit-code exhaustiveness guard, by design.**
  That guard iterates the exported `ERROR_CODES` array rather than a copy of
  it, which is the whole reason the array is exported, so a code added here
  with no exit-code mapping is supposed to fail it. Map `NOT_STORED` there when
  bumping the pin.
- **`messaging.getChat(chatId, params?)` takes the retrieval query.**
  `GET /v1/{account_id}/chats/{chat_id}` declares `expand`, `mode` and
  `max_age`; the method sent no query at all, so a chat read was the one
  store-servable read with no retrieval ladder. `ChatGetQuery` is derived from
  the generated `paths` types, like every other query type here.
  `users.get()` and `messaging.listMessages()` already carried the pair and
  are unchanged; the README now documents all three.

### Regenerated types

- **BREAKING - `row` is nullable on both `Error` and `SafetyWarning`.**
  `Error.row` goes `string | undefined` to `string | null | undefined`, and
  `SafetyWarning.row` - which is REQUIRED, so it is the one that will actually
  break a build - goes `string` to `string | null`. `null` says the breach
  names no row: an `activity_window` refusal on an action that spends no
  budget of its own has an hour to answer for and no counter. Read
  `hint.parameter` in that case; it names `posture`. A consumer that assigned
  `.row` to a `string` or passed it somewhere non-null now has a type error,
  and that error is correct - the runtime value was always going to be `null`
  once the server started sending it. The SDK's own `CurviateError.budgetRow`
  is UNCHANGED (`string | undefined`): `transport.ts` maps the wire field with
  a `typeof === "string"` guard, so a `null` row arrives as an absent
  `budgetRow`, which is what "no row to name" already meant on that surface.
- **BREAKING for an exhaustive `switch` - three response enums widen.** Each
  gains a member, so a `switch` with a `never`-typed default arm stops
  compiling. None of them removes a member, so a `switch` with a real default
  keeps working:
  - `GET /v1/{account_id}/safety-events` `items[].reason` gains
    `activity_window` alongside `budget_exhausted` and `rate_limited`.
  - `GET /v1/{account_id}/safety-events` `items[].budget_row` gains `"*"`, the
    wildcard for an event that is not scoped to one row.
  - `notices[].code` on the ten chat and message reads that accept
    `expand=public_identifier` gains `EXPANSION_WITHHELD_ACTIVITY_WINDOW`
    alongside `EXPANSION_LIMIT_REACHED`: the expansion was refused because the
    account is outside its activity window, not because the page ran out of
    lookup budget. Same consequence for the reader either way -
    `public_identifier` is `null` for reasons that are not "no public profile"
    - but a different fix, so it is a separate code. The `notices` key itself
    is not new.
- **Additive - `interface_ceiling` and `effective_interface_ceiling` on every
  budget row.** Optional, `number | null`. They appear on `quotas[]` from
  `GET /v1/accounts/{account_id}` and on the policy rows from
  `GET`/`PATCH /v1/{account_id}/safety-policy`. What a call through the
  matching ELEVATED interface (`/sales-navigator/...`, `/recruiter/...`) is
  held to on that row; `null` wherever the row and limit profile have no such
  figure, which is every row on `basic` and `premium`. `ceiling`,
  `effective_ceiling`, `band` and `over_default` all remain the STANDARD
  figure, so a row can report `band: "over"` while an elevated call still
  succeeds. Read `effective_interface_ceiling`, not `interface_ceiling`, for
  the same reason `effective_ceiling` and not `ceiling` answers that on the
  standard side. On the `PATCH` request body both are typed `unknown` and
  documented READ-ONLY: sent back they are accepted and ignored, so a read can
  round-trip unedited.
- **Additive - `activity_window` on the `PATCH /v1/{account_id}/safety-policy`
  request body**, typed `unknown` and documented NOT ACCEPTED. Send the
  settable subfields instead: top-level `timezone`, and per row
  `activity_window_start`, `activity_window_end`, `activity_window_timezone`,
  `activity_window_applies_to`.
- Description-only, no type change: `reset_at` on `Error` and `SafetyWarning`
  now states that it is the window roll on a `ceiling` refusal and the next
  window open on an `activity_window` one, and restates the two cases where no
  clock frees the account (the `pending_invites` gauge, and InMail credits).
  The chat-search `q` parameter documents that a 1-2 character term is slower.

## [0.25.0] - 2026-09-05

**BREAKING** for a consumer that pinned the old type declarations: `quotas[]`
on `GET /v1/accounts/{account_id}` is a different array, and `message_id` on
`startChat`, `sendMessage`, `sendInMail` and the company chat reply is now
`string | string[] | null` where it was `string`. Both are detailed under
"Regenerated types" below. Pre-1.0 a breaking change ships as a minor, so a
caret range on `0.24.x` will not pick this up.

### Added

- **`BUDGET_EXHAUSTED`, the account-safety refusal, and its payload.** A `429`
  that is Curviate's own ceiling rather than a request-rate limit: nothing
  reached LinkedIn and nothing was spent. `CurviateError` gains `budgetRow`
  (wire `row`), `resetAt` (`reset_at`, and `null` in the two cases no clock
  frees: the `pending_invites` gauge and an InMail credit exhaustion),
  `safetyHint` (`hint`, the settable parameter
  on `PATCH /v1/{account_id}/safety-policy`), `safetyReason` (`reason`:
  `ceiling` or `activity_window`) and `blocked`. All six ride `toJSON()`.
  The code is deliberately NOT retryable: a monthly row's reset can be weeks
  out, so a backoff loop burns retries against a wall that will not move.
  On a successful response the same payload arrives under `safety_warning`
  with `blocked: false`, typed on the generated response types.
- **`budgetRow` and `retryAfterSeconds` on a paused-row `PLATFORM_RATE_LIMIT`.**
  Same wire `row`, different meaning: LinkedIn refused a recent call on that
  row, so the next one is refused locally until the pause lifts. The pause is
  scoped to `(account, row)`, so the recovery is to switch work rather than
  back off across the account. `retry_after` is deliberately NOT folded into
  `retryAfterMs`, which everything sleeps.
- **A response carrying `row` is never auto-retried, on any method.**
- **`LINKEDIN_SESSION_EVICTED`.** A 401 split from `LINKEDIN_AUTH_FAILED`
  because the remedies differ: reconnecting does nothing while the other
  session is open. Not retryable.

### Changed

- **Fixture regenerated against the deployed production document**
  (`https://api.curviate.com`, `git_sha 33b42521...`), and the generated
  types with it. Two shape changes are BREAKING for a consumer that pinned
  the old declarations, and one enum widened. See "Regenerated types" below.

### Regenerated types

- **BREAKING - `quotas[]` on `GET /v1/accounts/{account_id}` is a different
  array.** `quota_name`, `remaining`, `total`, `reset_time` and
  `recommended_throttle_hint` are gone. Each row now carries `budget_row`,
  `kind` (`debit` / `tally` / `gauge`), `window`, `window_start`, `resets_at`,
  `used`, `ceiling`, `effective_ceiling`, `band`, `posture`, `over_default`,
  `halt` and, on the gauge, `observed_at`. **Compare `used` against
  `effective_ceiling`**, which is `ceiling` with the account's warm-up ramp
  applied; on a new account the two differ by roughly a factor of seven.
  `used` is `null` only on the gauge, and only before anything has observed
  it. The per-minute REQUEST ceiling is deliberately not in this array.
- **BREAKING - `message_id` is `string | string[] | null`** on `startChat`,
  `sendMessage`, `sendInMail` and the company chat reply, where it was
  `string`. `null` when no message was actually sent, an array when the
  message was delivered as several, one per attachment. Confirm a send with
  `chat_id`, which is always present.
- Chat-search results: `type` gains `channel`. The generated comment used to
  say search results are never channels; that is no longer true, so an
  exhaustive `switch` over `type` needs a third arm.
- Additive: `GET`/`PATCH /v1/{account_id}/safety-policy`,
  `GET /v1/{account_id}/safety-events`, the four retained-event operations
  under `/v1/{account_id}/events`, a `SafetyWarning` component reachable as
  `safety_warning` on 149 success responses, six new optional fields on the
  shared `Error` component, `coverage` on chat search, `mode` and `max_age`
  query params on the store-served reads, `account_states[]` on the account
  resource, and `observed_at` / `source` / `withdrawn` becoming REQUIRED on
  four entity reads (a response gaining guarantees, not losing them).

- **`postpublish` now notices a stale CLI pin.** After every `npm publish`,
  `scripts/check-cli-notice.mjs` compares the version just published
  against what `@curviate/cli` actually declares for `@curviate/sdk` on the
  registry (never a dist-tag lookup, since `npm view @curviate/sdk version`
  returns `latest` and this package's own RC/0.x releases route to `--tag
  next`). Exits non-zero, loudly, when the CLI has not picked up the
  release yet. It cannot undo the publish and does not try to; it replaces
  the prior manual runbook step, which could not fail by construction
  (the SDK-CLI drift-notice defect).
- `check:clean` now flags a committed npm auth token (`npm_`-prefixed
  shape), and `.npmrc`/`*.tgz` are gitignored. Same gap as the sibling
  `cli` package's copy of this scanner (security-auditor F3).

## [0.24.3] - 2026-08-27

Fixture regenerated against the deployed production document
(`https://api.curviate.com`, `git_sha cf4fc77e...`). Patch: no `ErrorCode`
change, no runtime change.

These are corrections, not changes. The wire has always sent these shapes;
the previous declarations described them wrongly, so consumer code that
type-checked against the old declaration was already failing at runtime.
Upgrading may turn a consumer's `tsc` red where it was previously green
against a declaration that did not match reality. That red is the bug
becoming visible, not a new one.

### Sales Navigator response corrections

- `founded_on`: was an open object, is a `number`
  (`sales-navigator/search/companies` and `sales-navigator/account-lists`).
- `websites`, `addresses`: were arrays of open objects, are `string[]`.
- `contact_info.phones`, `contact_info.emails`: were arrays of open objects,
  are `string[]`.
- `specialties`: was `unknown`, is `string[]` on
  `sales-navigator/search/companies`.
- Nested `school`, `company` and `organization` references on `education`,
  `work_experience` and `volunteering` are now declared, each with a
  nullable `id`.
- `job_title` and `role` are now required (non-optional) on
  `work_experience` and `volunteering`.

### Also reflected from production, first fixtured here

- `expand` removed from `GET /v1/{account_id}/chats/search`. The parameter
  was inert: that endpoint's response is a strict subset that emits no user
  object, so the expansion had nowhere to land. Its `notices` block goes
  with it. Removed server-side before this release; every other
  `expand`-accepting endpoint is unaffected.
- `quoted` on a message is now declared recursively as a `Message`, so a
  quoted message carries the full message shape and may itself carry a
  `quoted`.
- Wording only: "Provider-enriched detail about the sender" is now
  "Platform-enriched detail about the sender" (5 occurrences).


## [0.24.2] - 2026-08-24

Fixture regenerated against the deployed production document
(`https://api.curviate.com`, `git_sha bc7f42a2...`). Patch: no `ErrorCode`
change, no runtime change.

- `already_disconnected` (`type: boolean, enum: [true]`) declared on the
  `200` response of `DELETE /v1/accounts/{account_id}`. Present and `true`
  only when the account was already disconnected before the call, so a
  retry (or an id superseded by a reconnect) is distinguishable from a
  fresh disconnect. The endpoint's status code and idempotency are
  unchanged.
- 404 descriptions across ~30 account-scoped operations reworded to note
  that a superseded account id (one whose connection was replaced or
  removed) also resolves as not-found here, with a pointer to re-read
  `GET /v1/accounts` for the current id.

## [0.24.1] - 2026-08-24

Fixture regenerated against the deployed production document
(`https://api.curviate.com`, `git_sha 52740a21...`), the first regeneration
taken from production rather than a local server. Patch: no `ErrorCode`
change, no runtime change.

- `413` (`PAYLOAD_TOO_LARGE`) response declared on all body-taking operations
  that accept one (61 of 63; the remaining 2 take no request body). 9 of
  those `413` descriptions were also reworded for clarity.
- Catching up two already-shipped-but-unfixtured changes, both live in
  production before this release and now reflected here for the first time:
  - `403` (`ACCOUNT_RESTRICTED` / `TIER_NOT_ACTIVE`) declared on
    `POST /v1/auth/intent`, `POST /v1/auth/checkpoint/solve`, and
    `POST /v1/auth/checkpoint/request`, mapping a `provider/access_restricted`
    403 correctly instead of the previous `FEATURE_NOT_SUBSCRIBED`.
  - Chat/message-send descriptions (`POST /v1/{account_id}/chats`,
    `POST /v1/{account_id}/chats/{chat_id}/messages`,
    `POST /v1/{account_id}/companies/{identifier}/chats/{chat_id}/messages`)
    now state the 9 MiB whole-request-body budget alongside the existing
    5 MiB per-file limit.

## [0.24.0] - 2026-08-19

Regeneration against the deployed OpenAPI document following the server's
document-wide examples-oracle work. Additive only: 107 schema leaves added,
0 removed, 0 retyped.

**Minor, not patch: purely additive, but several fields go from absent or
untyped to a real declared shape**, which is new surface a 0.x consumer can
now rely on.

### Added

- Sales Navigator saved-account and saved-lead item fields are now declared
  with correct nullability, matching what the API actually returns.
- `skills` and `languages` are now correctly typed as string arrays.
- Fields backed by a free-form object on the server (for example `PATCH
  /v1/accounts` `metadata`) are now typed as objects instead of being
  propertyless.
- Pass-through platform objects are now declared open, so an unlisted key on
  a passed-through object no longer types as an error.

## [0.23.0] - 2026-08-18

Regeneration against the deployed OpenAPI document following recent server
changes. Nothing was hand-edited.

**Minor, not patch: removing an optional field from a request-body type can
red a consumer's typecheck** (an object literal or a spread that still
supplies `network_distance` now fails structural typing), even though the
field never functioned against the server. That is a breaking change for a
0.x consumer, and under 0.x, minor is how it gets signalled.

### Changed

- **`SearchCompaniesBody` drops `network_distance`.** The field was removed
  server-side; it never filtered anything, and declaring it invited a
  request the server ignores. `SearchPeopleBody` is unaffected and keeps its
  own `network_distance`.
- **`GET /v1/webhooks` cursor description now says it is decodable.** Previously
  "Opaque pagination cursor from a previous response"; now describes it as
  decodable and to be passed back verbatim. No type change.

## [0.22.0] - 2026-08-17

Regeneration against the deployed, served OpenAPI document at server commit
`7bdf0af7` (`https://api.curviate.com/.well-known/openapi.json`). Nothing was
hand-edited.

**Minor, not patch, because the section arrays gained declared item shapes.**
No method, path, or response was added or removed, nothing became required,
and every new field is optional on a type that still carries an open
`[key: string]: unknown` index signature, so reading code that compiled
against 0.21.0 continues to compile. Code that *constructs* one of these
objects with a field whose type conflicts with the declared one (a hand-rolled
test fixture, most likely) will now be rejected, which is the only way this
release can break a consumer.

### Changed

- **Recruiter and Sales Navigator profile section arrays now declare their item
  shape.** `skills`, `experience`, `education`, `certifications`, `languages`,
  `projects`, `recommendations`, and `volunteering` were typed as bare
  `{ [key: string]: unknown }[]`; each entry now carries its known fields
  (`name`, `endorsement_count`, `company`, `title`, and so on) intersected with
  the same open index signature. Each field's description states where the
  shape came from: these are declared from the classic profile's live-measured
  shape for the same underlying section, not from a Recruiter- or Sales
  Navigator-specific capture, so confirm field-for-field against a real
  response before treating an inferred or absent field as fact.
- **Every paginated endpoint's 400 description now names a malformed cursor.**
  An undecodable cursor is rejected with a 400 rather than silently serving
  page 1. Documentation only; the response types are unchanged.

## [0.21.0] - 2026-08-13

Regeneration against the deployed, served OpenAPI document at server commit
`d468b90f` (`https://api.staging.curviate.com/.well-known/openapi.json`).
Nothing was hand-edited.

**Minor, not patch, because two of the mirrored changes are breaking for a
typed consumer**, even though nothing in this package's own source changed:
existing code that compiles against 0.20.2's types will not compile against
these without changes. A `^0.20.x`-pinned consumer will not receive this
release, by design; that is what the minor bump is for.

### Changed (breaking)

- **`total_count` on a people-search page is now `number | null`** (was
  `number`): the server stopped reporting a total once results are served
  cursor-natively, rather than reporting a number that no longer meant
  "how many pages remain." A consumer that read `total_count` as a bare
  number must now narrow it.
- **`profile_url` on a search result's `user` object is now `string | null`**
  (was `string`), for the same reason as above: the platform does not always
  surface a public profile URL, and the type now says so instead of lying.
  A new optional `public_identifier` field (present only when requested via
  `expand=public_identifier`) is the additive companion to this change.
- **Profile section arrays (`experience`, `education`, `languages`,
  `certifications`, `volunteer_experience`, `projects`)** on the classic and
  Recruiter-enriched profile shapes went from opaque `{}[]` to fully described
  per-entry shapes. Any consumer that was indexing into these arrays without a
  described shape gains real fields; one that had hand-rolled its own local
  type for these arrays now has a mismatch to reconcile.

### Added

- **`PAGE_TRUNCATED`** joins the people-search `notices[].code` enum
  (`FILTER_VALUE_UNRESOLVED` / `FILTER_VALUE_UNCHECKED` / `SOME_RESULTS_HIDDEN`
  / `ALL_RESULTS_HIDDEN`), reporting when a page is short because upstream
  fetching stopped, not because results ran out; follow `cursor` and treat
  only a `null` cursor as the end.
- **`POST /v1/webhooks/{id}/test`**, for firing a synthetic delivery at a
  registered webhook without waiting on a real trigger.
- **`expand=public_identifier`** query parameter on the four message-detail /
  chat-detail endpoints, resolving a vanity slug alongside the existing
  fields for up to 25 people per request.

### Fixed

- **The quota family description no longer describes itself as a
  "usage-safety recommendation."** `total` is documented as "a substrate
  capacity ceiling, not a safe sustained rate," and the throttle-hint enum
  spells out exactly which values are advisory (`none` / `slow_down` /
  `backoff`, none of which ever block a request) versus the one binding limit
  (`stop`, `account.per_minute` only, enforced with HTTP 429): a capacity
  framing, replacing the old safety framing.
- Quota example values now mirror the live raised ceilings (`messages.daily`
  400, `connection_requests.daily` 480, `profile_views.daily` 400,
  `inmail.daily` 60, `profile.endorse` 160), not the retired 100/120/100/40
  set.

## [0.20.2] - 2026-08-10

Published as a patch, not a minor, for the same reason 0.20.1 was: it satisfies
the `^0.20.1` range already declared by installed consumers, including
`@curviate/cli`, so it reaches them on the next install with no consumer-side
version bump. A `0.21.0` would have reached nobody, because a caret on a `0.x`
version never resolves the next minor.

The generated types are a mirror of the served OpenAPI document. This release
is a regeneration against that document, at the commit recorded in
`fixtures/PROVENANCE.json`; nothing
was hand-edited.

### Fixed

- **Typographic characters no longer ship in the published types.** The API
  document was swept clean of ellipsis, arrow, comparison and multiplication
  glyphs, but the SDK's generated mirror of it was not regenerated afterwards,
  so `src/generated/types.ts` and `dist/index.d.ts` each still carried 195 of
  them. They ship directly to consumers, where they surface in editor tooltips
  and IntelliSense on every documented field. Both files are now free of them.

### Added

- **`urn` on posts.** A post's `id` is the identifier for the surface that
  returned it and can differ between two responses describing the same post,
  which made "have I already seen this one?" unanswerable from the types.
  `urn` is stable however you reached the post, so two responses can be
  compared directly. It is `null` when the post carries no resolvable
  identity, and two nulls are never a match.

- **`urn` and `created_at` on a comment's `parent_post`**, so a comment can be
  joined to the post it was made on without a second request.

- **A reaction's `parent_post` is now a described shape** rather than an opaque
  empty object. It carries `object`, `id`, `urn` and `created_at`, which makes
  "have I already reacted to this post?" answerable from the response.

  All four are optional and nothing was removed, narrowed, or renamed, so a
  consumer that compiled against 0.20.1 still compiles.

## [0.20.1] - 2026-08-10

Published as a patch, not a minor: it satisfies the `^0.20.0` range already
declared by installed consumers, including `@curviate/cli`, so it reaches them
on the next install with no consumer-side version bump.

### Fixed

- **Path parameters are percent-encoded, and a few unusable values are now
  rejected.** Every id you pass to a method was interpolated into the request
  path verbatim, so any character that means something to a URL parser changed
  which endpoint the call reached. A share URL passed as a post id turned one
  path segment into eight (and `https://` collapsed to `https:/` on the way),
  producing a 404 on a value the API accepts; a `?` moved the rest of the id
  into the query string; and a value containing `../` was resolved away by the
  URL parser before the request was sent, retargeting the call at a different
  endpoint entirely. That last one is a security defect: if any part of an id
  reaches your code from model output, end-user input, or a scraped page, it
  could redirect the request. All 117 path parameters across every namespace
  are now encoded at the point they enter the path, including the account id
  bound by `account(id)`.

  Encoding closes that on its own for every value except one class. `.` and
  `..` are not encoded by `encodeURIComponent`, and a URL parser decodes a
  segment before deciding whether it is a dot segment, so percent-encoding
  them changes nothing. A path parameter that is exactly `.`, `..`, or the
  empty string is therefore **rejected** with `INVALID_REQUEST` before any
  network call, as a rejected promise like every other error here. No id, URN,
  or slug is ever one of those three values. A value that merely contains a
  dot (`1.2.3`, `.hidden`, `...`, `a..b`) is untouched, and so is a literal
  `%2e`, which encoding already makes inert.

  What changes for you, concretely:

  - Ids made only of letters, digits, `-`, `_`, `.`, and `~` produce a
    byte-identical request. Numeric post ids, `acc_...` ids, and public slugs
    are in this group, so most calls are unaffected.
  - Ids containing reserved characters (URN colons and commas, base64 `+` and
    `/`, chat-id `=`) now travel percent-encoded. The API decodes them back to
    the same value, so the call behaves as before; only the bytes on the wire
    differ. Snapshot tests that assert on a literal request path will need
    updating.
  - Ids that never worked start working: a share URL, or any id containing `/`,
    `?`, or `#`, now reaches the API intact.
  - **One breaking case.** If you were working around this by percent-encoding
    an id yourself before passing it in, stop: pass the decoded value. The SDK
    owns the encoding now, so a pre-encoded id is treated as a literal value
    containing percent signs and is encoded again.
  - Every call made through an `account(id)` scope changes on the wire if that
    id contains a reserved character, not just calls to one method. The bound
    selector is encoded like any other path parameter.
  - A whitespace or control character inside an id is no longer silently
    dropped. Tab, carriage return, and line feed were deleted outright by the
    URL parser, so an id with a stray one could accidentally match the intended
    resource; it is now sent encoded and will simply not be found. If you were
    relying on that accidental cleanup, trim your ids.
  - An id containing the literal text `{account_id}` is no longer substituted.
    That placeholder is how an account-scoped path is built internally, and a
    raw id containing it used to be rewritten mid-flight. It is now encoded and
    passed through as the value you supplied.
  - Values that are not strings are stringified before encoding, so a JS
    consumer passing an array now sends `a%2Cb` where it previously sent `a,b`.
    Both decode to the same thing; only the bytes differ.

  One deployment note: the encoded form of `/` is `%2F`, and while the Curviate
  API accepts it, some infrastructure in front of your own code may not. Apache
  with `AllowEncodedSlashes Off`, certain reverse proxies, and some web
  application firewalls reject `%2F` in a path outright. This only affects ids
  that genuinely contain a slash, share URLs above all.

## [0.20.0] - 2026-08-07

Generated types are rebuilt from the **served** OpenAPI document rather than a
hand-refreshed snapshot, and the snapshot itself now records where it came from.
Source of this release: `https://api.staging.curviate.com`. The exact source
commit is recorded in `fixtures/PROVENANCE.json` rather than here, because this
file ships inside the published package and an API commit id is not something a
consumer of it can resolve.

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
