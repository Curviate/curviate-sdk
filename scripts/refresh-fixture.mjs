// gen:fixture — refresh fixtures/openapi.json from the live OpenAPI document.
//
// Why this exists: the fixture is the offline input to `check:types`, the
// pre-publish drift gate. Until now nothing wrote it. It was refreshed by hand,
// so "regenerated" was an unverifiable claim, and the snapshot drifted far
// enough from the served document that the published types described endpoints
// the API no longer serves.
//
// Two properties this script guarantees that a hand-refresh cannot:
//
//   1. PROVENANCE. fixtures/PROVENANCE.json records the base URL, the server's
//      /healthz git_sha, and the time of the fetch. "Regenerated" means nothing
//      without saying from what; now the answer is committed next to the
//      artifact.
//
//   2. DETERMINISM. The served `servers` array is ordered so the serving
//      environment is servers[0], by design, so a refresh from
//      staging and a refresh from production produce byte-different fixtures
//      for a document that is otherwise identical. `servers` has no effect on
//      the generated types, so that difference is pure noise in the diff, and
//      noise is what made the previous drift unreviewable. The order is
//      canonicalized to production-first before writing.
//
// Usage:
//   CURVIATE_BASE_URL=https://api.staging.curviate.com pnpm gen:fixture
//   pnpm gen:types:fixture     # regenerate src/generated/types.ts from it
//
// This writes the fixture only. The generated types are a separate step on
// purpose, so a refresh and a regen show up as two reviewable changes.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { forbiddenVendorPattern } from "./openapi-sanitize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const FIXTURE = resolve(pkgRoot, "fixtures/openapi.json");
const PROVENANCE = resolve(pkgRoot, "fixtures/PROVENANCE.json");

const base = process.env["CURVIATE_BASE_URL"] ?? "http://localhost:3000";

/**
 * Canonical `servers` order. The document always carries the same three
 * entries; only their order varies by serving environment. Fixing the order
 * makes the fixture independent of where it was fetched from.
 * @param {{servers?: Array<{url: string}>}} doc
 * @returns {boolean} whether the order was changed
 */
function canonicalizeServers(doc) {
  if (!Array.isArray(doc.servers)) return false;
  const rank = (url) =>
    url.includes(".staging.") ? 1 : url.includes("localhost") ? 2 : 0;
  const before = doc.servers.map((s) => s.url).join(",");
  doc.servers = [...doc.servers].sort((a, b) => rank(a.url) - rank(b.url));
  return doc.servers.map((s) => s.url).join(",") !== before;
}

/**
 * @param {string} url
 * @returns {Promise<unknown>}
 */
async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    console.error(`Could not reach ${url}. Is the server running?`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Unexpected ${res.status} from ${url}.`);
    process.exit(1);
  }
  return res.json();
}

const doc = await fetchJson(`${base}/.well-known/openapi.json`);

// Forbidden-name gate, BEFORE the bytes land on disk in a public repo. The
// generated-types grep in gen-types.mjs runs on the openapi-typescript output,
// which drops most prose; the fixture keeps every description verbatim, so it
// is the wider surface and needs its own check.
const serialized = JSON.stringify(doc);
if (forbiddenVendorPattern().test(serialized)) {
  console.error("FAIL: vendor name present in the served document; refusing to write the fixture");
  process.exit(1);
}

const reordered = canonicalizeServers(doc);

await writeFile(FIXTURE, JSON.stringify(doc, null, 2) + "\n", "utf8");

// Provenance. /healthz is best-effort: a server that does not expose it still
// produces a usable fixture, it just cannot name its own commit.
let gitSha = null;
try {
  const health = await fetchJson(`${base}/healthz`);
  gitSha = typeof health?.git_sha === "string" ? health.git_sha : null;
} catch {
  gitSha = null;
}

await writeFile(
  PROVENANCE,
  JSON.stringify(
    {
      source_base_url: base,
      server_git_sha: gitSha,
      fetched_at: new Date().toISOString(),
      paths: Object.keys(doc.paths ?? {}).length,
      servers_canonicalized: reordered,
      note: "Written by scripts/refresh-fixture.mjs (pnpm gen:fixture). Do not hand-edit; refresh instead.",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.error(
  `wrote ${FIXTURE} (${Object.keys(doc.paths ?? {}).length} paths) from ${base}` +
    (gitSha ? ` @ ${gitSha}` : "") +
    (reordered ? " [servers reordered to canonical production-first]" : ""),
);
