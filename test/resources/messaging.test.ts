// messaging namespace (12 methods, account-scoped) — path realign to the
// account-first grammar; markChatRead is new; getMessage/editMessage/
// deleteMessage/addReaction/getAttachment are re-homed under their chat and
// now take chatId as well as messageId; syncChat/syncMessages are removed
// (no served equivalent); getInMailBalance relocated to users.getInMailCredits.
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_messaging", baseUrl: BASE });
const acc = client.account("acc_1");

describe("messaging.listChats", () => {
  it("GET /v1/{account_id}/chats", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "chat_list", items: [{ object: "chat", id: "chat_1" }], cursor: null });
      }),
    );
    const res = await acc.messaging.listChats();
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/chats");
    expect(res.items?.[0]?.id).toBe("chat_1");
  });

  it("forwards inbox/unread/limit/cursor as query params", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "chat_list", items: [], cursor: null });
      }),
    );
    await acc.messaging.listChats({ inbox: "primary", unread: true, limit: 10, cursor: "cur_1" });
    const params = new URL(url!).searchParams;
    expect(params.get("inbox")).toBe("primary");
    expect(params.get("unread")).toBe("true");
    expect(params.get("limit")).toBe("10");
    expect(params.get("cursor")).toBe("cur_1");
  });
});

describe("messaging.startChat", () => {
  it("POST /v1/{account_id}/chats sends JSON — never multipart", async () => {
    let seenPath: string | undefined;
    let ct: string | null = null;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_1/chats`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        ct = request.headers.get("content-type");
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "chat_started", chat_id: "chat_new", message_id: "msg_1" }, { status: 201 });
      }),
    );
    const res = await acc.messaging.startChat({ attendees_ids: ["ACo_r1"], text: "hi" });
    expect(seenPath).toBe("/v1/acc_1/chats");
    expect(ct).toContain("application/json");
    expect(body).toEqual({ attendees_ids: ["ACo_r1"], text: "hi" });
    expect(res.chat_id).toBe("chat_new");
  });

  it("attachments travel as base64 JSON objects, not multipart", async () => {
    let ct: string | null = null;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_1/chats`, async ({ request }) => {
        ct = request.headers.get("content-type");
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "chat_started", chat_id: "chat_2", message_id: "msg_2" }, { status: 201 });
      }),
    );
    await acc.messaging.startChat({
      attendees_ids: ["ACo_r2"],
      text: "hello",
      attachments: [{ content: "YmFzZTY0", content_type: "image/png", filename: "x.png" }],
    });
    expect(ct).toContain("application/json");
    expect(ct).not.toMatch(/^multipart/);
    expect((body?.["attachments"] as unknown[])?.[0]).toEqual({
      content: "YmFzZTY0",
      content_type: "image/png",
      filename: "x.png",
    });
  });
});

describe("messaging.getChat", () => {
  it("GET /v1/{account_id}/chats/{chat_id}", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "chat", id: "chat_1" });
      }),
    );
    const res = await acc.messaging.getChat("chat_1");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/chats/chat_1");
    expect(res.id).toBe("chat_1");
  });

  // #30. `GET /v1/{account_id}/chats/{chat_id}` declares `expand`, `mode` and
  // `max_age`; the method sent no query at all, so a chat read had no
  // retrieval ladder while the two sibling reads did.
  it("forwards expand/mode/max_age as query params", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "chat", id: "chat_1", source: "store" });
      }),
    );
    await acc.messaging.getChat("chat_1", { expand: "public_identifier", mode: "refill", max_age: 300 });
    const params = new URL(url!).searchParams;
    expect(params.get("expand")).toBe("public_identifier");
    expect(params.get("mode")).toBe("refill");
    expect(params.get("max_age")).toBe("300");
  });

  // `max_age: 0` is `mode=live`, and it is the value a falsy check drops. The
  // API rejects an unknown query key, so an omitted argument must still send
  // an EMPTY query string rather than an invented one.
  it("sends max_age=0 rather than dropping it, and no query at all when omitted", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ object: "chat", id: "chat_1" });
      }),
    );
    await acc.messaging.getChat("chat_1", { max_age: 0 });
    await acc.messaging.getChat("chat_1");
    expect(seen[0]).toBe("?max_age=0");
    expect(seen[1]).toBe("");
  });
});

describe("messaging.markChatRead", () => {
  it("PATCH /v1/{account_id}/chats/{chat_id} sends {read}", async () => {
    let seenPath: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${BASE}/v1/acc_1/chats/chat_1`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "chat_updated", chat_id: "chat_1", read: true });
      }),
    );
    const res = await acc.messaging.markChatRead("chat_1", { read: true });
    expect(seenPath).toBe("/v1/acc_1/chats/chat_1");
    expect(body).toEqual({ read: true });
    expect(res.read).toBe(true);
  });
});

describe("messaging.listMessages", () => {
  it("GET /v1/{account_id}/chats/{chat_id}/messages", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1/messages`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "message_list", items: [{ object: "message", id: "msg_1" }], cursor: null });
      }),
    );
    const res = await acc.messaging.listMessages("chat_1");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/chats/chat_1/messages");
    expect(res.items?.[0]?.id).toBe("msg_1");
  });

  // The second of the three reads that accept the retrieval pair (#30's audit;
  // `users.get` is the third, pinned in users.test.ts). Its params type is
  // already path-derived, so this is a regression pin rather than a new
  // affordance — nothing else proves the pair reaches the wire from here.
  it("forwards mode/max_age as query params", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1/messages`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "message_list", items: [], cursor: null });
      }),
    );
    await acc.messaging.listMessages("chat_1", { mode: "cache_only", limit: 5 });
    const params = new URL(url!).searchParams;
    expect(params.get("mode")).toBe("cache_only");
    expect(params.get("limit")).toBe("5");
  });
});

describe("messaging.sendMessage", () => {
  it("POST /v1/{account_id}/chats/{chat_id}/messages sends JSON — never multipart", async () => {
    let seenPath: string | undefined;
    let ct: string | null = null;
    server.use(
      http.post(`${BASE}/v1/acc_1/chats/chat_1/messages`, ({ request }) => {
        seenPath = new URL(request.url).pathname;
        ct = request.headers.get("content-type");
        return HttpResponse.json({ object: "message_sent", message_id: "msg_new" }, { status: 201 });
      }),
    );
    const res = await acc.messaging.sendMessage("chat_1", { text: "hey" });
    expect(seenPath).toBe("/v1/acc_1/chats/chat_1/messages");
    expect(ct).toContain("application/json");
    expect(res.message_id).toBe("msg_new");
  });
});

describe("messaging.getMessage", () => {
  it("GET /v1/{account_id}/chats/{chat_id}/messages/{message_id} — re-homed, requires chatId", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1/messages/msg_1`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "message", id: "msg_1" });
      }),
    );
    const res = await acc.messaging.getMessage("chat_1", "msg_1");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/chats/chat_1/messages/msg_1");
    expect(res.id).toBe("msg_1");
  });
});

describe("messaging.editMessage", () => {
  it("PATCH /v1/{account_id}/chats/{chat_id}/messages/{message_id}", async () => {
    let seenPath: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${BASE}/v1/acc_1/chats/chat_1/messages/msg_1`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "message_edited", message_id: "msg_1" });
      }),
    );
    const res = await acc.messaging.editMessage("chat_1", "msg_1", { text: "edited" });
    expect(seenPath).toBe("/v1/acc_1/chats/chat_1/messages/msg_1");
    expect(body).toEqual({ text: "edited" });
    expect(res.message_id).toBe("msg_1");
  });
});

describe("messaging.deleteMessage", () => {
  it("DELETE /v1/{account_id}/chats/{chat_id}/messages/{message_id} — bodyless", async () => {
    let seenPath: string | undefined;
    let seenBody: string | null = null;
    server.use(
      http.delete(`${BASE}/v1/acc_1/chats/chat_1/messages/msg_1`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        seenBody = await request.text();
        return HttpResponse.json({ object: "message_deleted", message_id: "msg_1" });
      }),
    );
    const res = await acc.messaging.deleteMessage("chat_1", "msg_1");
    expect(seenPath).toBe("/v1/acc_1/chats/chat_1/messages/msg_1");
    expect(seenBody).toBe("");
    expect(res.message_id).toBe("msg_1");
  });
});

describe("messaging.addReaction", () => {
  it("POST /v1/{account_id}/chats/{chat_id}/messages/{message_id}/reactions sends {reaction}", async () => {
    let seenPath: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_1/chats/chat_1/messages/msg_1/reactions`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "message_reaction_added", message_id: "msg_1", reaction: "👍" });
      }),
    );
    const res = await acc.messaging.addReaction("chat_1", "msg_1", { reaction: "👍" });
    expect(seenPath).toBe("/v1/acc_1/chats/chat_1/messages/msg_1/reactions");
    expect(body).toEqual({ reaction: "👍" });
    expect(res.reaction).toBe("👍");
  });
});

describe("messaging.getAttachment", () => {
  it("GET /v1/{account_id}/chats/{chat_id}/messages/{message_id}/attachments/{attachment_id} — returns ArrayBuffer", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/chat_1/messages/msg_1/attachments/att_1`, ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse(bytes.buffer, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }),
    );
    const res = await acc.messaging.getAttachment("chat_1", "msg_1", "att_1");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/chats/chat_1/messages/msg_1/attachments/att_1");
    expect(res).toBeInstanceOf(ArrayBuffer);
    expect(res.byteLength).toBe(3);
  });
});

describe("messaging.sendInMail", () => {
  it("POST /v1/{account_id}/messages/inmail sends {recipient_urn,subject,text}", async () => {
    let seenPath: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/acc_1/messages/inmail`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "inmail_sent", message_id: "inmail_1", chat_id: "chat_x" }, { status: 201 });
      }),
    );
    const res = await acc.messaging.sendInMail({
      recipient_urn: "urn:li:member:99",
      subject: "Hi",
      text: "Hello",
    });
    expect(seenPath).toBe("/v1/acc_1/messages/inmail");
    expect(body).toEqual({ recipient_urn: "urn:li:member:99", subject: "Hi", text: "Hello" });
    expect(res.message_id).toBe("inmail_1");
  });
});

describe("messaging.searchChats", () => {
  it("GET /v1/{account_id}/chats/search forwards query/limit/cursor", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/search`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          object: "chat_list",
          items: [{ object: "chat", id: "chat_x", name: "Ada Lovelace" }],
          cursor: null,
        });
      }),
    );
    const res = await acc.messaging.searchChats({ query: "sophie", limit: 10 });
    const params = new URL(url!).searchParams;
    expect(new URL(url!).pathname).toBe("/v1/acc_1/chats/search");
    expect(params.get("query")).toBe("sophie");
    expect(params.get("limit")).toBe("10");
    expect(res.items?.[0]?.id).toBe("chat_x");
  });

  it("no matching chats is a valid, non-error empty result", async () => {
    server.use(
      http.get(`${BASE}/v1/acc_1/chats/search`, () =>
        HttpResponse.json({ object: "chat_list", items: [], cursor: null }),
      ),
    );
    const res = await acc.messaging.searchChats({ query: "zzz-no-match" });
    expect(res.items).toEqual([]);
  });
});

describe("messaging removed methods", () => {
  it("syncChat is absent — no served equivalent", () => {
    expect((acc.messaging as unknown as Record<string, unknown>)["syncChat"]).toBeUndefined();
  });

  it("syncMessages is absent — no served equivalent", () => {
    expect((acc.messaging as unknown as Record<string, unknown>)["syncMessages"]).toBeUndefined();
  });

  it("getInMailBalance is absent — relocated to users.getInMailCredits", () => {
    expect((acc.messaging as unknown as Record<string, unknown>)["getInMailBalance"]).toBeUndefined();
  });
});
