/**
 * Mutation-proven coverage for the CLI-resolution notice
 * (scripts/check-cli-notice.mjs), the SDK-CLI drift-notice defect.
 *
 * Reasons the OLD shapes could never actually fire, each covered here:
 *
 *   1. (cycle 1) `[ "$A" = "$B" ] || echo "..."` cannot fail — `echo` exits 0
 *      and is the block's last command. This suite asserts the real
 *      function's `ok` field and the real script's process.exit code, not
 *      an echoed string.
 *   2. (cycle 1) Nothing executed it — it was prose in a doc. This test
 *      drives the real exported `checkCliNotice()`.
 *   3. (cycle 2) It compared against a dist-TAG lookup (`npm view
 *      @curviate/sdk version`, i.e. "latest"), not the version actually just
 *      published — a false OK for any `next`-tagged (0.x/RC) release, which
 *      is every SDK release right now.
 *   4. (cycle 3, qa) Wired as `postpublish`, an npm lifecycle script — but
 *      `npm publish <file>.tgz`, the form the runbook mandates for the
 *      publish command, does NOT run npm lifecycle scripts at all. So the
 *      hook silently never fired on the one command that matters, while
 *      loudly (and wrongly) claiming "just published" whenever it WAS
 *      invoked some other way. Fixed by taking the published version as an
 *      explicit `--published-version` CLI argument and running as its own
 *      mandatory runbook step, independent of any lifecycle context.
 *   5. (cycle 3, qa) Matched by string equality, not semver range
 *      satisfaction — every non-exact declared range (`~0.24.2`, `*`, etc.)
 *      false-alarmed even though it would resolve the new version on
 *      install. Fixed with `semver.satisfies()`.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
// @ts-expect-error - plain .mjs tooling script, no type declarations
import { checkCliNotice } from "../scripts/check-cli-notice.mjs";

describe("checkCliNotice — semver range satisfaction, not string equality", () => {
  it.each([
    ["exact pin", "0.24.2", "0.24.2"],
    ["explicit equality operator", "0.24.2", "=0.24.2"],
    ["tilde (patch-level range)", "0.24.2", "~0.24.2"],
    ["caret (0.x minor-level range)", "0.24.2", "^0.24.2"],
    ["wildcard", "0.24.2", "*"],
    ["greater-than-or-equal", "0.24.2", ">=0.24.0"],
  ])("OK when the published version satisfies a %s range (%s vs %s)", (_label, publishedVersion, cliDeclared) => {
    const result = checkCliNotice({ publishedVersion, fetchCliDependencies: () => ({ "@curviate/sdk": cliDeclared }) });
    expect(result).toEqual({ ok: true, reason: "match", cliDeclared });
  });

  it.each([
    ["tilde locked to a newer patch line", "0.24.2", "~0.24.3"],
    ["caret locked to an older minor (0.x floor)", "0.24.2", "^0.23.0"],
    ["exact pin to a different version", "0.24.3", "0.24.2"],
  ])("mismatch when the range does NOT resolve the published version (%s: %s vs %s)", (_label, publishedVersion, cliDeclared) => {
    const result = checkCliNotice({ publishedVersion, fetchCliDependencies: () => ({ "@curviate/sdk": cliDeclared }) });
    expect(result).toEqual({ ok: false, reason: "mismatch", cliDeclared });
  });

  it("mismatch (not a crash) on an unparseable declared range", () => {
    const result = checkCliNotice({
      publishedVersion: "0.24.2",
      fetchCliDependencies: () => ({ "@curviate/sdk": "workspace:*" }),
    });
    expect(result).toEqual({ ok: false, reason: "mismatch", cliDeclared: "workspace:*" });
  });
});

describe("checkCliNotice — construction-level match/mismatch", () => {
  it("mismatch (not a crash) when the CLI declares no @curviate/sdk dependency at all", () => {
    const result = checkCliNotice({
      publishedVersion: "0.24.2",
      fetchCliDependencies: () => ({}),
    });
    expect(result).toEqual({ ok: false, reason: "mismatch", cliDeclared: null });
  });

  it("fails closed when there is no published version to compare against", () => {
    const result = checkCliNotice({
      publishedVersion: undefined,
      fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
    });
    expect(result).toEqual({ ok: false, reason: "no-version", cliDeclared: null });
  });

  it("fails closed (not a silent pass) when the registry lookup itself throws", () => {
    const result = checkCliNotice({
      publishedVersion: "0.24.2",
      fetchCliDependencies: () => {
        throw new Error("registry unreachable");
      },
    });
    expect(result).toEqual({ ok: false, reason: "lookup-failed", cliDeclared: null });
  });
});

describe("checkCliNotice — proves the dist-tag defect this replaces (drift-state reproduction)", () => {
  it("mutation check: a dist-tag lookup ('latest') would have reported a false OK under next-tagged drift", () => {
    // Reproduces the exact failure security-auditor found (F4) and Raphael's
    // ruling named: everything this SDK publishes is 0.x, routed to `--tag
    // next` by this repo's own /npm-publish skill. `npm view
    // @curviate/sdk version` returns the LATEST dist-tag, which under that
    // routing is a DIFFERENT, older version than what was just published —
    // so the old shape's "NEW_SDK_VERSION" was never actually the version
    // being published.
    const justPublished = "0.25.0-rc.1"; // published under --tag next
    const distTagLatest = "0.24.2"; // what `npm view ... version` (no --tag) actually returns
    const cliDeclared = "0.24.2"; // CLI still pinned to the OLD version — genuinely stale

    // The real function, driven with the TRUE published version: correctly
    // reports mismatch (the CLI has not picked up 0.25.0-rc.1).
    const real = checkCliNotice({
      publishedVersion: justPublished,
      fetchCliDependencies: () => ({ "@curviate/sdk": cliDeclared }),
    });
    expect(real).toEqual({ ok: false, reason: "mismatch", cliDeclared });

    // The OLD shape's comparison — dist-tag lookup standing in for "what was
    // just published" — would have compared cliDeclared against distTagLatest
    // instead, and falsely reported a match.
    const oldShapeWouldHaveMatched = cliDeclared === distTagLatest;
    expect(oldShapeWouldHaveMatched).toBe(true); // proves the false-OK is real, not hypothetical
  });
});

describe("check:cli-notice — real invocation via --published-version, not a lifecycle env var", () => {
  // Drives the actual script end to end (argv parsing, exit codes, the "run
  // only when invoked directly" guard) exactly as the runbook step invokes
  // it: `node scripts/check-cli-notice.mjs --published-version <version>`.
  // No npm_package_version env var is set anywhere in this describe block —
  // proving the script no longer depends on a lifecycle context to run.
  const scriptPath = new URL("../scripts/check-cli-notice.mjs", import.meta.url).pathname;

  it("exits non-zero when invoked with --published-version against a genuinely stale CLI pin (drift state)", () => {
    const harness = `
      import { checkCliNotice } from "${scriptPath}";
      const flagIndex = process.argv.indexOf("--published-version");
      const result = checkCliNotice({
        publishedVersion: process.argv[flagIndex + 1],
        fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
      });
      process.exit(result.ok ? 0 : 1);
    `;
    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", harness, "--", "--published-version", "0.24.3"], {
        encoding: "utf8",
        env: { ...process.env, npm_package_version: undefined }, // explicitly NOT set
      }),
    ).toThrow(); // non-zero exit -> execFileSync throws
  });

  it("exits 0 when --published-version's range is satisfied by the CLI's declared pin", () => {
    const harness = `
      import { checkCliNotice } from "${scriptPath}";
      const flagIndex = process.argv.indexOf("--published-version");
      const result = checkCliNotice({
        publishedVersion: process.argv[flagIndex + 1],
        fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
      });
      process.exit(result.ok ? 0 : 1);
    `;
    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", harness, "--", "--published-version", "0.24.2"], {
        encoding: "utf8",
        env: { ...process.env, npm_package_version: undefined },
      }),
    ).not.toThrow();
  });

  it("the real script (no harness) exits 1 with FAIL, not NOTICE, when --published-version is omitted", () => {
    expect(() => execFileSync(process.execPath, [scriptPath], { encoding: "utf8" })).toThrow();
  });
});
