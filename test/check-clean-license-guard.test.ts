/**
 * Mutation-proven coverage for check:clean scanning LICENSE
 * (scripts/check-clean.mjs, security-auditor F2, #cross-repo with the CLI
 * package's identical copy of this guard).
 *
 * LICENSE ships in this package's `files` allowlist and
 * extname("LICENSE") === "" like every dotfile SCAN_DOTFILES already
 * covers, so before this fix it sat outside BOTH the extension filter and
 * the dotfile allowlist — unscanned here and by check:copy alike (which
 * already carried this exact fix under SCAN_BASENAMES).
 *
 * This script is not structured as exported functions like the CLI's copy
 * (it runs its scan at module top level against the real package root), so
 * this test drives the actual CLI entry point via subprocess against a
 * throwaway copy of the script + a mutated LICENSE, rather than importing
 * internals. Mutation-proven: run BEFORE the SCAN_DOTFILES fix would have
 * exited 0 over the identical mutated fixture; the assertions below prove
 * the CURRENT (fixed) script does not.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REAL_SCRIPT = fileURLToPath(new URL("../scripts/check-clean.mjs", import.meta.url));
const VENDOR_FRAGMENT = ["uni", "pi", "le"].join(""); // kept non-contiguous in source, see check-clean.mjs's own convention

const tmpDirs: string[] = [];

async function makeFixturePackage(licenseContent: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdk-check-clean-license-"));
  tmpDirs.push(dir);
  await mkdir(join(dir, "scripts"), { recursive: true });
  await cp(REAL_SCRIPT, join(dir, "scripts", "check-clean.mjs"));
  await writeFile(join(dir, "LICENSE"), licenseContent, "utf8");
  // A second, ordinary scannable file so the fixture is never mistaken for
  // the "zero files scanned" fail-closed case this same guard also checks.
  await writeFile(join(dir, "README.md"), "# Fixture package\n\nNothing to see here.\n", "utf8");
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe("check:clean — LICENSE is scanned (security-auditor F2)", () => {
  it("catches the substrate vendor name appended to LICENSE", async () => {
    const dir = await makeFixturePackage(`MIT License\n\nCopyright notice mentioning ${VENDOR_FRAGMENT}.\n`);
    let threw = false;
    let output = "";
    try {
      execFileSync(process.execPath, ["scripts/check-clean.mjs"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      threw = true;
      output = String((err as { stderr?: string }).stderr ?? "");
    }
    expect(threw).toBe(true); // non-zero exit: the mutated LICENSE is caught
    expect(output).toMatch(/LEAK\s+LICENSE/);
    expect(output).toMatch(/substrate vendor name/);
  });

  it("a genuinely clean LICENSE still passes", async () => {
    const dir = await makeFixturePackage("MIT License\n\nCopyright (c) Example.\n");
    expect(() =>
      execFileSync(process.execPath, ["scripts/check-clean.mjs"], { cwd: dir, encoding: "utf8", stdio: "pipe" }),
    ).not.toThrow();
  });
});
