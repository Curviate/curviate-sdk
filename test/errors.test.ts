// CurviateError typed error model.
// constructEvent / WebhookSignatureError / CurviateEvent are
// covered in webhooks.constructEvent.test.ts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CurviateError,
  isCurviateError,
  ERROR_CODES,
  KNOWN_ERROR_CODES,
  REQUIRED_TIERS,
  KNOWN_REQUIRED_TIERS,
  type ErrorCode,
  type RequiredTier,
} from "../src/errors.js";

describe("CurviateError", () => {
  // instanceof Error and CurviateError; code is carried.
  it("is an instance of both Error and CurviateError and carries its code", () => {
    const e = new CurviateError({
      code: "UNAUTHORIZED",
      message: "x",
      httpStatus: 401,
      userFixable: false,
      retryLikelyToSucceed: false,
    });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(CurviateError);
    expect(e.code).toBe("UNAUTHORIZED");
    expect(e.httpStatus).toBe(401);
    expect(e.name).toBe("CurviateError");
  });

  // full field surface.
  it("exposes the documented field surface", () => {
    const e = new CurviateError({
      code: "TIER_NOT_ACTIVE",
      message: "needs sales nav",
      httpStatus: 403,
      userFixable: true,
      retryLikelyToSucceed: false,
      requiredTier: "sales_nav",
      retryHint: { kind: "never" },
    });
    expect(e.userFixable).toBe(true);
    expect(e.retryLikelyToSucceed).toBe(false);
    expect(e.requiredTier).toBe("sales_nav");
    expect(e.retryHint).toEqual({ kind: "never" });
  });

  // network errors map to INTERNAL with no httpStatus.
  it("supports a network-error shape (INTERNAL, undefined httpStatus)", () => {
    const e = new CurviateError({
      code: "INTERNAL",
      message: "Network error",
      userFixable: false,
      retryLikelyToSucceed: true,
    });
    expect(e.code).toBe("INTERNAL");
    expect(e.httpStatus).toBeUndefined();
    expect(e.retryHint).toBeNull();
  });

  // the credential never appears in the serialized error, and neither does the literal "Bearer".
  it("never serializes the apiKey or the Bearer scheme", () => {
    const apiKey = "my_secret_api_key";
    // Construct an error the way the transport would on a 401, with a message
    // derived from the response body only — never from the auth header.
    const e = new CurviateError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key.",
      httpStatus: 401,
      userFixable: false,
      retryLikelyToSucceed: false,
    });
    const serialized = JSON.stringify(e);
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("Bearer");
    // And the structured fields a caller relies on survive serialization.
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(parsed["code"]).toBe("UNAUTHORIZED");
    expect(parsed["message"]).toBe("Invalid or missing API key.");
    expect(parsed["httpStatus"]).toBe(401);
  });

  // even if a caller were to stuff the key into the message (which the
  // transport never does), toJSON must not widen the surface to include an
  // apiKey/authorization field. We assert the shape has no such key.
  it("toJSON exposes no credential-bearing field", () => {
    const e = new CurviateError({
      code: "INTERNAL",
      message: "boom",
      userFixable: false,
      retryLikelyToSucceed: true,
    });
    const json = e.toJSON();
    expect(Object.keys(json)).not.toContain("apiKey");
    expect(Object.keys(json)).not.toContain("authorization");
    expect(Object.keys(json)).not.toContain("headers");
  });
});

describe("isCurviateError", () => {
  it("returns true for a CurviateError", () => {
    const e = new CurviateError({
      code: "INTERNAL",
      message: "x",
      userFixable: false,
      retryLikelyToSucceed: true,
    });
    expect(isCurviateError(e)).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isCurviateError(new Error("plain"))).toBe(false);
  });

  it("returns false for null and non-objects", () => {
    expect(isCurviateError(null)).toBe(false);
    expect(isCurviateError(undefined)).toBe(false);
    expect(isCurviateError("UNAUTHORIZED")).toBe(false);
    expect(isCurviateError({ code: "UNAUTHORIZED" })).toBe(false);
  });
});

describe("ErrorCode union", () => {
  // Every code in the taxonomy is a valid ErrorCode a CurviateError can carry,
  // and internal-only codes are excluded from the public union. Iterating
  // ERROR_CODES (rather than a hand-copied list) means this test can never
  // drift from the actual taxonomy.
  it("carries every taxonomy code and excludes internal codes", () => {
    for (const code of ERROR_CODES) {
      expect(new CurviateError({
        code,
        message: "x",
        userFixable: false,
        retryLikelyToSucceed: false,
      }).code).toBe(code);
    }

    // @ts-expect-error — internal-only code is excluded from the public union.
    const banned1: ErrorCode = "BANNED_ENV_PREFIX";
    // @ts-expect-error — internal-only code is excluded from the public union.
    const banned2: ErrorCode = "ADMIN_BYPASS";
    // @ts-expect-error — fabricated code is not in the union.
    const banned3: ErrorCode = "BANISHED_CODE";
    void banned1;
    void banned2;
    void banned3;
  });

  // The connect-request conflict code is part of the public taxonomy — a caller
  // can narrow on it in an exhaustive switch.
  it("includes CONNECTION_REQUEST_CONFLICT in the taxonomy", () => {
    expect(ERROR_CODES).toContain("CONNECTION_REQUEST_CONFLICT");
  });
});

describe("error-code single source of truth", () => {
  // The runtime membership set and the ErrorCode type are BOTH derived from
  // ERROR_CODES, so a code can never be recognized by the type but not the
  // runtime decoder (the drift that downgraded CONNECTION_REQUEST_CONFLICT to
  // INTERNAL). These assertions lock that derivation in place.
  it("KNOWN_ERROR_CODES contains exactly the ERROR_CODES entries", () => {
    expect(new Set(KNOWN_ERROR_CODES)).toEqual(new Set(ERROR_CODES));
  });

  it("has no duplicate entries in ERROR_CODES", () => {
    expect(KNOWN_ERROR_CODES.size).toBe(ERROR_CODES.length);
  });

  it("recognizes every taxonomy code at runtime", () => {
    for (const code of ERROR_CODES) {
      expect(KNOWN_ERROR_CODES.has(code)).toBe(true);
    }
  });
});

describe("fixture-documented codes (guard)", () => {
  // Extraction rule: the served OpenAPI's non-2xx responses commonly carry a
  // generic, auto-populated example (key "error") whose `code` describes the
  // HTTP status itself (e.g. "UNPROCESSABLE" for 422, "INTERNAL_ERROR" for
  // 500) rather than a real business error code. This is proven, not assumed:
  // (1) that exact placeholder text gets replaced verbatim once an endpoint's
  // error docs are authored for real — observed directly in this release,
  // where the `following` op's 422 dropped "UNPROCESSABLE" for
  // ACCOUNT_RESTRICTED / LINKEDIN_OPERATION_NOT_SUPPORTED once its docs were
  // written; and (2) the same generic string recurs byte-for-byte across
  // dozens of response descriptions describing unrelated scenarios — 500's
  // generic example alone flips between two different made-up strings,
  // "INTERNAL_ERROR" and "UNEXPECTED_ERROR", for the identical description
  // "Internal server error.". A code counts as genuinely documented only when
  // the response's OWN description names that exact code verbatim — the same
  // "CODE — explanation" convention used for every deliberately-authored
  // error in this spec (ACCOUNT_RESTRICTED, LINKEDIN_OPERATION_NOT_SUPPORTED,
  // RATE_LIMITED on the Recruiter / Sales Navigator surface, etc.). This
  // self-reference check is what separates signal from boilerplate without a
  // hand-maintained exclusion list.
  //
  // SECOND ARM (#30). The rule above needs the response to carry an example
  // whose `code` is the real one, and a genuinely-authored error can be
  // documented against the generic placeholder example instead: `NOT_STORED`
  // is named verbatim in the description of three 422s whose only example is
  // the auto-populated "UNPROCESSABLE", so the arm above could not see it and
  // it shipped in 0.25.0 decoding to INTERNAL — the exact gap this guard
  // exists to close. So a code is also counted when the description names it
  // in the `(CODE)` form every authored error in this document uses. That
  // parenthesised-and-alone shape is what keeps the arm exclusion-list free:
  // PROMOTED_PLUS, the only other SCREAMING_CASE token anywhere in these
  // descriptions, is only ever written bare or as `PROMOTED/PROMOTED_PLUS`.
  interface FixtureResponse {
    description?: string;
    content?: {
      "application/json"?: {
        examples?: Record<string, { value?: { code?: string } }>;
      };
    };
  }
  interface FixtureOperation {
    responses?: Record<string, FixtureResponse>;
  }
  interface FixtureDocument {
    paths?: Record<string, Record<string, FixtureOperation | undefined>>;
  }

  const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

  /** Deterministic, no-network extraction — see the rule above. */
  function extractFixtureErrorCodes(doc: FixtureDocument): Set<string> {
    const codes = new Set<string>();
    for (const methods of Object.values(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (!HTTP_METHODS.has(method)) continue;
        for (const [status, resp] of Object.entries(op?.responses ?? {})) {
          const statusNum = Number(status);
          if (!(statusNum >= 300 && statusNum < 600)) continue;
          const description = typeof resp.description === "string" ? resp.description : "";
          // Arm 2: `(CODE)` in the description. Runs BEFORE the examples guard
          // below, because the responses this arm exists for are precisely the
          // ones whose examples carry nothing usable.
          for (const paren of description.match(/\([A-Z][A-Z0-9_]{3,}\)/g) ?? []) {
            codes.add(paren.slice(1, -1));
          }
          const examples = resp.content?.["application/json"]?.examples;
          if (!examples) continue;
          for (const ex of Object.values(examples)) {
            const code = ex.value?.code;
            if (typeof code === "string" && description.includes(code)) {
              codes.add(code);
            }
          }
        }
      }
    }
    return codes;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const FIXTURE_PATH = resolve(__dirname, "../fixtures/openapi.json");
  const fixtureDoc = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as FixtureDocument;
  const fixtureCodes = extractFixtureErrorCodes(fixtureDoc);
  const knownCodes = new Set<string>(ERROR_CODES);

  // Sanity check the extractor itself is live — not vacuously passing because
  // a path or shape typo silently made it match nothing.
  it("finds a non-trivial, known-real set in the current fixture", () => {
    expect(fixtureCodes.size).toBeGreaterThan(5);
    expect(fixtureCodes.has("ACCOUNT_RESTRICTED")).toBe(true);
    expect(fixtureCodes.has("LINKEDIN_OPERATION_NOT_SUPPORTED")).toBe(true);
  });

  // Same-path positive control for arm 2, and the discrimination it rests on.
  // The first response is shaped exactly like the three real 422s the arm was
  // added for: the code lives only in the description, the example is the
  // generic placeholder. So this MUST produce it; if it ever stops, the arm has
  // gone quiet and the superset assertion below is vacuous for that whole
  // class. The same description carries the false positive it must not fire on.
  it("harvests a code named only in the description, and not bare SCREAMING_CASE prose", () => {
    const harvested = extractFixtureErrorCodes({
      paths: {
        "/v1/probe": {
          get: {
            responses: {
              "422": {
                description:
                  "Nothing is stored and `mode=cache_only` never fetches (SENTINEL_CODE). " +
                  "Publishing spends money when mode is PROMOTED/PROMOTED_PLUS.",
                content: { "application/json": { examples: { error: { value: { code: "UNPROCESSABLE" } } } } },
              },
            },
          },
        },
      },
    });
    expect([...harvested]).toEqual(["SENTINEL_CODE"]);
  });

  // The actual guard: every code the public API reference documents (per the
  // extraction rule above) must be in the SDK's taxonomy. A future server
  // change that reaches the public docs with a new code fails this test until
  // ERROR_CODES learns it — the same class of gap that silently downgraded
  // CONNECTION_REQUEST_CONFLICT (and, this release, RATE_LIMITED) to INTERNAL.
  it("ERROR_CODES is a superset of every fixture-documented code", () => {
    const missing = [...fixtureCodes].filter((c) => !knownCodes.has(c)).sort();
    expect(missing).toEqual([]);
  });
});

describe("RequiredTier single source of truth", () => {
  // Mirrors the ERROR_CODES / KNOWN_ERROR_CODES pattern: KNOWN_REQUIRED_TIERS
  // and RequiredTier are both derived from REQUIRED_TIERS, so the type a
  // caller narrows on and the set the transport validates a wire value
  // against can never drift apart.
  it("KNOWN_REQUIRED_TIERS contains exactly the REQUIRED_TIERS entries", () => {
    expect(new Set(KNOWN_REQUIRED_TIERS)).toEqual(new Set(REQUIRED_TIERS));
  });

  it("has no duplicate entries in REQUIRED_TIERS", () => {
    expect(KNOWN_REQUIRED_TIERS.size).toBe(REQUIRED_TIERS.length);
  });

  it("recognizes every tier at runtime", () => {
    for (const tier of REQUIRED_TIERS) {
      expect(KNOWN_REQUIRED_TIERS.has(tier)).toBe(true);
    }
  });
});

// Compile-time lock: the ErrorCode type and the ERROR_CODES element type must
// stay identical. The tuple wrappers defeat union distribution so this is a
// strict equality — if a future change decouples the type from the array (e.g.
// by reverting to a hand-listed union), this stops type-checking.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _errorCodeMatchesArray: Same<ErrorCode, (typeof ERROR_CODES)[number]> = true;
void _errorCodeMatchesArray;

// Same lock for RequiredTier / REQUIRED_TIERS.
const _requiredTierMatchesArray: Same<RequiredTier, (typeof REQUIRED_TIERS)[number]> = true;
void _requiredTierMatchesArray;
