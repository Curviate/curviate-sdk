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
