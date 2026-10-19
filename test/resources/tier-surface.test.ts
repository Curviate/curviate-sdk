// The Tier surface: `curviate.tier.get()`, the
// typed `TIER_REQUIRED` refusal for an Owner and a Member, the `tier_required`
// enum members, and the "Needs Automate" JSDoc sweep derived from the served
// OpenAPI's `x-curviate-tier` (never from a handed list).
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Curviate, ERROR_CODES, isCurviateError, type CurviateError, type Motion } from "../../src/index.js";
import type { components, paths } from "../../src/generated/types.js";
import fixture from "../../fixtures/openapi.json" with { type: "json" };

const BASE = "https://app.curviate.test";

function client(status: number, payload: unknown, seen?: { method: string; path: string }[]) {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    seen?.push({ method: init?.method ?? "GET", path: new URL(String(input)).pathname });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return new Curviate({ apiKey: "cvt_test_tier", baseUrl: BASE, fetch: fetchImpl, maxRetries: 0 });
}

const refusal = (extra: Record<string, unknown>) => ({
  code: "TIER_REQUIRED",
  message: "Motions are part of Automate.",
  user_fixable: true,
  retry_likely_to_succeed: false,
  retry_hint: { kind: "never" },
  ...extra,
});

async function caught(c: Curviate): Promise<CurviateError> {
  try {
    await c.motions.create({ name: "x", contact_list_ids: [] });
  } catch (err) {
    if (isCurviateError(err)) return err;
  }
  throw new Error("expected a CurviateError");
}

describe("TIER_REQUIRED decodes by name with its typed details", () => {
  // [name, wire fields, expected feature, requiredTier, currentTier, upgradeUrl]
  const ROWS: [string, Record<string, unknown>, unknown, unknown, unknown, unknown][] = [
    [
      "Owner: all four fields",
      { feature: "motions", required_tier: "automate", current_tier: "build", upgrade_url: "https://app.curviate.com/settings/billing" },
      "motions", "automate", "build", "https://app.curviate.com/settings/billing",
    ],
    ["Member: no upgrade_url", { feature: "drafts", required_tier: "automate", current_tier: "build" }, "drafts", "automate", "build", undefined],
    ["no Tier at all and no Tier sold with it: both null survive", { feature: "unibox", required_tier: null, current_tier: null }, "unibox", null, null, undefined],
    // Unknown controls: a value of the wrong type is dropped, never mistyped.
    ["wrong types are dropped", { feature: 7, required_tier: 3, current_tier: {}, upgrade_url: 9 }, undefined, undefined, undefined, undefined],
    ["a feature added later passes through", { feature: "inbox_ai", required_tier: "enhance" }, "inbox_ai", "enhance", undefined, undefined],
  ];

  it.each(ROWS)("%s", async (_n, wire, feature, requiredTier, currentTier, upgradeUrl) => {
    const err = await caught(client(403, refusal(wire)));
    expect(err.code).toBe("TIER_REQUIRED");
    expect(err.httpStatus).toBe(403);
    expect(err.userFixable).toBe(true);
    expect(err.retryLikelyToSucceed).toBe(false);
    expect([err.feature, err.requiredTier, err.currentTier, err.upgradeUrl]).toEqual([feature, requiredTier, currentTier, upgradeUrl]);
    // Round trip: JSON carries the same four, null kept, absent stays absent.
    const json = JSON.parse(JSON.stringify(err));
    expect([json.feature, json.requiredTier, json.currentTier, json.upgradeUrl]).toEqual([feature, requiredTier, currentTier, upgradeUrl]);
    expect("upgradeUrl" in json).toBe(upgradeUrl !== undefined);
  });

  it("is a known code, so it is never downgraded to INTERNAL; an unknown code still is", async () => {
    expect(ERROR_CODES).toContain("TIER_REQUIRED");
    const unknown = await caught(client(403, refusal({ code: "TIER_REQUIRED_V2", feature: "motions" })));
    expect(unknown.code).toBe("INTERNAL");
  });

  it("an error without the fields leaves them undefined", async () => {
    const err = await caught(client(403, { code: "INSUFFICIENT_ROLE", message: "no", user_fixable: true, retry_likely_to_succeed: false }));
    expect([err.feature, err.requiredTier, err.currentTier, err.upgradeUrl]).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("curviate.tier.get", () => {
  const BODY = {
    object: "tier",
    tier: "automate",
    bought_tier: "build",
    period: "monthly",
    trial: { tier: "automate", expires_at: "2026-10-26T10:00:00Z" },
    override: null,
    pending: { tier: "build", effective_at: "2026-11-19T10:00:00Z" },
    features: ["drafts", "contacts", "motions", "network", "unibox"],
    early_access: [{ tier: "enhance", requested_at: null }],
  };

  it("sends GET /v1/billing/tier and returns the body as is", async () => {
    const seen: { method: string; path: string }[] = [];
    const out = await client(200, BODY, seen).tier.get();
    expect(seen).toEqual([{ method: "GET", path: "/v1/billing/tier" }]);
    expect(out).toEqual(BODY);
  });

  it("parity: the served response carries exactly the fields the Tier read documents, no price, no Stripe id", () => {
    type R = paths["/v1/billing/tier"]["get"]["responses"]["200"]["content"]["application/json"];
    const schema = (fixture.paths as any)["/v1/billing/tier"].get.responses["200"].content["application/json"].schema;
    const keys = Object.keys(schema.properties).filter((k) => k !== "object" && k !== "safety_warning").sort();
    expect(keys).toEqual(["bought_tier", "early_access", "features", "override", "pending", "period", "tier", "trial"]);
    expect(keys.join()).not.toMatch(/price|amount|stripe/);
    // Compile-time half: the SDK type has exactly these keys (a missing or extra key fails tsc).
    const exact: Record<Exclude<keyof R, "object" | "safety_warning">, true> = {
      bought_tier: true, early_access: true, features: true, override: true, pending: true, period: true, tier: true, trial: true,
    };
    expect(Object.keys(exact).sort()).toEqual(keys);
  });
});

describe("tier_required enum members come from the served OpenAPI", () => {
  // Compile-time: assignable to the generated types (tsc fails if a member is missing).
  type SyncStatus = paths["/v1/network/sync-status"]["get"]["responses"]["200"]["content"]["application/json"];
  const pause: NonNullable<Motion["pause_reason"]> = "tier_required";
  const paused: NonNullable<SyncStatus["items"][number]["paused_reason"]> = "tier_required";

  it("Motion pause_reason, sync paused_reason and the enrichment failure_code carry it", () => {
    expect([pause, paused]).toEqual(["tier_required", "tier_required"]);
    // Runtime: every enum in the served document that names it, by property.
    const found = new Set<string>();
    const walk = (n: unknown, key: string): void => {
      if (Array.isArray(n)) return n.forEach((v) => walk(v, key));
      if (n === null || typeof n !== "object") return;
      for (const [k, v] of Object.entries(n)) {
        if (k === "enum" && Array.isArray(v) && v.includes("tier_required")) found.add(key);
        else walk(v, k);
      }
    };
    walk(fixture, "");
    expect([...found].sort()).toEqual(["failure_code", "pause_reason", "paused_reason"]);
  });
});

describe("JSDoc sweep: every gated write that exists says it needs Automate", () => {
  const tagged: [string, string][] = Object.entries(fixture.paths as Record<string, any>).flatMap(([p, ops]) =>
    Object.entries(ops).flatMap(([m, o]: [string, any]) => ("x-curviate-tier" in o ? [[m.toUpperCase(), p] as [string, string]] : [])),
  );
  const src = readdirSync("src/resources")
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(`src/resources/${f}`, "utf8"))
    .join("\n");
  // The doc block that names `METHOD /path` as an endpoint line.
  const block = (m: string, p: string): string | undefined => {
    const at = src.search(new RegExp("`" + m + " " + p.replace(/[{}]/g, "\\$&") + "[`?]"));
    return at < 0 ? undefined : src.slice(src.lastIndexOf("/**", at), src.indexOf("*/", at));
  };
  // Not in the SDK yet: the `network` and `unibox` namespaces arrive later and write the note on their own gated writes.
  const LATER = /^\/v1\/(network|unibox)\b/;

  it("derives a non-empty set, with the later namespaces as the only absentees", () => {
    expect(tagged.length).toBeGreaterThanOrEqual(23);
    for (const [m, p] of tagged) {
      if (LATER.test(p)) expect(block(m, p), `${m} ${p} arrived: drop it from LATER`).toBeUndefined();
      else expect(block(m, p), `${m} ${p} has no SDK method`).toBeDefined();
    }
  });

  it.each(tagged.filter(([, p]) => !LATER.test(p)))("%s %s", (m, p) => {
    expect(block(m, p)).toContain("Needs Automate");
  });

  it("control: passing writes (pause, archive, stop, remove) do not claim it", () => {
    for (const [m, p] of [
      ["POST", "/v1/motions/{id}/pause"],
      ["POST", "/v1/motions/{id}/archive"],
      ["POST", "/v1/motions/{id}/contacts/remove"],
      ["POST", "/v1/enrollments/{id}/stop"],
      ["POST", "/v1/contacts/delete"],
    ] as const) {
      expect(block(m, p), `${m} ${p}`).toBeDefined();
      expect(block(m, p)).not.toContain("Needs Automate");
    }
  });
});
