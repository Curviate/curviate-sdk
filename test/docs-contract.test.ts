/**
 * Doc claims a consumer programs against, asserted mechanically.
 *
 * The README and the public JSDoc are not decoration: an agent builder reads
 * them and writes code to what they say. Two claim families have now been wrong
 * in shipped releases, and neither could go red anywhere, because prose is the
 * one representation of the contract that nothing checked.
 *
 * 1. Retry de-duplication. The README told callers the delivered
 *    `event.id` was a key they could de-duplicate retries on. The dispatch
 *    worker mints a fresh `wdl_` id per delivery ATTEMPT, so a retried delivery
 *    arrives with a different id and a consumer following the README stored the
 *    same logical event twice, double-processing exactly the retries the
 *    guidance claimed to cover. The stable key is the payload composite
 *    (`event` + `data.account_id` + `data.occurred_at`).
 *
 * 2. Catalogue sizes. "27 events", "24 canonical events", "22 more
 *    event types", "34 error codes" were each hand-typed into a doc comment and
 *    each went stale on the next change to the thing they counted. A size a
 *    human types is wrong the moment the set grows; the served OpenAPI
 *    description counts itself, and the union is pinned to the generated enum,
 *    so nothing in hand-authored text needs to carry a number at all.
 *
 * These assertions read the shipped files from disk rather than importing, so
 * they cover the exact bytes that go in the tarball.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(resolve(pkgRoot, rel), "utf8");
}

/**
 * Flatten a passage to one line and drop the scaffolding a claim can hide
 * behind: JSDoc `*` gutters, markdown emphasis, and line wrapping. Without this
 * a guard reads "is\n * **not** a de-duplication key" as neither "not a
 * de-duplication key" nor anything else, and the wrong claim slips through by
 * being wrapped differently than the regex expected.
 *
 * Underscore is deliberately NOT stripped as emphasis: every identifier the
 * guards look for (`occurred_at`, `account_id`, `wdl_`) contains one, and
 * removing it silently made every match fail while the suite stayed green.
 */
function normalize(text: string): string {
  return text
    .replace(/\n\s*\*\s?/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ");
}

/** Every hand-authored `.ts` under src/, excluding the generated snapshot. */
function handAuthoredSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "generated") continue;
        walk(full);
        continue;
      }
      if (entry.name.endsWith(".ts")) out.push(relative(pkgRoot, full));
    }
  };
  walk(resolve(pkgRoot, "src"));
  return out.sort();
}

// ─── retry de-duplication guidance ───────────────────────────────────────────

/**
 * Customer-facing files that carry de-duplication guidance. CHANGELOG is in the
 * set because it shipped the same wrong claim in the 0.19.0 entry and is read
 * by upgraders, so correcting the README alone would have left the lie standing
 * in a second representation.
 */
const DEDUP_DOC_FILES = ["README.md", "CHANGELOG.md", "src/webhooks.ts"];

const DEDUP_TOKEN = /de-?duplicat\w*|\bdedup\w*/gi;
/** Ways the per-ATTEMPT delivery id is referred to in prose. */
const DELIVERY_ID_TOKEN = /wdl_|event\.id|`id`/i;
/** The one payload field that makes a key stable across attempts. */
const STABLE_KEY_TOKEN = /occurred_at/i;

/**
 * Scope is the enclosing passage, not a character window. In markdown that is
 * the section under a heading; in TypeScript it is the JSDoc block. A character
 * window was tried first and is wrong in both directions: too small to let a
 * doc explain the trap and then give the right answer, and too arbitrary to
 * mean anything. Both historical defects sat in a passage that named neither
 * the stable key nor the id's per-attempt nature, so passage scope catches them.
 */
function passages(file: string, text: string): string[] {
  if (file.endsWith(".md")) {
    // Split before each ATX heading, keeping the heading with its body.
    return text.split(/\n(?=#{1,6} )/);
  }
  // Every dedup claim in a .ts file lives in a JSDoc block; take those, plus the
  // rest of the file as one passage so a claim in a line comment is not missed.
  const blocks = text.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  return [...blocks, text.replace(/\/\*\*[\s\S]*?\*\//g, "")];
}

describe("retry de-duplication guidance names a key that survives a retry", () => {
  for (const file of DEDUP_DOC_FILES) {
    it(`${file} never offers the per-attempt delivery id as the de-duplication key`, () => {
      const text = read(file);
      const offenders: string[] = [];
      for (const raw of passages(file, text)) {
        const passage = normalize(raw);
        DEDUP_TOKEN.lastIndex = 0;
        if (!DEDUP_TOKEN.test(passage)) continue;
        if (!DELIVERY_ID_TOKEN.test(passage)) continue;
        // The invariant, kept deliberately narrow: a passage may discuss the
        // delivery id and de-duplication together only if it also names the key
        // that survives a retry. Demanding the passage ALSO state the negative
        // was tried and rejected: it is a style rule, not a correctness one, and
        // it fired on release notes that were already correct. The positive
        // statements have their own two assertions below.
        if (STABLE_KEY_TOKEN.test(passage)) continue;
        offenders.push(passage.replace(/\s+/g, " ").trim().slice(0, 300));
      }
      expect(
        offenders,
        `${file} discusses de-duplication alongside the delivery id without both ` +
          `naming the stable payload key (occurred_at) and saying the id is per ` +
          `attempt. A retried delivery carries a NEW wdl_ id, so guidance that ` +
          `omits either double-processes every retry.\n\n` +
          offenders.map((o) => `  ...${o}...`).join("\n\n"),
      ).toEqual([]);
    });
  }

  it("README states the composite key in full, so a consumer can implement it", () => {
    const readme = read("README.md");
    for (const part of ["event.event", "data.account_id", "data.occurred_at"]) {
      expect(readme, `README must name ${part} as part of the de-duplication key`).toContain(
        part,
      );
    }
  });

  it("README tells the reader outright not to key on the delivery id", () => {
    // The passage guard above enforces that the right key is named; it cannot
    // tell whether the wrong one is also still being offered next to it. This
    // is the explicit warning, so a reader who skims the section still sees it.
    expect(normalize(read("README.md"))).toMatch(/do not key on `?event\.id`?/i);
  });

  it("the envelope's own `id` JSDoc says a retry mints a new one", () => {
    // The doc comment immediately above `id?: string;` in CurviateEventEnvelope.
    // Deleting the wrong claim is only half the fix: the comment has to state
    // the fact, or the next reader assumes the id is stable because nothing
    // says otherwise.
    const src = read("src/webhooks.ts");
    const declAt = src.indexOf("  id?: string;");
    expect(declAt, "CurviateEventEnvelope.id declaration not found").toBeGreaterThan(0);
    const jsdoc = src.slice(src.lastIndexOf("/**", declAt), declAt);
    expect(jsdoc, "the `id` JSDoc must say a retry gets a new id").toMatch(
      /retry mints a new one|new one per attempt|not.*de-duplication key/is,
    );
  });
});

// ─── hand-typed catalogue sizes ──────────────────────────────────────────────

/**
 * A count claim: a bare integer that quantifies a noun naming a set whose size
 * changes, allowing up to four adjectives in between ("24 canonical,
 * create-subscribable Curviate webhook events"). Deliberately noun-anchored
 * rather than a list of the four literals that were wrong, so the next one is
 * caught in whatever wording it arrives in.
 *
 * Only word characters and separators may sit between the numeral and the noun,
 * which is what keeps `sendStatus(400); ... if (event.event ===` out: the `);`
 * and `}` of an example snippet break the run before the noun is reached.
 */
const COUNT_CLAIM =
  /\b(\d{1,3})\s+(?:[\w-]+[\s,]+){0,4}?(events?\b|event types?\b|error codes?\b)/gi;

describe("no hand-typed catalogue size in customer-facing text", () => {
  const files = ["README.md", ...handAuthoredSources()];

  for (const file of files) {
    it(`${file} carries no hardcoded event / error-code count`, () => {
      const text = normalize(read(file));
      const offenders: string[] = [];
      for (const match of text.matchAll(COUNT_CLAIM)) {
        offenders.push(match[0].replace(/\s+/g, " ").trim());
      }
      expect(
        offenders,
        `${file} hardcodes the size of a set that grows. The served OpenAPI ` +
          `description counts the catalogue itself and the union is pinned to the ` +
          `generated enum, so the number is both redundant and the thing that goes ` +
          `stale.\n\n` +
          offenders.map((o) => `  ...${o}...`).join("\n\n"),
      ).toEqual([]);
    });
  }
});

// ─── which reads accept the retrieval pair ───────────────────────────────────

/**
 * The README's "Retrieval modes" section tells a caller which reads take
 * `mode` / `max_age`, and warns that passing them anywhere else is a 400. That
 * is a claim programmed against in both directions, and it is exactly the
 * shape of claim this file exists for: prose naming a set the server owns and
 * grows. When the server declares the pair on a fourth read, the SDK method
 * for it needs a typed query argument and this section needs a fourth bullet;
 * nothing else in the suite would notice.
 *
 * So both sides are derived: the set from the vendored OpenAPI (the served
 * document, whatever it says today), the claim from the shipped README bytes.
 * Paths are matched rather than method names because a path is a fact both
 * documents can state; a hand-written path-to-method map would be one more
 * thing to go stale.
 */
describe("README names exactly the reads that accept mode / max_age", () => {
  interface FixtureParameter {
    name?: string;
    in?: string;
  }
  /** A path item: the operations, plus the parameters shared by all of them. */
  interface FixturePathItem {
    parameters?: FixtureParameter[];
    get?: { parameters?: FixtureParameter[] };
  }
  interface FixtureDoc {
    paths?: Record<string, FixturePathItem>;
  }

  /**
   * GET paths whose served query declares EITHER retrieval parameter.
   *
   * EITHER, not both, and path-item parameters as well as the operation's own:
   * every way this reader can under-count makes the guard go QUIET on a stale
   * README rather than loud, so it errs towards over-collecting. A path that
   * declared only `mode` is still a retrieval read the README owes a bullet.
   */
  function retrievalPaths(doc: FixtureDoc): string[] {
    const out: string[] = [];
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      if (!item.get) continue;
      const declared = [...(item.parameters ?? []), ...(item.get.parameters ?? [])]
        .filter((p) => p.in === "query" || p.in === undefined)
        .map((p) => p.name);
      if (declared.some((n) => n === "mode" || n === "max_age")) out.push(path);
    }
    return out.sort();
  }

  const doc = JSON.parse(read("fixtures/openapi.json")) as FixtureDoc;
  const served = retrievalPaths(doc);
  const section =
    passages("README.md", read("README.md")).find((p) => p.startsWith("## Retrieval modes")) ?? "";
  /**
   * The paths the section claims, EXACTLY as written. Matched whole rather
   * than by substring: `/chats/{chat_id}` is a prefix of
   * `/chats/{chat_id}/messages`, so a substring test reports the chat read as
   * documented on the strength of the messages bullet alone, and the missing
   * bullet this guard exists to catch reads as present.
   */
  const claimed = [...section.matchAll(/`GET (\/v1\/[^`]+)`/g)].map((m) => m[1]!);

  // TWO SIGNALS ON ONE ASSERTION, both wanted, so read a red carefully:
  //
  //   FEWER than the three → the reader has gone blind to a path. That is the
  //     dangerous direction: `unlisted` empties and the guard below passes on a
  //     README missing that bullet. Fix `retrievalPaths`.
  //   MORE than the three → the server declared the pair on a NEW read. Nothing
  //     is broken; this is the tripwire firing. Give the README its bullet, give
  //     the SDK method a query argument and a forwarding test, then add the path
  //     here.
  it("sees exactly the reads that declare the pair today, and reds either way", () => {
    expect(served).toEqual([
      "/v1/{account_id}/chats/{chat_id}",
      "/v1/{account_id}/chats/{chat_id}/messages",
      "/v1/{account_id}/users/{user_id}",
    ]);
  });

  // The one remaining way the reader could go quiet: a parameter arriving as a
  // `$ref` into `components/parameters` has no `name` here, so its path would
  // never enter `served` and the pin above would stay green on a stale README.
  // The served document inlines every parameter today; this fails the moment
  // that stops being true, which is the moment `retrievalPaths` needs to
  // resolve refs.
  it("meets no parameter shape it cannot read", () => {
    const refs = Object.entries(doc.paths ?? {})
      .filter(([, item]) =>
        [...(item.parameters ?? []), ...(item.get?.parameters ?? [])].some(
          (p) => p.name === undefined,
        ),
      )
      .map(([path]) => path);
    expect(refs, "these GETs carry a parameter with no inline `name` (a $ref?)").toEqual([]);
  });

  it("the section exists and names every served retrieval read", () => {
    expect(section, "README has no '## Retrieval modes' section").not.toBe("");
    const unlisted = served.filter((p) => !claimed.includes(p));
    expect(
      unlisted,
      "these reads accept mode / max_age in the served document but the README " +
        "does not name them, so a caller cannot know the ladder is available " +
        "there. This block checks the README against the document and nothing " +
        "else: when you add the bullet, check by hand that the SDK method takes " +
        "a query argument and add a forwarding test for it, the way getChat, " +
        "listMessages and users.get each have one",
    ).toEqual([]);
  });

  it("names no read that does not accept them", () => {
    expect(claimed.length).toBeGreaterThan(0);
    const overclaimed = claimed.filter((p) => !served.includes(p));
    expect(
      overclaimed,
      "the README offers mode / max_age on reads that do not declare them; the " +
        "API answers 400 for an undeclared query parameter, so this is not a " +
        "harmless extra",
    ).toEqual([]);
  });
});
