// check:cli-notice — notices when a just-published SDK version leaves the
// published CLI's declared range unable to resolve it ("make the publish
// flow notice" — the requirement this operationalizes).
//
// NOT a postpublish lifecycle hook. `npm publish <file>.tgz` — the form the
// runbook mandates, because it ships the exact bytes that were gated and
// never re-runs `prepack` — does NOT run npm lifecycle scripts at all. A
// `postpublish` hook wired to that command silently never fires; that was
// this check's own cycle-2 defect (verified against a fake registry). So
// this takes the published version as an explicit CLI argument and is
// invoked as its own mandatory runbook step, immediately after the publish
// command — the same way every other gate in this runbook works (the dry
// run, the leak scan, `npm whoami`), not lifecycle-dependent.
//
// This CANNOT undo the publish — it runs after the registry already has the
// tarball — and it does not need to: the SDK publishing ahead of the CLI is
// not itself unsafe (the SDK does no runtime cross-check against
// consumers). The requirement is *notice*, loud and unconditional.
//
// The oracle is what a user actually resolves — `npm view @curviate/cli
// dependencies` — never a dist-tag lookup. `npm view @curviate/sdk version`
// (the shape the old runbook snippet used) returns the registry's `latest`
// DIST-TAG, not the version just published. Per /npm-publish, ordinary 0.x
// releases publish untagged and land on `latest`, so today those two usually
// coincide; a deliberate `--tag next` RC (an opt-in workflow, not the default
// path) would leave `latest` pointing at an unrelated version and the dist-tag
// read would print a false OK (security-auditor F4). Taking the version from
// the explicit --published-version argument avoids the question entirely.
//
// Match is semver RANGE SATISFACTION, not string equality: the CLI's
// declared dependency is a range (e.g. `~0.24.2`, `=0.24.2`, `*`), and every
// non-exact form false-alarmed under a strict `===` comparison even though
// it would resolve the new version on install. `semver.satisfies()` is the
// correct oracle for "does this range actually resolve to this version".
//
// Exit 0: the published version just published. The SDK publish above
// SUCCEEDED — this message never implies the publish failed or should be
// retried.
// Exit 1: it does not (or the CLI's declared dependency couldn't be read at
// all) — loud, but this cannot and does not block anything; the SDK is
// already live by the time this runs. The fix is a SEPARATE CLI release:
// bump the pin in packages/cli/package.json, let `check:sdk-pin` prove
// resolved==declared, then publish @curviate/cli.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { satisfies, validRange } from "semver";

const REAL_NPM_REGISTRY = "https://registry.npmjs.org/";

/**
 * @param {string} pkgName npm package name to look up
 * @returns {Record<string, string>} the published package's `dependencies`
 */
export function fetchDependenciesFromRegistry(pkgName) {
  // --registry pinned explicitly (security-auditor F4): this runs with
  // ambient npm config, so a project `.npmrc` or `npm_config_registry` env
  // var could otherwise redirect the lookup and spoof a false OK. Not a
  // credential-leak path (no token flows through this call) — this pin is
  // about correctness of the oracle, not secrecy.
  const raw = execFileSync(
    "npm",
    ["view", pkgName, "dependencies", "--json", "--registry", REAL_NPM_REGISTRY],
    { encoding: "utf8" },
  );
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
  const resolves =
    cliDeclared !== null && validRange(cliDeclared) !== null && satisfies(publishedVersion, cliDeclared);
  return resolves
    ? { ok: true, reason: "match", cliDeclared }
    : { ok: false, reason: "mismatch", cliDeclared };
}

function parseArgs(argv) {
  const flagIndex = argv.indexOf("--published-version");
  if (flagIndex === -1 || flagIndex === argv.length - 1) return undefined;
  return argv[flagIndex + 1];
}

async function main() {
  const publishedVersion = parseArgs(process.argv.slice(2));
  const result = checkCliNotice({ publishedVersion });

  if (result.reason === "no-version") {
    console.error(
      "check:cli-notice FAIL — no --published-version <version> argument given. Usage: " +
        "node scripts/check-cli-notice.mjs --published-version <version>",
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
      `check:cli-notice NOTICE — @curviate/sdk ${publishedVersion} published successfully. Required ` +
        `follow-up: the published @curviate/cli still declares "@curviate/sdk": "${result.cliDeclared ?? "(missing)"}", ` +
        `which does not resolve ${publishedVersion} — its users will NOT get this release on a fresh ` +
        `install. This is a SEPARATE CLI release, not a retry of this publish: bump the pin in ` +
        `packages/cli/package.json, let \`check:sdk-pin\` prove resolved==declared, then publish @curviate/cli.`,
    );
    process.exit(1);
  }

  console.error(
    `check:cli-notice OK — @curviate/sdk ${publishedVersion} published successfully; the published ` +
      `@curviate/cli's declared range ("${result.cliDeclared}") already resolves it. No follow-up needed.`,
  );
}

// Run only when invoked directly, never on import — a test drives
// checkCliNotice() with an injected fetcher and must not trigger
// process.exit or a real npm-registry call as a side effect of importing.
//
// MUST be fileURLToPath(), never `new URL(import.meta.url).pathname` — the
// latter percent-encodes (space -> %20, # -> %23, ? -> %3F, % -> %25,
// non-ASCII -> UTF-8 percent-escapes) while process.argv[1] never does, so
// any checkout path containing one of those characters makes this
// comparison silently false: main() never runs, no output, exit 0 — a
// runbook step read as PASS when it never executed at all (security-auditor
// F1). The publish runbook's step 1 clones into an operator-chosen
// `/tmp/<scratch>/`, so this was reachable in normal use. check-clean.mjs
// and check-sdk-pin.mjs in the sibling CLI repo already use the correct
// idiom; this was the one script that didn't.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
