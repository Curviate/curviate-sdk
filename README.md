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
});
```

---

## Account-scoped accessor

Every LinkedIn operation (messages, member profiles, invites, posts) is tied to a **managed account**, a LinkedIn session you have connected via the connect flow (`curviate.auth.intent()`). The `curviate.account(id)` accessor fixes the `account_id` on every call so you do not have to thread it manually:

```ts
// Root-level: tenant-wide operations (accounts, auth, webhooks)
const { items: accounts } = await curviate.accounts.list();

// Account-scoped: all LinkedIn ops under a specific account
const acc = curviate.account(accounts?.[0]?.account_id ?? "");

// Now every resource call is scoped to that account:
const { items: chats } = await acc.messaging.listChats();
const me = await acc.users.get("me");           // your own profile
const profile = await acc.users.get("some-user-id"); // someone else's
```

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
      // names on PATCH /v1/{account_id}/safety-policy.
      // resetAt is null in the two cases no clock frees: the pending_invites
      // backlog, and an InMail credit pool LinkedIn regrants on its own schedule.
      console.warn(`${err.budgetRow} is spent until ${err.resetAt ?? "no fixed time"}`);
      console.warn(`change ${err.safetyHint?.parameter} to lift it`);
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

Every error code is documented in the [API reference](https://docs.curviate.com). The
exported `ErrorCode` type is the complete set, so `tsc` tells you when a `switch` over
`err.code` has missed one.

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

Resources that return lists support cursor pagination. `curviate.paginate()` is an async iterator that follows the `cursor` field automatically, so you pull items one at a time without managing cursors:

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

Delivery is at-least-once, so your handler can see the same logical event more than
once. The key that survives a retry is the payload composite `event.event` plus
`event.data.account_id` plus `event.data.occurred_at`, which the platform re-sends
byte-identical on every attempt:

```ts
const key = `${event.event}:${event.data.account_id}:${event.data.occurred_at}`;
if (await alreadyProcessed(key)) return res.sendStatus(200);
```

**Do not key on `event.id`.** That is a `wdl_` id minted per delivery *attempt*, so a
retry arrives with a different one and storing it would record the same event twice,
missing exactly the duplicates you were guarding against. It is still worth logging:
`event.id` is how you match one attempt to one line in your delivery logs, keyed
alongside the stable `occurred_at` composite above.

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
