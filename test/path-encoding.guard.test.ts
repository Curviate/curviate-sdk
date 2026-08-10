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

describe("path-encoding guard: the scanner can still report a raw site", () => {
  // POSITIVE CONTROL. Everything above is a negative result: it asserts the
  // scanner found no raw sites. A negative result is only worth the instrument
  // behind it, and an instrument that has stopped classifying returns exactly
  // the same answer as a clean codebase.
  //
  // The earlier mutation record for this guard measured whether the input set
  // could silently EMPTY. It can't, and those refusals hold. But it never
  // measured whether the classifier still classifies, and five mutations that
  // keep the input set full while making `raw` unreachable survived a green
  // suite. These arms are what kill them.
  const fixture = join(PKG_ROOT, "test/support/classifier-fixture.ts");
  const scan = scanAst([fixture]);

  /** The sites belonging to one fixture construct, selected by its marker. */
  function sitesFor(marker: string): Array<{ status: string; expression: string; representation: string }> {
    return scan.sites.filter((s) => s.template.includes(marker));
  }

  it("classifies a raw interpolation as raw", () => {
    // The single assertion the whole negative result rests on.
    const raw = scan.sites.filter((s) => s.status === "raw");
    expect(raw.length, "the scanner reported no raw site in a fixture full of them").toBeGreaterThan(
      0,
    );
    expect(sitesFor("ctl-raw-single").map((s) => s.status)).toEqual(["raw"]);
  });

  it("counts every parameter of a multi-parameter raw template", () => {
    const sites = sitesFor("ctl-raw-double");
    expect(sites.map((s) => s.expression)).toEqual(["chatId", "postId"]);
    expect(sites.map((s) => s.status)).toEqual(["raw", "raw"]);
  });

  it("distinguishes encoded-by-tag, encoded-by-call and raw from one another", () => {
    expect(sitesFor("ctl-tagged").map((s) => s.status)).toEqual(["encoded-by-tag"]);
    expect(sitesFor("ctl-call-encoded").map((s) => s.status)).toEqual(["encoded-by-call"]);
    expect(sitesFor("ctl-raw-single").map((s) => s.status)).toEqual(["raw"]);
  });

  it("does not accept a non-encoder call as encoding", () => {
    // `isEncoderCall` returning true for everything is a live mutation.
    expect(sitesFor("ctl-fake-encoder").map((s) => s.status)).toEqual(["raw"]);
  });

  it("does not accept an arbitrary tag as an encoding tag", () => {
    // A tagged template whose tag encodes nothing is caught twice: the tagged
    // expression is unresolvable to representation A, and representation B
    // still reads the inner template and calls its substitution raw.
    expect(sitesFor("ctl-wrong-tag").map((s) => s.status)).toEqual(["raw"]);
    expect(scan.unclassified.some((u) => u.text.includes("ctl-wrong-tag"))).toBe(true);
  });

  it("sees a `/v1/` template that is not under a `path:` property", () => {
    // `looksLikePath` returning false is a live mutation.
    const loose = sitesFor("ctl-loose-template");
    expect(loose.map((s) => s.representation)).toEqual(["v1-template"]);
    expect(loose.map((s) => s.status)).toEqual(["raw"]);
  });

  it("sees a `/v1/` path built by `+` concatenation", () => {
    // Dropping representation C is a live mutation.
    const concat = sitesFor("ctl-concatenated");
    expect(concat.map((s) => s.representation)).toEqual(["concatenation"]);
    expect(concat.map((s) => s.status)).toEqual(["raw"]);
  });

  it("records a static path as static, with no interpolation site", () => {
    expect(scan.staticPaths.map((p) => p.template)).toEqual(
      expect.arrayContaining(['"/v1/ctl-static-string"', "`/v1/ctl-static-template`"]),
    );
    expect(sitesFor("ctl-static-string")).toEqual([]);
    expect(sitesFor("ctl-static-template")).toEqual([]);
  });

  it("reports an unresolvable `path:` initializer rather than passing it", () => {
    expect(scan.unclassified.map((u) => u.text)).toEqual(
      expect.arrayContaining(["buildPath(postId)"]),
    );
  });

  it("sees a URL construction site", () => {
    expect(scan.urlConstructions.length).toBe(1);
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
