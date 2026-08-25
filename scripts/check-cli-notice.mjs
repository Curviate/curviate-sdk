// postpublish — notices when a just-published SDK version leaves the CLI's
// declared pin stale (Curviate/redarc#1001 bullet 3: "make the publish flow
// notice"). Wired as `postpublish`, an npm lifecycle script npm runs
// automatically after `npm publish` succeeds — unlike a runbook step, it
// cannot be forgotten, and unlike the CLI's own `check:sdk-pin` prepack
// guard, it fires from the SDK side of the publish, not the CLI's.
//
// This CANNOT undo the publish — postpublish runs after the registry
// already has the tarball — and it does not need to: the SDK publishing
// ahead of the CLI is not itself unsafe (the SDK does no runtime
// cross-check against consumers). The requirement is *notice*, loud and
// unconditional, so a publish cannot complete without this being reported.
//
// The oracle is what a user actually resolves — `npm view @curviate/cli
// dependencies` — never a dist-tag lookup. `npm view @curviate/sdk version`
// (the shape the old runbook snippet used) returns the registry's `latest`
// DIST-TAG, not the version just published; this repo's own /npm-publish
// skill routes every 0.x/RC release to `--tag next`, and every SDK release
// right now IS 0.x, so a next-tagged publish would silently compare against
// an unrelated "latest" and print a false OK (security-auditor F4). The
// version just published is instead read from `process.env
// .npm_package_version`, which npm sets from THIS package's package.json
// for the run performing the publish — never a registry lookup, so no
// dist-tag can shadow it.
//
// Exit 0: the published CLI's declared pin already matches the version just
// published.
// Exit 1: it does not (or the CLI's declared dependency couldn't be read at
// all) — loud, but this cannot and does not block anything; the SDK is
// already live by the time this runs. The fix is a SEPARATE CLI release:
// bump the pin in packages/cli/package.json, let its own check:sdk-pin
// prepack guard prove resolved==declared, then publish @curviate/cli.

import { execFileSync } from "node:child_process";

/**
 * @param {string} pkgName npm package name to look up
 * @returns {Record<string, string>} the published package's `dependencies`
 */
export function fetchDependenciesFromRegistry(pkgName) {
  const raw = execFileSync("npm", ["view", pkgName, "dependencies", "--json"], {
    encoding: "utf8",
  });
  const trimmed = raw.trim();
  if (trimmed.length === 0) return {};
  return JSON.parse(trimmed);
}

/**
 * @param {{
 *   publishedVersion: string | undefined;
 *   fetchCliDependencies?: () => Record<string, string>;
 * }} args
 * @returns {{ ok: boolean; reason: "match" | "mismatch" | "no-version" | "lookup-failed"; cliDeclared: string | null }}
 */
export function checkCliNotice({ publishedVersion, fetchCliDependencies = () => fetchDependenciesFromRegistry("@curviate/cli") }) {
  if (!publishedVersion) {
    return { ok: false, reason: "no-version", cliDeclared: null };
  }

  let cliDeps;
  try {
    cliDeps = fetchCliDependencies();
  } catch {
    return { ok: false, reason: "lookup-failed", cliDeclared: null };
  }

  const cliDeclared = cliDeps?.["@curviate/sdk"] ?? null;
  return cliDeclared === publishedVersion
    ? { ok: true, reason: "match", cliDeclared }
    : { ok: false, reason: "mismatch", cliDeclared };
}

async function main() {
  const publishedVersion = process.env.npm_package_version;
  const result = checkCliNotice({ publishedVersion });

  if (result.reason === "no-version") {
    console.error(
      "check:cli-notice FAIL — npm_package_version is not set; this script must run as an npm " +
        "lifecycle script (postpublish), not invoked directly.",
    );
    process.exit(1);
  }

  if (result.reason === "lookup-failed") {
    console.error(
      "check:cli-notice FAIL — could not read @curviate/cli's declared dependencies from the " +
        "registry (network/registry error). This does not mean the CLI is up to date — it means " +
        "this check could not verify either way.",
    );
    process.exit(1);
  }

  if (result.reason === "mismatch") {
    console.error(
      `check:cli-notice NOTICE — @curviate/sdk ${publishedVersion} just published, but the ` +
        `published @curviate/cli still declares "@curviate/sdk": "${result.cliDeclared ?? "(missing)"}" ` +
        `— its users will NOT get this release on a fresh install. This is a SEPARATE CLI release: ` +
        `bump the pin in packages/cli/package.json, let \`check:sdk-pin\` prove resolved==declared, ` +
        `then publish @curviate/cli.`,
    );
    process.exit(1);
  }

  console.error(`check:cli-notice OK — @curviate/cli already declares @curviate/sdk ${publishedVersion} (this publish).`);
}

// Run only when invoked directly, never on import — a test drives
// checkCliNotice() with an injected fetcher and must not trigger
// process.exit or a real npm-registry call as a side effect of importing.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
