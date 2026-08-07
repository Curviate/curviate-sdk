// check:copy — copy-quality guard for the prose a consumer actually reads.
//
// npm renders README.md and CHANGELOG.md on the package page, and the JSDoc in
// src/ ships inside dist/index.d.ts, where it surfaces on hover in the
// consumer's editor. That prose is the first impression the package makes, so
// it gets a gate the same way the internal-reference leak scan does.
//
// TWO TIERS, and the split is deliberate.
//
//   BLOCKING — non-ASCII typographic characters (em/en dash, curly quotes, the
//   ellipsis glyph, non-breaking and zero-width spaces, arrows, math symbols).
//   Every one is mechanically decidable, has an exact ASCII equivalent, and is
//   not something a human typing in an editor produces. A run over clean
//   sources reports zero, so this tier cannot cry wolf.
//
//   WARNING — the LLM vocabulary register ("leverage", "seamless", "robust",
//   "comprehensive", "unlock", "streamline", ...) and emoji. The register words
//   have legitimate technical uses: an account really can be unlocked, a parser
//   really can be robust. Emoji can be the subject matter rather than
//   decoration; the sibling CLI documents its emoji-reaction argument with a
//   literal emoji, which is the clearest possible help text for it. Blocking on
//   either would red a release that is fine, and a gate that reds on a fine
//   release is a gate people learn to bypass — at which point the typographic
//   tier stops being enforced too. So these are reported and the run still
//   exits 0. A human decides.
//
// Exclusions and why:
//   src/generated/  — a machine-generated mirror of the served API contract.
//                     Its punctuation comes from upstream descriptions; editing
//                     it here would desync the mirror and hide the real defect,
//                     which belongs upstream where the document is authored.
//   scripts/       — build tooling. Its comments and its own console output are
//                     read by maintainers, not by consumers, and CLAUDE.md's
//                     no-em-dash rule exempts internal comments. Scanning it
//                     would red every release over prose nobody buys on.
//   node_modules/, dist/, fixtures/, test/, coverage/ — not authored copy.
//
// Usage:  node scripts/check-copy.mjs [--verbose]
// Exits non-zero when a blocking tell is found, and prints every offending
// file:line. Chained into prepack so no publish can skip it.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const verbose = process.argv.includes("--verbose");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "fixtures",
  "test",
  "scripts",
  "src/generated",
]);
const SCAN_EXTS = new Set([".ts", ".mjs", ".js", ".md", ".json"]);

/**
 * Blocking tier. Each entry names a non-ASCII typographic character with a
 * plain-ASCII replacement, so a hit is always actionable and never a judgment
 * call.
 * @type {Array<{ label: string; pattern: RegExp; fix: string }>}
 */
export const TYPOGRAPHIC = [
  { label: "em dash (U+2014)", pattern: /—/g, fix: "a comma, semicolon, colon, or period" },
  { label: "en dash (U+2013)", pattern: /–/g, fix: "a hyphen in a range, otherwise a comma" },
  { label: "horizontal bar (U+2015)", pattern: /―/g, fix: "a comma or period" },
  { label: "curly single quote (U+2018/U+2019)", pattern: /[‘’]/g, fix: "'" },
  { label: "curly double quote (U+201C/U+201D)", pattern: /[“”]/g, fix: '"' },
  { label: "ellipsis glyph (U+2026)", pattern: /…/g, fix: "..." },
  { label: "non-breaking or exotic space", pattern: /[\u00A0\u2007\u2008\u2009\u202F\u205F\u3000]/g, fix: "a normal space" },
  { label: "zero-width or invisible character", pattern: /[\u200B-\u200D\u2060\uFEFF\u00AD]/g, fix: "delete it" },
  { label: "arrow (U+2190-U+21FF)", pattern: /[←-⇿]/g, fix: "-> or <-" },
  { label: "minus sign (U+2212)", pattern: /−/g, fix: "-" },
  { label: "multiplication sign (U+00D7)", pattern: /×/g, fix: "x" },
  { label: "inequality glyph (U+2264/U+2265)", pattern: /[≤≥]/g, fix: "<= or >=" },
  { label: "prime (U+2032/U+2033)", pattern: /[′″]/g, fix: "' or \"" },
  { label: "decorative check or cross glyph", pattern: /[✓✗✅❌]/g, fix: "plain text" },
];

/**
 * Warning tier: the LLM vocabulary and structural register. Reported, never
 * blocking, because each of these has a legitimate technical use.
 * @type {Array<{ label: string; pattern: RegExp }>}
 */
export const REGISTER = [
  // (c), (R) and (TM) are legal marks, not decoration, so they are excluded.
  { label: "emoji (decorative emoji reads as generated; an emoji-valued example does not)", pattern: /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/gu },
  { label: "delve", pattern: /\bdelv(e|es|ing|ed)\b/gi },
  { label: "leverage (as a verb)", pattern: /\bleverag(e|es|ing|ed)\b/gi },
  { label: "seamless", pattern: /\bseamless(ly)?\b/gi },
  { label: "robust", pattern: /\brobust(ly|ness)?\b/gi },
  { label: "comprehensive", pattern: /\bcomprehensive(ly)?\b/gi },
  { label: "elevate", pattern: /\belevat(e|es|ing|ed)\b/gi },
  { label: "empower", pattern: /\bempower(s|ing|ed|ment)?\b/gi },
  { label: "unlock", pattern: /\bunlock(s|ing|ed)?\b/gi },
  { label: "streamline", pattern: /\bstreamlin(e|es|ing|ed)\b/gi },
  { label: "cutting-edge", pattern: /\bcutting[- ]edge\b/gi },
  { label: "game-changing", pattern: /\bgame[- ]chang(er|ing)\b/gi },
  { label: "state-of-the-art / best-in-class / world-class", pattern: /\b(state[- ]of[- ]the[- ]art|best[- ]in[- ]class|world[- ]class)\b/gi },
  { label: "revolutionize / supercharge", pattern: /\b(revolutioni[sz]|supercharg)\w*/gi },
  { label: "effortless / powerful / intuitive", pattern: /\b(effortless(ly)?|powerful|intuitive(ly)?)\b/gi },
  { label: "holistic / synergy / paradigm / tapestry", pattern: /\b(holistic\w*|synerg\w+|paradigm|tapestry)\b/gi },
  { label: "plethora / myriad", pattern: /\b(plethora|myriad)\b/gi },
  { label: "utilize (prefer 'use')", pattern: /\butiliz(e|es|ing|ed|ation)\b/gi },
  { label: "facilitate / foster", pattern: /\b(facilitat(e|es|ing|ed)|foster(s|ing|ed)?)\b/gi },
  { label: "it's worth noting", pattern: /\b(it'?s|its) worth noting\b/gi },
  { label: "in today's ...", pattern: /\bin today'?s\b/gi },
  { label: "dive in / deep dive", pattern: /\b(dive in|deep dive|let'?s dive)\b/gi },
  { label: "realm of / landscape of / testament to", pattern: /\b(realm of|landscape of|testament to)\b/gi },
  { label: "\"not just X, it's Y\"", pattern: /\bnot (just|only) [^.\n]{1,60}\b(but|it'?s)\b/gi },
  { label: "whether you're ...", pattern: /\bwhether you'?re\b/gi },
  { label: "a wide range / variety of", pattern: /\b(a )?wide (range|variety) of\b/gi },
  { label: "paragraph opening with a connective", pattern: /(^|\n)\s*(Moreover|Furthermore|Additionally|In conclusion|Notably)\b/g },
];

/**
 * Recursively collect scannable files under `dir`, skipping SKIP_DIRS.
 * @param {string} dir absolute path
 * @returns {Promise<string[]>} absolute file paths
 */
export async function collectFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(pkgRoot, abs);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel)) continue;
      results.push(...(await collectFiles(abs)));
    } else if (entry.isFile() && SCAN_EXTS.has(extname(entry.name))) {
      results.push(abs);
    }
  }
  return results;
}

/**
 * Scan the package and report. Separated from the invocation below so the
 * pattern sets can be unit-tested without the script running as a side effect
 * of importing it. That separation is not theoretical: an editing pass over
 * this file once overwrote the emoji pattern with a copy of the zero-width one,
 * and the script still exited 0 over clean sources, which is exactly what a
 * silently-disabled pattern looks like.
 * @param {{ verbose?: boolean }} [opts]
 * @returns {Promise<number>} process exit code
 */
export async function run(opts = {}) {
  const files = await collectFiles(pkgRoot);
  if (files.length < 10) {
    console.error(
      `check:copy FAIL — only ${files.length} file(s) collected; the scan is not reaching the package.`,
    );
    return 1;
  }

  let blocking = 0;
  const warnings = new Map();

  for (const file of files) {
    const rel = relative(pkgRoot, file);
    // Belt and braces: scripts/ is already skipped, but this file names the
    // very characters it forbids, so never scan it even if that changes.
    if (rel === "scripts/check-copy.mjs") continue;

    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { label, pattern, fix } of TYPOGRAPHIC) {
        pattern.lastIndex = 0;
        if (!pattern.test(line)) continue;
        console.error(`TELL  ${rel}:${i + 1}  [${label}]  use ${fix}`);
        console.error(`      ${line.trim()}`);
        blocking++;
        break;
      }
      for (const { label, pattern } of REGISTER) {
        pattern.lastIndex = 0;
        if (!pattern.test(line)) continue;
        if (!warnings.has(label)) warnings.set(label, []);
        warnings.get(label).push(`${rel}:${i + 1}  ${line.trim()}`);
      }
    }
  }

  if (warnings.size > 0) {
    console.error(`\ncheck:copy WARN — wording worth a second look (not blocking):`);
    for (const [label, hits] of warnings) {
      console.error(`  ${label} (${hits.length})`);
      for (const hit of opts.verbose ? hits : hits.slice(0, 3)) console.error(`      ${hit}`);
      if (!opts.verbose && hits.length > 3) {
        console.error(`      ... ${hits.length - 3} more (run with --verbose)`);
      }
    }
    console.error(`  These all have legitimate uses, so they never fail the run. Read them and decide.`);
  }

  if (blocking > 0) {
    console.error(
      `\ncheck:copy FAIL — ${blocking} typographic tell(s). Every one has a plain-ASCII equivalent; replace them before publishing.`,
    );
    return 1;
  }

  console.error(`check:copy OK — no typographic tells across ${files.length} files of published copy.`);
  return 0;
}

// Only act when invoked as a script; importing this module must have no effect.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await run({ verbose }));
}
