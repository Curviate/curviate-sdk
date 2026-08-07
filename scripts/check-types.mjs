// check:types — drift check + vendor-name grep.
//
// Regenerates types from the committed fixture (offline — no live server) and
// diffs against the committed src/generated/types.ts. Exits non-zero on any diff
// or if the vendor name appears in the generated output. This is the pre-publish
// drift gate; it must pass without starting the dev server.

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";
import {
  stripLocalDiscriminatorMappings,
  forbiddenVendorPattern,
  GENERATED_HEADER as HEADER,
} from "./openapi-sanitize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const COMMITTED = resolve(pkgRoot, "src/generated/types.ts");
const FIXTURE = resolve(pkgRoot, "fixtures/openapi.json");

const doc = JSON.parse(await readFile(FIXTURE, "utf8"));
stripLocalDiscriminatorMappings(doc);
const ast = await openapiTS(doc);
const fresh = HEADER + astToString(ast);

// vendor-name grep on the freshly generated output.
if (forbiddenVendorPattern().test(fresh)) {
  console.error("FAIL: vendor name in generated types");
  process.exit(1);
}

let committed;
try {
  committed = await readFile(COMMITTED, "utf8");
} catch {
  console.error(`FAIL: ${COMMITTED} is missing — run \`pnpm gen:types\`.`);
  process.exit(1);
}

if (fresh !== committed) {
  // Write the fresh output to a temp file and print a unix diff for humans.
  const dir = await mkdtemp(join(tmpdir(), "sdk-drift-"));
  const freshPath = join(dir, "types-fresh.ts");
  await writeFile(freshPath, fresh, "utf8");
  console.error("FAIL: committed src/generated/types.ts is out of sync with the fixture.");
  console.error(`Regenerate with \`pnpm gen:types\` (or inspect: diff ${COMMITTED} ${freshPath}).`);
  // Best-effort line-count summary without requiring a diff binary.
  const a = committed.split("\n").length;
  const b = fresh.split("\n").length;
  console.error(`committed: ${a} lines; fixture-derived: ${b} lines`);
  await rm(dir, { recursive: true, force: true });
  process.exit(1);
}

console.error("check:types OK — committed types match the fixture; no vendor name.");
