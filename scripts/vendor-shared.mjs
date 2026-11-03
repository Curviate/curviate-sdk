// vendor-shared — copy the API's pure shared modules (webhook body templates,
// the Sequence validator) and their corpora into this package, byte-equal in
// behaviour. The API cannot import the SDK and the SDK cannot import the API,
// so the two run the same code, held together by the shared corpora.
//
// Comments are dropped (they cite internal documents) and non-ASCII inside
// literals is written as \uXXXX escapes (check:copy); nothing else changes.
// Never edit src/shared/ by hand: change the API, then re-run this.
//
// Usage: node scripts/vendor-shared.mjs <api src/shared dir> <api test/fixtures dir>

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const [srcShared, fixtures] = process.argv.slice(2);
if (!srcShared || !fixtures) {
  console.error("usage: node scripts/vendor-shared.mjs <api src/shared dir> <api test/fixtures dir>");
  process.exit(2);
}
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "webhook-template.ts",
  "field-paths.ts",
  "sequence/validate.ts",
  "sequence/limits.ts",
  "sequence/message-actions.ts",
  "sequence/paths.ts",
  "sequence/references.ts",
  "sequence/rules.ts",
];
const HEADER = "// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.\n";
const printer = ts.createPrinter({ removeComments: true });

const out = join(pkgRoot, "src/shared");
await rm(out, { recursive: true, force: true });
for (const f of FILES) {
  const text = await readFile(join(srcShared, f), "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const body = printer
    .printFile(sf)
    // ESM resolution: relative imports carry the .js suffix.
    .replace(/(from\s+")(\.{1,2}\/[^"]+)(")/g, (_m, a, p, z) => `${a}${p}.js${z}`)
    .replace(/[^\x00-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  await mkdir(dirname(join(out, f)), { recursive: true });
  await writeFile(join(out, f), HEADER + body);
}
for (const corpus of ["webhook-template-corpus", "sequence-corpus"]) {
  const dest = join(pkgRoot, "test/fixtures", corpus);
  await rm(dest, { recursive: true, force: true });
  await cp(join(fixtures, corpus), dest, { recursive: true });
}
console.log(`vendored ${FILES.length} modules and 2 corpora`);
