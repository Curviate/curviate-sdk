/**
 * check:copy — end-to-end proof, against the real filesystem.
 *
 * test/check-copy.test.ts proves the pattern SET is correct (each label
 * fires on a synthetic sample string). It never runs the actual file walker
 * or the actual npm-publish gate, so it cannot catch the two failure modes
 * that matter most for an instrument like this one:
 *
 *   1. The walker silently narrows its own input set (a directory stops
 *      being descended into, an extension drops out of SCAN_EXTS) and
 *      reports "clean" over a shrinking pile of files nobody is reading.
 *      A guard that scans zero files and reports clean has happened on
 *      this project before.
 *   2. The pattern set is correct in isolation but the file-scanning loop
 *      around it has bit-rotted (an early `continue`, a wrong variable) so
 *      a real file carrying a real glyph never gets tested against it.
 *
 * This file closes both gaps: (a) cross-checks the real scan's file count
 * against an independently written walker, and (b) drives `run()` — the
 * exact function `prepack` calls — against a real, disposable directory,
 * physically writing and removing files to prove RED and GREEN are both
 * reachable, not just asserted.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - plain .mjs tooling script, no type declarations
import { collectFiles, run } from "../scripts/check-copy.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

// ── Independent re-derivation of the real scan's input set ──────────────────
// Written fresh, as an iterative stack walk rather than the production
// recursive one, and re-stating the skip/include rules by hand rather than
// importing them — an import would make this "independent" derivation share
// the exact bug a drifted SKIP_DIRS or SCAN_EXTS would introduce.
const INDEPENDENT_SKIP_DIRNAMES = new Set([
  "node_modules",
  "dist",
  "coverage",
  "fixtures",
  "test",
  "scripts",
]);
const INDEPENDENT_SKIP_RELDIRS = new Set(["src/generated"]);
const INDEPENDENT_SCAN_EXTS = new Set([".ts", ".mjs", ".js", ".md", ".json"]);
const INDEPENDENT_SCAN_BASENAMES = new Set(["LICENSE"]);

function independentCollect(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(root, abs);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (INDEPENDENT_SKIP_DIRNAMES.has(name) || INDEPENDENT_SKIP_RELDIRS.has(rel)) continue;
        stack.push(abs);
      } else if (st.isFile()) {
        if (INDEPENDENT_SCAN_EXTS.has(extname(name)) || INDEPENDENT_SCAN_BASENAMES.has(name)) {
          out.push(abs);
        }
      }
    }
  }
  return out.sort();
}

describe("check:copy — real package scan (the actual npm-publish gate)", () => {
  const production: Promise<string[]> = (collectFiles(PKG_ROOT) as Promise<string[]>).then(
    (files: string[]) => [...files].sort(),
  );
  const independent = independentCollect(PKG_ROOT);

  it("refuses to be trivially satisfied: the independent walk itself finds files", () => {
    // If this is ever near-zero, the cross-check below is worthless — it
    // would be comparing two empty sets and calling that agreement.
    expect(independent.length).toBeGreaterThan(20);
  });

  it("the production walker's file count matches an independently written walk", async () => {
    const prod = await production;
    expect(prod.length).toBe(independent.length);
    expect(prod).toEqual(independent);
  });

  it("includes LICENSE (a published file with no extension SCAN_EXTS can match)", async () => {
    const prod = await production;
    const rels = prod.map((f) => relative(PKG_ROOT, f));
    expect(rels).toContain("LICENSE");
  });

  it("includes README.md, CHANGELOG.md, and authored src/ (not just fixtures)", async () => {
    const prod = await production;
    const rels = prod.map((f) => relative(PKG_ROOT, f));
    expect(rels).toContain("README.md");
    expect(rels).toContain("CHANGELOG.md");
    expect(rels.some((r) => r.startsWith("src/") && !r.startsWith("src/generated/"))).toBe(true);
  });

  it("excludes src/generated (machine-mirrored from the served OpenAPI doc, fixed upstream)", async () => {
    const prod = await production;
    const rels = prod.map((f) => relative(PKG_ROOT, f));
    expect(rels.some((r) => r.startsWith("src/generated/"))).toBe(false);
  });

  it("finds zero blocking typographic tells across the real published surface", async () => {
    const exitCode = await run({});
    expect(exitCode).toBe(0);
  });
});

describe("check:copy — mutation proof (reintroduce a glyph, watch it go red)", () => {
  // A disposable directory OUTSIDE the package tree entirely, never under
  // PKG_ROOT, so this proof cannot leave a stray file behind in real source
  // even on a failed assertion or an interrupted run — no cleanup step can
  // be skipped in a way that pollutes the package the guard is meant to
  // protect.
  let scratchDir: string;

  afterEach(() => {
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  });

  function seedScratch(): string {
    const dir = mkdtempSync(join(tmpdir(), "check-copy-mutation-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "clean.ts"),
      "/** Connect a LinkedIn account, then send a message. Ranges read 1-100. */\nexport const ok = 1;\n",
      "utf8",
    );
    return dir;
  }

  it("is green over a clean scratch fixture (control)", async () => {
    scratchDir = seedScratch();
    const exitCode = await run({ root: scratchDir, minFiles: 1 });
    expect(exitCode).toBe(0);
  });

  const MUTATIONS: Array<{ name: string; char: string; label: string }> = [
    { name: "em dash", char: "—", label: "em dash (U+2014)" },
    { name: "ellipsis glyph", char: "…", label: "ellipsis glyph (U+2026)" },
    { name: "arrow", char: "→", label: "arrow (U+2190-U+21FF)" },
    { name: "multiplication sign", char: "×", label: "multiplication sign (U+00D7)" },
    { name: "less-than-or-equal", char: "≤", label: "inequality glyph (U+2264/U+2265)" },
    { name: "greater-than-or-equal", char: "≥", label: "inequality glyph (U+2264/U+2265)" },
  ];

  it.each(MUTATIONS)(
    "reintroducing a $name into a scanned file turns the guard red, and removing it turns it green again",
    async ({ char, label }) => {
      scratchDir = seedScratch();

      // GREEN before the mutation.
      expect(await run({ root: scratchDir, minFiles: 1 })).toBe(0);

      // Reintroduce the glyph, inside prose a JSDoc comment would plausibly
      // carry, exactly the surface this guard exists to police.
      const mutatedPath = join(scratchDir, "mutated.ts");
      writeFileSync(
        mutatedPath,
        `/** Supports large accounts ${char} many seats, still one request. */\nexport const mutated = 1;\n`,
        "utf8",
      );

      const originalError = console.error;
      const captured: string[] = [];
      console.error = (...args: unknown[]) => {
        captured.push(args.map(String).join(" "));
      };
      let redExitCode: number;
      try {
        redExitCode = await run({ root: scratchDir, minFiles: 1 });
      } finally {
        console.error = originalError;
      }

      expect(redExitCode).toBe(1);
      expect(captured.some((line) => line.includes(label))).toBe(true);
      expect(captured.some((line) => line.includes("mutated.ts"))).toBe(true);

      // Remove the mutation: GREEN again. Proves the red verdict above was
      // actually caused by the glyph, not by some other property of the
      // scratch directory (e.g. an unrelated file-count edge case).
      rmSync(mutatedPath);
      expect(await run({ root: scratchDir, minFiles: 1 })).toBe(0);
    },
  );
});
