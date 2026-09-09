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
  type ErrorCode,
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
      code: "NO_ACTIVE_SEAT",
      message: "no active seat covers this account",
      httpStatus: 403,
      userFixable: true,
      retryLikelyToSucceed: false,
      retryHint: { kind: "never" },
    });
    expect(e.userFixable).toBe(true);
    expect(e.retryLikelyToSucceed).toBe(false);
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

    // Still excluded: the boot-time environment refusal answers no request, so
    // no caller can receive it.
    // @ts-expect-error — internal-only code is excluded from the public union.
    const banned1: ErrorCode = "BANNED_ENV_PREFIX";
    // @ts-expect-error — fabricated code is not in the union.
    const banned2: ErrorCode = "BANISHED_CODE";
    void banned1;
    void banned2;

    // NO LONGER excluded, and the reversal is the point: `ADMIN_BYPASS` is
    // constructed at nine sites inside the versioned billing endpoints, so an
    // admin workspace really does receive it and it used to arrive as
    // `INTERNAL`. It was previously asserted here as unassignable, on the
    // strength of a comment in the source that called it unreachable. This is
    // a plain assignment rather than a `@ts-expect-error`, so if it is ever
    // dropped from the union again the compiler says so.
    const admin: ErrorCode = "ADMIN_BYPASS";
    expect(admin).toBe("ADMIN_BYPASS");
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
  // LINKEDIN_SESSION_EVICTED, etc.). This
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
  // in the `(CODE)` form every authored error in this document uses.
  //
  // WHAT THE ARM ACTUALLY RESTS ON, measured rather than assumed: the token
  // must fill the parentheses ALONE. These descriptions carry plenty of other
  // capitalised tokens (APPLICANTS, CAPTCHA, FREE, PIPELINE, POST, PROMOTED,
  // PROMOTED_PLUS), and the two nearest misses in the current document,
  // `(PIPELINE, APPLICANTS)` and `(FREE, PROMOTED or PROMOTED_PLUS)`, are
  // excluded by the comma alone. So the discrimination is thinner than
  // "only error codes are written this way".
  //
  // ponytail: a bare `(CAPTCHA)`-style parenthetical, or a cross-reference to a
  // deliberately-excluded internal code, would be harvested and would red the
  // superset assertion against a change that is fine. That failure is LOUD and
  // one line from a fix, which is why it is accepted over a hand-maintained
  // exclusion list; if it ever fires on a non-code, gate the arm on the
  // response also carrying no usable example rather than widening the taxonomy.
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
                  "Publishing spends money when mode is PROMOTED/PROMOTED_PLUS. " +
                  "Filter by stage (PIPELINE, APPLICANTS).",
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
  // CONNECTION_REQUEST_CONFLICT to INTERNAL.
  it("ERROR_CODES is a superset of every fixture-documented code", () => {
    const missing = [...fixtureCodes].filter((c) => !knownCodes.has(c)).sort();
    expect(
      missing,
      "the public API reference documents these codes and the SDK taxonomy does " +
        "not carry them, so they decode to INTERNAL. Add them to ERROR_CODES — " +
        "unless one is not a returned code at all (an internal-only code named in " +
        "a cross-reference, or prose the description arm mis-read), in which case " +
        "tighten the arm. Never widen the public taxonomy to silence this.",
    ).toEqual([]);
  });
});

describe("entitlement taxonomy after the tier retirement", () => {
  // The existing "fixture-documented codes (guard)" block above checks ONE
  // direction: document -> SDK, so a code the API documents and the SDK lacks
  // reds. It is a SUPERSET assertion, which by construction cannot see the
  // other direction: a code the SDK still exports after the API stopped
  // returning it stays green there forever, and a caller keeps a `case` arm
  // for a refusal that can no longer arrive. That is exactly what the tier
  // retirement produced, so this block asserts the retired direction.
  //
  // Scope is deliberately the ENTITLEMENT FAMILY, not the whole taxonomy. A
  // full SDK -> document equality would be wrong: the SDK carries codes the
  // served document never documents (transport-minted `INTERNAL`, and codes
  // whose only 403/409 response is described in prose), so equality over the
  // whole union would fail on correct code. Over this family the two sides
  // really are meant to agree, and the family is small enough to name.

  /**
   * Retired by the tier retirement and NOT yet withdrawn from the union: a
   * deployment predating the rollout still emits them. Step one of a two-step
   * retirement, so they are exported and marked `@deprecated`.
   */
  const RETIRED = ["TIER_NOT_ACTIVE", "PREMIUM_CONFLICT"] as const;
  /** The three live 403 entitlement refusals. */
  const LIVE = ["NO_ACTIVE_SEAT", "LINKEDIN_FEATURE_NOT_SUBSCRIBED", "BETA_NOT_ENABLED"] as const;

  const exported: ReadonlySet<string> = new Set(ERROR_CODES);

  it("exports all three live entitlement codes", () => {
    expect(LIVE.filter((c) => !exported.has(c))).toEqual([]);
  });

  /**
   * The comment region belonging to one array entry: everything between the
   * PREVIOUS entry and this one, with JSDoc gutters flattened.
   *
   * Bounded on purpose. A plain `lastIndexOf("/**")` walks past a `//`-commented
   * entry all the way to the file header, so a positive control asking "does
   * this current code carry @deprecated" read the whole file and answered yes.
   * Flattening the gutters matters for the same class of reason: a sentence
   * wrapped across two ` * ` lines matches no regex written for one line.
   */
  function commentFor(src: string, code: string): string {
    const at = src.indexOf(`"${code}",`);
    if (at < 0) return "";
    const prev = src.lastIndexOf('",\n', at - 1);
    const region = src.slice(prev < 0 ? 0 : prev + 3, at);
    return region.replace(/\n\s*\*\s?/g, " ").replace(/\s+/g, " ");
  }

  it("still exports both retired codes, because older deployments emit them", () => {
    // NOT an oversight, and this case used to assert the opposite. A client is
    // pointed at a DEPLOYMENT, not at a changelog: an API that has not taken
    // the seat-based entitlement rollout yet still answers `TIER_NOT_ACTIVE`,
    // and a union that dropped the code would decode it to `INTERNAL` there, so
    // a fixable billing refusal would arrive as a server fault on exactly the
    // deployments most likely to send it. Carrying a dead code is the cheaper
    // error, so the retirement is two steps and this is step one.
    expect(RETIRED.filter((c) => !exported.has(c))).toEqual([]);
  });

  it("marks both as @deprecated, next to the code itself", () => {
    // Exporting them without the marker is the failure mode this guards: the
    // union would read as though both were current, and the two-step
    // retirement would quietly become a permanent carry. Read from the shipped
    // source so the marker is in the bytes a consumer's editor sees.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/errors.ts"),
      "utf8",
    );
    for (const code of RETIRED) {
      const comment = commentFor(src, code);
      expect(comment.length, `${code} has no comment region`).toBeGreaterThan(40);
      expect(comment, `${code} must carry @deprecated`).toContain("@deprecated");
      // And a stated removal trigger, so step two is not left to memory.
      expect(comment, `${code} must say when it goes`).toContain(
        "first release after",
      );
    }
    // The replacement has to be named for the code that HAS one.
    expect(commentFor(src, "TIER_NOT_ACTIVE")).toContain("NO_ACTIVE_SEAT");
  });

  it("POSITIVE CONTROL: a current code carries no deprecation marker", () => {
    // Otherwise "both are deprecated" could pass on a file where every entry
    // is, or on a reader that returns the whole file for any lookup.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/errors.ts"),
      "utf8",
    );
    // The reader finds a real comment region for this code, and it is not a
    // deprecation. Both halves matter: an empty region would satisfy the
    // absence claim on its own.
    const comment = commentFor(src, "NO_ACTIVE_SEAT");
    expect(comment.length).toBeGreaterThan(40);
    expect(comment).toContain("Curviate tenant has no active paid seat");
    expect(comment).not.toContain("@deprecated");
  });

  // POSITIVE CONTROL for the two assertions above. Both are absence claims
  // against the same membership probe, and a probe that answers "absent" for
  // everything satisfies them trivially — a typo'd import, an `exported` set
  // built from the wrong array, an ERROR_CODES that parsed to []. This runs
  // the SAME probe over a code that is unambiguously present and demands a
  // hit, so "not found" above means absent rather than blind.
  it("the same membership probe finds a code that IS present", () => {
    expect(exported.has("UNAUTHORIZED")).toBe(true);
    expect(exported.size).toBeGreaterThan(20);
  });

  // ── the served-document side of the same three codes ──────────────────────
  //
  // Read as raw bytes rather than through the parsed structure on purpose: a
  // retired code can survive anywhere in the document (an example value, a
  // hand-authored 403 description, an enum), and the claim is that it survives
  // NOWHERE. A structural walk would need to know every place to look.
  const documentBytes = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/openapi.json"),
    "utf8",
  );

  it("the served document names NO_ACTIVE_SEAT", () => {
    // Positive control for the two document assertions below, which are both
    // absence claims over these same bytes: if the fixture were empty,
    // truncated, or read from the wrong path, every "absent" claim would pass
    // and this one would fail.
    expect(documentBytes).toContain("NO_ACTIVE_SEAT");
  });

  it("the served document names neither retired code", () => {
    expect(
      RETIRED.filter((c) => documentBytes.includes(c)),
      "the deployed OpenAPI document still names a retired code. Either the " +
        "fixture predates the deploy that retired it (refresh it with " +
        "`pnpm gen:fixture` against the deployed base URL) or the server did " +
        "not finish its own sweep.",
    ).toEqual([]);
  });

  // TRIPWIRE, not an invariant. `BETA_NOT_ENABLED` is absent from the served
  // document BY DESIGN today: the beta BADGE is live on 39 operations, but the
  // beta GATE is still empty, and only a gated operation's 403 description
  // names the code. So the SDK exports a code the document does not mention,
  // which is correct and is the one place the two sides legitimately disagree.
  //
  // A RED HERE IS NOT A BUG — it means the gate has opened and the document
  // now documents the refusal. When that happens: refresh the fixture, confirm
  // the code the document names matches the one exported here, and delete this
  // test (the superset guard above then covers it for free).
  it("does not yet document BETA_NOT_ENABLED, because the gate is still empty", () => {
    expect(
      documentBytes.includes("BETA_NOT_ENABLED"),
      "the deployed document now names BETA_NOT_ENABLED, so at least one " +
        "operation is beta-GATED rather than merely beta-badged. Nothing is " +
        "broken: re-read the note above this assertion and retire it.",
    ).toBe(false);
  });
});

// Compile-time lock: the ErrorCode type and the ERROR_CODES element type must
// stay identical. The tuple wrappers defeat union distribution so this is a
// strict equality — if a future change decouples the type from the array (e.g.
// by reverting to a hand-listed union), this stops type-checking.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _errorCodeMatchesArray: Same<ErrorCode, (typeof ERROR_CODES)[number]> = true;
void _errorCodeMatchesArray;
