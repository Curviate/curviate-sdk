/**
 * Path-encoding guard.
 *
 * A path parameter is a VALUE, not a path fragment. Every value interpolated
 * into a request path must be percent-encoded at its call site, so that a `/`,
 * `?`, `#`, or `..` inside an id cannot restructure the URL that is sent.
 *
 * This file is the DURABLE half of that fix. The sweep that encoded the 91
 * sites present when it was written protects those 91; this guard is what
 * protects site 92. It derives the site set at run time — there is no list of
 * files or call sites in here to go stale.
 *
 * ── Why the counting assertions look paranoid ────────────────────────────────
 * A guard whose input set silently empties reports "0 raw interpolations
 * found", which is indistinguishable from a pass. That failure mode is the
 * whole reason this guard exists, so it refuses on an empty scan and
 * cross-checks the number of sites it examined against a count derived by a
 * completely different mechanism (regex over raw text vs. a TypeScript AST
 * walk). If those two disagree, one of them stopped seeing the code, and the
 * guard says so rather than passing.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  PKG_ROOT,
  SRC_ROOT,
  collectSourceFiles,
  formatSites,
  scanAst,
  scanTextual,
} from "./support/path-sites.js";

const files = collectSourceFiles();
const ast = scanAst(files);
const textual = scanTextual(files);

/** Sites reached through the `path:` property — the representation the textual scan also sees. */
const pathPropertySites = ast.sites.filter((s) => s.representation === "path-property");

describe("path-encoding guard: the input set", () => {
  it("refuses a scan that examined no files", () => {
    expect(ast.files.length).toBeGreaterThan(0);
    expect(textual.filesScanned).toBeGreaterThan(0);
  });

  it("includes every resource module, derived independently of the recursive walk", () => {
    // A flat readdir of one known directory: a different derivation from the
    // recursive collector, so a walker that quietly stopped descending into
    // src/resources cannot pass by scanning only src/*.ts.
    const resourceFiles = readdirSync(join(SRC_ROOT, "resources"))
      .filter((n) => n.endsWith(".ts"))
      .map((n) => `src/resources/${n}`)
      .sort();

    expect(resourceFiles.length).toBeGreaterThan(0);
    expect(ast.files).toEqual(expect.arrayContaining(resourceFiles));
  });

  it("refuses a scan that found no path interpolations at all", () => {
    // Zero sites means the scanner lost its input, not that the SDK stopped
    // interpolating ids into paths.
    expect(pathPropertySites.length).toBeGreaterThan(0);
    expect(textual.siteCount).toBeGreaterThan(0);
  });

  it("agrees with an independently derived site count", () => {
    expect(pathPropertySites.length).toBe(textual.siteCount);
  });
});

describe("path-encoding guard: every interpolated value is encoded", () => {
  it("has no raw path interpolation anywhere in src/", () => {
    const raw = ast.sites.filter((s) => s.status === "raw");
    expect(
      raw.length,
      `${raw.length} of ${ast.sites.length} path interpolations are RAW. A path ` +
        `parameter is a value, not a path fragment: wrap it with apiPath\`...\` ` +
        `or encodePathParam(...).\n${formatSites(raw)}`,
    ).toBe(0);
  });

  it("has no path expression the scanner could not classify", () => {
    // An unrecognised `path:` initializer is an unknown, not a pass.
    expect(
      ast.unclassified,
      `Unclassified path expression(s): ${JSON.stringify(ast.unclassified, null, 2)}`,
    ).toEqual([]);
  });

  it("constructs a URL object in exactly one reviewed place", () => {
    // `new URL(path, baseUrl)` is what resolves `..` segments, so a second
    // construction site is a new place traversal can happen. Allowlisted by
    // file so a new one has to be looked at rather than inherited.
    expect(ast.urlConstructions.map((u) => u.file)).toEqual(["src/transport.ts"]);
  });
});

describe("path-encoding guard: the account-id placeholder substitution", () => {
  // This substitution is one call site in one helper rather than a repeatable
  // family, so it gets a targeted assertion here plus a behavioural test in
  // path-encoding.roundtrip.test.ts (which is the stronger of the two).
  const contextSrc = readFileSync(join(PKG_ROOT, "src/internal/context.ts"), "utf8");
  const sf = ts.createSourceFile(
    "context.ts",
    contextSrc,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TS,
  );

  function findFunction(name: string): ts.FunctionDeclaration | undefined {
    let found: ts.FunctionDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }

  it("routes the account id through the encoder", () => {
    const fn = findFunction("injectAccountIdIntoPath");
    expect(fn, "injectAccountIdIntoPath not found — was it renamed?").toBeDefined();

    let callsEncoder = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "encodePathParam" ||
          node.expression.text === "encodeURIComponent")
      ) {
        callsEncoder = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(fn!);

    expect(
      callsEncoder,
      "injectAccountIdIntoPath substitutes the account id into the path without " +
        "encoding it, so an account selector containing `/` or `..` retargets the request.",
    ).toBe(true);
  });
});
