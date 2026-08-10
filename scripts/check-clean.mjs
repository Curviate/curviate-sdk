// check:clean — anti-leak guard for the public repo.
//
// Greps the package for patterns that must never appear in a public repository:
//   - Internal spec/doc reference codes: FR-N, AC-N, NFR-N, TS-N, ADR-N
//   - Internal path prefixes: sdk/N, api/N, core/N, infra/N, mcp/N, cli/N
//   - Internal doc paths: docs/specs, docs/adr
//   - Bare section markers: §4, §key — a citation stripped down to its section
//   - Issue tracker refs: #NNN (3+ digit issue numbers)
//   - Internal policy labels: "Hard Rule" (case-insensitive)
//   - Internal codenames/paths: redarc, rdc_ (not rdc_live_), @curviate/shared, apps/server
//   - Substrate vendor name (assembled from fragments to avoid the literal appearing here)
//
// Scans both extensioned source files (see SCAN_EXTS) and a fixed allowlist
// of extensionless dotfiles (see SCAN_DOTFILES, e.g. .gitignore) — the latter
// exist because Node's path.extname() reports no extension for them
// (extname(".gitignore") === ""), so the extension-based filter alone would
// silently skip a leak sitting in a comment inside one of these files.
//
// Exits 0 when clean, non-zero and prints every offending line when not.
// Wire this as `pnpm check:clean` and invoke it from the prepack / verify:dist flow.
//
// --dist mode: `node scripts/check-clean.mjs --dist` scans ONLY the built dist/
// output (the default run excludes dist/ entirely) with the identical pattern
// set. Source-level reasoning does not protect the bundle: a leak can survive
// bundling, ride in from a dependency, or land in an emitted .d.ts that no
// source file contains. dist/ must already exist — the mode fails closed rather
// than reporting 0 hits over a directory that is not there. Chained into
// `prepack` AFTER tsup so no publish can skip it.
//
// ── What this file learned from #750 / #758 ──────────────────────────────────
// This scanner had drifted behind its CLI twin in three ways, all of the same
// shape: the INPUT SET or the MATCH SET silently lost members, and losing them
// looks exactly like passing.
//
//   1. The path-prefix pattern read (sdk|api|core|infra|mcp) — no `cli`, so a
//      `cli/004` citation was invisible.
//   2. The codename pattern was \b-anchored: `\b@curviate\/shared\b` cannot
//      match `"@curviate/shared"`, because a quote and an `@` are both
//      non-word characters and there is no word boundary between them. A real
//      internal package name in an import statement — the single most likely
//      way this leak actually occurs — sailed straight through. The CLI copy's
//      own comment documents this fix; this copy never received it.
//   3. There was no --dist mode at all, so `prepack` ran the scan BEFORE tsup
//      and the built output that npm actually publishes was never scanned once.
//
// Two structural guards are added so the next drift is loud rather than silent:
// the scan REFUSES on an empty file set (a scanner that read nothing reports
// clean, which is a false assurance, not a pass), and every verdict states how
// many files and lines it examined. Read that number before reading the result.
//
// src/generated/types.ts is no longer skipped. It is listed in this package's
// published `files` array, so it ships to npm; excluding a published file from
// the publish guard is the same hole one level down.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const distMode = process.argv.includes("--dist");
const scanRoot = distMode ? join(pkgRoot, "dist") : pkgRoot;
const modeLabel = distMode ? "--dist" : "source";

if (distMode) {
  let distStat;
  try {
    distStat = await stat(scanRoot);
  } catch {
    console.error(`check:clean --dist FAIL — dist/ not found at ${scanRoot}. Run \`pnpm build\` first.`);
    process.exit(1);
  }
  if (!distStat.isDirectory()) {
    console.error(`check:clean --dist FAIL — ${scanRoot} exists but is not a directory.`);
    process.exit(1);
  }
}

// Directories to skip entirely (relative to pkgRoot). dist/ is excluded from the
// SOURCE pass only; --dist scans it directly, rooted inside it.
const SKIP_DIRS = new Set(["node_modules", "dist"]);

// File extensions to scan. .cjs/.mts/.cts and .map are here for dist coverage:
// tsup currently emits esm + .d.ts only, but a format or sourcemap change must
// not silently drop the emitted artifact out of the scanned set.
const SCAN_EXTS = new Set([".ts", ".mts", ".cts", ".mjs", ".cjs", ".js", ".md", ".json", ".map"]);

// Extensionless dotfiles to scan explicitly, matched by exact basename
// (SCAN_EXTS can't catch these — see the module header comment).
const SCAN_DOTFILES = new Set([".gitignore", ".npmrc", ".nvmrc", ".env.example", ".editorconfig"]);

// The vendor name assembled from parts so the literal never appears in this file.
const vendorName = ["uni", "pi", "le"].join("");

/** @type {Array<{ label: string; pattern: RegExp }>} */
const PATTERNS = [
  {
    label: "internal spec/doc refs (FR-N, AC-N, NFR-N, TS-N, ADR-N)",
    // Matches: FR-001, AC-003, NFR-001, TS-005, ADR-033
    pattern: /\b(FR|AC|NFR|TS|ADR)-\d+/,
  },
  {
    label: "internal path prefixes (sdk/N, api/N, core/N, infra/N, mcp/N, cli/N)",
    // Matches: sdk/001, api/003, core/002, infra/006, mcp/007, cli/004
    pattern: /\b(sdk|api|core|infra|mcp|cli)\/\d+/,
  },
  {
    label: "internal doc paths (docs/specs, docs/adr)",
    pattern: /docs\/(specs|adr)\b/,
  },
  {
    label: "bare section marker (§4, §key)",
    // A citation whose doc reference has been edited away still points at an
    // internal document, and none of the patterns above can see it.
    pattern: /§\s*[A-Za-z0-9]/,
  },
  {
    label: "issue tracker refs (#NNN — 3+ digit numbers)",
    // Matches: #288, #123 — but not #12 (2-digit) or markdown list items like "# heading".
    pattern: /#\d{3,}/,
  },
  {
    label: "internal policy labels (Hard Rule)",
    pattern: /hard\s+rule/i,
  },
  {
    label: "internal codenames (redarc, @curviate/shared, apps/server)",
    // No \b anchors. \b fails to match @curviate/shared when it is preceded by
    // a non-word character — a quote in an import statement, which is exactly
    // how this token would actually leak. These three tokens are specific
    // enough that a false positive is implausible.
    pattern: /redarc|@curviate\/shared|apps\/server/,
  },
  {
    label: "internal key prefix (rdc_ — not a customer key format)",
    // rdc_live_ or rdc_test_ but never cvt_live_ which is the customer prefix.
    pattern: /\brdc_(?!live_)/,
  },
  {
    label: "substrate vendor name",
    pattern: new RegExp(vendorName, "i"),
  },
];

/**
 * Recursively collect files under `dir`, skipping SKIP_DIRS.
 * @param {string} dir absolute path
 * @returns {Promise<string[]>} absolute file paths
 */
async function collectFiles(dir) {
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
      // Skip directories in the exclusion set (check both the name and relative path).
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel)) continue;
      results.push(...(await collectFiles(abs)));
    } else if (
      entry.isFile() &&
      (SCAN_EXTS.has(extname(entry.name)) || SCAN_DOTFILES.has(entry.name))
    ) {
      results.push(abs);
    }
  }
  return results;
}

const files = await collectFiles(scanRoot);
let totalHits = 0;
let filesScanned = 0;
let linesScanned = 0;

for (const file of files) {
  const rel = relative(pkgRoot, file);
  // Skip this script itself (it deliberately contains pattern fragments).
  if (rel === "scripts/check-clean.mjs") continue;

  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    // A file that could not be READ is a member the input set lost. Say so
    // rather than dropping it: silence here is indistinguishable from clean.
    console.error(`UNREAD  ${rel}  — could not be read, so it was NOT scanned`);
    totalHits++;
    continue;
  }

  filesScanned++;
  const lines = content.split("\n");
  linesScanned += lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    for (const { label, pattern } of PATTERNS) {
      if (pattern.test(line)) {
        console.error(`LEAK  ${rel}:${i + 1}  [${label}]`);
        // A minified bundle or a sourcemap is one enormous line; print enough
        // to locate the hit, never the whole artifact.
        console.error(`      ${line.trim().slice(0, 200)}`);
        totalHits++;
        break; // one label per line is enough
      }
    }
  }
}

// A scanner that examined nothing and reported clean is a false assurance, not
// a pass — the exact shape that let a gitlink pointer stand in for a whole
// package elsewhere in this repo. Refuse instead.
if (filesScanned === 0) {
  console.error(
    `check:clean [${modeLabel}] FAIL — scanned ZERO files under ${scanRoot}. ` +
      `An empty scan is not a clean verdict; check the path and the SCAN_EXTS filter.`,
  );
  process.exit(1);
}

if (totalHits > 0) {
  console.error(
    `\ncheck:clean [${modeLabel}] FAIL — ${totalHits} leak(s) found in ${filesScanned} files ` +
      `(${linesScanned} lines). Strip the references above before publishing.`,
  );
  process.exit(1);
}

console.error(
  `check:clean [${modeLabel}] OK — no internal references found in ${filesScanned} files (${linesScanned} lines).`,
);
