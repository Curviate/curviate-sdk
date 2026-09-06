// users namespace (9 methods, account-scoped) — renamed from `profiles`.
// Account-first path grammar: every request paths account_id as the leading
// `/v1/` segment. `getMe` folds into `get('me')`; `endorseSkill` sends
// `{endorsement_id}` (was `profiles.endorse`'s `{skill_endorsement_id}`).
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server.js";
import { Curviate } from "../../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_users", baseUrl: BASE });
const acc = client.account("acc_1");

describe("users.get", () => {
  it("GET /v1/{account_id}/users/{user_id} — 'me' returns the caller's own profile (folds in the old getMe)", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/users/me`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "user_profile",
          id: "u_1",
          type: "individual",
          display_name: "Alice Smith",
          first_name: "Alice",
          last_name: "Smith",
          specifics: {},
        });
      }),
    );
    const res = await acc.users.get("me");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/users/me");
    expect(res.first_name).toBe("Alice");
  });

  // The third read that accepts the retrieval pair (#30's audit; the two
  // messaging ones are pinned in messaging.test.ts). Driven on BOTH identifier
  // forms because `me` and a member id are two CLI surfaces over this one
  // method, and the ladder has to reach the wire from either.
  it("forwards mode/max_age as query params, on 'me' and on another user", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE}/v1/acc_1/users/:userId`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ object: "user_profile", id: "u_1", specifics: {} });
      }),
    );
    await acc.users.get("me", { mode: "cache_only" });
    await acc.users.get("ACoABC", { max_age: 0 });
    expect(seen[0]?.get("mode")).toBe("cache_only");
    expect(seen[1]?.get("max_age")).toBe("0");
  });

  it("there is no standalone getMe method — folded into get('me')", () => {
    expect((acc.users as unknown as Record<string, unknown>)["getMe"]).toBeUndefined();
  });

  it("GET /v1/{account_id}/users/{user_id} — another user's identifier", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/users/ACoABC`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "user_profile",
          id: "u_2",
          type: "individual",
          display_name: "Bob Jones",
          public_identifier: "bob-jones",
          specifics: {},
        });
      }),
    );
    const res = await acc.users.get("ACoABC");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/users/ACoABC");
    expect(res.public_identifier).toBe("bob-jones");
  });

  it("forwards linkedin_sections as a repeated query param", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/users/me`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          object: "user_profile",
          id: "u_1",
          type: "individual",
          display_name: "Alice Smith",
          specifics: {},
        });
      }),
    );
    await acc.users.get("me", { linkedin_sections: ["linkedin_experience", "linkedin_skills"] });
    const params = new URL(url!).searchParams;
    expect(params.getAll("linkedin_sections")).toEqual(["linkedin_experience", "linkedin_skills"]);
  });
});

describe("users.update", () => {
  it("PATCH /v1/{account_id}/users/{user_id} sends only the supplied allowed keys", async () => {
    let seenPath: string | undefined;
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${BASE}/v1/acc_1/users/me`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "user_updated" });
      }),
    );
    const res = await acc.users.update("me", { headline: "Building things", bio: "AI engineer" });
    expect(seenPath).toBe("/v1/acc_1/users/me");
    expect(body).toEqual({ headline: "Building things", bio: "AI engineer" });
    expect(res.object).toBe("user_updated");
  });

  it("strips a smuggled description key at runtime, forwarding only the legitimate keys", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${BASE}/v1/acc_1/users/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ object: "user_updated" });
      }),
    );
    // UserUpdateBody has no `description` key, so a typed caller is rejected
    // at compile time. An untyped/JS caller isn't — simulate one with a bare
    // object literal (no type annotation) that smuggles `description` in
    // alongside legitimate keys, and prove it never reaches the wire.
    const smuggled = { headline: "x", bio: "y", description: "smuggled" };
    await acc.users.update("me", smuggled);
    expect(body).not.toHaveProperty("description");
    expect(body).toEqual({ headline: "x", bio: "y" });
  });
});

describe("users.listRelations", () => {
  it("GET /v1/{account_id}/profiles/relations — served URL keeps profiles/ (snapshot quirk)", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/profiles/relations`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "relation_list",
          items: [{ object: "relation", first_name: "Bob", public_identifier: "bob-smith" }],
          cursor: null,
        });
      }),
    );
    const res = await acc.users.listRelations();
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/profiles/relations");
    expect(res.items?.[0]?.first_name).toBe("Bob");
  });

  it("forwards cursor/limit/filter as query params", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/profiles/relations`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "relation_list", items: [], cursor: null });
      }),
    );
    await acc.users.listRelations({ cursor: "cur_1", limit: 50, filter: "eng" });
    const params = new URL(url!).searchParams;
    expect(params.get("cursor")).toBe("cur_1");
    expect(params.get("limit")).toBe("50");
    expect(params.get("filter")).toBe("eng");
  });
});

describe("users.listFollowers", () => {
  it("GET /v1/{account_id}/users/{user_id}/followers", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/users/ACoABC/followers`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ object: "follower_list", items: [], cursor: null });
      }),
    );
    await acc.users.listFollowers("ACoABC", { limit: 10 });
    const url = new URL(capturedUrl!);
    expect(url.pathname).toBe("/v1/acc_1/users/ACoABC/followers");
    expect(url.searchParams.get("limit")).toBe("10");
  });
});

describe("users.listFollowing", () => {
  it("GET /v1/{account_id}/users/{user_id}/following", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/users/me/following`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "following_list",
          items: [{ object: "following", id: "u_9", display_name: "Carol" }],
          cursor: null,
        });
      }),
    );
    const res = await acc.users.listFollowing("me");
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/users/me/following");
    expect(res.items?.[0]?.display_name).toBe("Carol");
  });
});

describe("users.follow", () => {
  it("POST /v1/{account_id}/users/{user_id}/follow — bodyless", async () => {
    let seenPath: string | undefined;
    let seenBody: string | null = null;
    server.use(
      http.post(`${BASE}/v1/acc_1/users/ACoABC/follow`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        seenBody = await request.text();
        return HttpResponse.json({ object: "user_followed" });
      }),
    );
    const res = await acc.users.follow("ACoABC");
    expect(seenPath).toBe("/v1/acc_1/users/ACoABC/follow");
    expect(seenBody).toBe("");
    expect(res.object).toBe("user_followed");
  });

  it("surfaces connect_request_sent when the target's profile is private", async () => {
    server.use(
      http.post(`${BASE}/v1/acc_1/users/ACoABC/follow`, () =>
        HttpResponse.json({
          object: "connect_request_sent",
          id: "req_1",
          message: null,
          user: { id: "ACoABC", display_name: "Bob" },
        }),
      ),
    );
    const res = await acc.users.follow("ACoABC");
    expect(res.object).toBe("connect_request_sent");
  });
});

describe("users.unfollow", () => {
  it("DELETE /v1/{account_id}/users/{user_id}/follow — bodyless", async () => {
    let seenPath: string | undefined;
    let seenBody: string | null = null;
    server.use(
      http.delete(`${BASE}/v1/acc_1/users/ACoABC/follow`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        seenBody = await request.text();
        return HttpResponse.json({ object: "user_unfollowed" });
      }),
    );
    const res = await acc.users.unfollow("ACoABC");
    expect(seenPath).toBe("/v1/acc_1/users/ACoABC/follow");
    expect(seenBody).toBe("");
    expect(res.object).toBe("user_unfollowed");
  });
});

describe("users.getInMailCredits", () => {
  it("GET /v1/{account_id}/inmail-credits — relocated from messaging.getInMailBalance", async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/inmail-credits`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          object: "inmail_credits",
          credits: { classic: 5, recruiter: null, sales_navigator: null },
        });
      }),
    );
    const res = await acc.users.getInMailCredits();
    expect(new URL(capturedUrl!).pathname).toBe("/v1/acc_1/inmail-credits");
    expect(res.credits.classic).toBe(5);
  });

  it("forwards a service filter", async () => {
    let url: string | undefined;
    server.use(
      http.get(`${BASE}/v1/acc_1/inmail-credits`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ object: "inmail_credits", credits: { classic: null, recruiter: 3, sales_navigator: null } });
      }),
    );
    await acc.users.getInMailCredits({ service: "recruiter" });
    expect(new URL(url!).searchParams.get("service")).toBe("recruiter");
  });
});

describe("users.endorseSkill", () => {
  it("POST /v1/{account_id}/users/{user_id}/endorse-skill sends {endorsement_id} — NOT skill_endorsement_id", async () => {
    let seenPath: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/acc_1/users/ACo123/endorse-skill`, async ({ request }) => {
        seenPath = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ object: "skill_endorsed" });
      }),
    );
    const res = await acc.users.endorseSkill("ACo123", { endorsement_id: "1234" });
    expect(seenPath).toBe("/v1/acc_1/users/ACo123/endorse-skill");
    expect(body).toEqual({ endorsement_id: "1234" });
    expect((body as Record<string, unknown>)["skill_endorsement_id"]).toBeUndefined();
    expect(res.object).toBe("skill_endorsed");
  });
});

describe("users.getCompany removal (hard-move, pre-0.15.0)", () => {
  it("stays absent from the users resource surface", () => {
    expect((acc.users as unknown as Record<string, unknown>)["getCompany"]).toBeUndefined();
  });
});
