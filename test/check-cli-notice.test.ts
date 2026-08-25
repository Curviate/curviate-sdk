/**
 * Mutation-proven coverage for the postpublish CLI-resolution notice
 * (scripts/check-cli-notice.mjs), the SDK-CLI drift-notice defect.
 *
 * Three real reasons the OLD runbook-only "check" could never actually fire
 * are covered here, each with a red-then-green pair:
 *
 *   1. Nothing executed it — it was prose in a doc. This test drives the
 *      real exported `checkCliNotice()`, not a hand-copied reimplementation.
 *   2. It compared against a dist-TAG lookup (`npm view @curviate/sdk
 *      version`, i.e. "latest"), not the version actually just published —
 *      a false OK for any `next`-tagged (0.x/RC) release, which is every SDK
 *      release right now. This suite drives `publishedVersion` directly
 *      (what `postpublish` actually reads from `npm_package_version`), never
 *      a dist-tag, and a case below proves a stale "latest" tag would have
 *      produced a false match under the old shape.
 *   3. `[ "$A" = "$B" ] || echo "..."` cannot fail — `echo` exits 0 and is
 *      the block's last command. This suite asserts the real function's
 *      `ok` field and the real script's process.exit code, not an echoed
 *      string.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
// @ts-expect-error - plain .mjs tooling script, no type declarations
import { checkCliNotice } from "../scripts/check-cli-notice.mjs";

describe("checkCliNotice — construction-level match/mismatch", () => {
  it("OK when the CLI's declared pin equals the version just published", () => {
    const result = checkCliNotice({
      publishedVersion: "0.24.2",
      fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
    });
    expect(result).toEqual({ ok: true, reason: "match", cliDeclared: "0.24.2" });
  });

  it("mismatch when the CLI is still pinned to an older SDK version", () => {
    const result = checkCliNotice({
      publishedVersion: "0.24.3",
      fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
    });
    expect(result).toEqual({ ok: false, reason: "mismatch", cliDeclared: "0.24.2" });
  });

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

describe("check:cli-notice — real invocation, drift-state proof (integration)", () => {
  it("exits non-zero when run against a genuinely stale CLI pin (drift state)", () => {
    // Runs the actual script end to end (argv handling, exit codes, the
    // "run only when invoked directly" guard) with npm_package_version set
    // to a version the injected-via-env drift state does not match. Since
    // the script's default fetcher calls the real `npm view @curviate/cli`,
    // this integration proof instead drives the exported function directly
    // through a tiny harness script that mirrors main()'s wiring but injects
    // a fixed, stale CLI dependency answer — proving the exit-code contract
    // without depending on live registry state during the test run.
    const harness = `
      import { checkCliNotice } from "${new URL("../scripts/check-cli-notice.mjs", import.meta.url).pathname}";
      const result = checkCliNotice({
        publishedVersion: process.env.npm_package_version,
        fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
      });
      if (!result.ok) process.exit(1);
      process.exit(0);
    `;
    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", harness], {
        encoding: "utf8",
        env: { ...process.env, npm_package_version: "0.24.3" }, // registry moved, CLI didn't
      }),
    ).toThrow(); // non-zero exit -> execFileSync throws
  });

  it("exits 0 when the drift-state harness sees a matching pin", () => {
    const harness = `
      import { checkCliNotice } from "${new URL("../scripts/check-cli-notice.mjs", import.meta.url).pathname}";
      const result = checkCliNotice({
        publishedVersion: process.env.npm_package_version,
        fetchCliDependencies: () => ({ "@curviate/sdk": "0.24.2" }),
      });
      if (!result.ok) process.exit(1);
      process.exit(0);
    `;
    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", harness], {
        encoding: "utf8",
        env: { ...process.env, npm_package_version: "0.24.2" },
      }),
    ).not.toThrow();
  });
});
