// gen:types — generate src/generated/types.ts from the live OpenAPI document.
//
// Source: $CURVIATE_BASE_URL/.well-known/openapi.json (default http://localhost:3000).
// Pass --fixture to read fixtures/openapi.json instead of fetching (offline path,
// used by check:types). The fetched/read document is sanitized (see
// openapi-sanitize.mjs) before openapi-typescript runs.
//
// Wrapped in a script rather than a one-liner because the document needs the
// sanitize transform first (vendor-name grep on the generated output).

import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";
import {
  stripLocalDiscriminatorMappings,
  forbiddenVendorPattern,
  GENERATED_HEADER as HEADER,
} from "./openapi-sanitize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const OUTPUT = resolve(pkgRoot, "src/generated/types.ts");
const FIXTURE = resolve(pkgRoot, "fixtures/openapi.json");

const useFixture = process.argv.includes("--fixture");

/** @returns {Promise<unknown>} the raw OpenAPI document */
async function loadDocument() {
  if (useFixture) {
    return JSON.parse(await readFile(FIXTURE, "utf8"));
  }
  const base = process.env.CURVIATE_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/.well-known/openapi.json`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    console.error(`Could not reach ${url}. Run \`pnpm dev\` first.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Unexpected ${res.status} from ${url}. Run \`pnpm dev\` first.`);
    process.exit(1);
  }
  return res.json();
}

const doc = await loadDocument();
const stripped = stripLocalDiscriminatorMappings(doc);
if (stripped > 0 && !useFixture) {
  console.error(`note: stripped ${stripped} unresolvable discriminator mapping(s) from the document`);
}

const ast = await openapiTS(doc);
const body = astToString(ast);
await writeFile(OUTPUT, HEADER + body, "utf8");

// vendor-name grep on the generated output.
if (forbiddenVendorPattern().test(HEADER + body)) {
  console.error("FAIL: vendor name present in generated types");
  process.exit(1);
}

console.error(`wrote ${OUTPUT}`);
