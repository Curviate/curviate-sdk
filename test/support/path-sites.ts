/**
 * Path-construction scanner — the input set for the path-encoding guard.
 *
 * A path parameter is a VALUE, not a path fragment. Interpolating one raw into
 * a request path lets any `/`, `?`, `#`, or `..` inside it restructure the URL:
 * a share URL passed as a post id collapsed `https://` to `https:/` and turned
 * the slug's slashes into path separators, and an account selector of the shape
 * `x/../../../v1/accounts` retargeted the request at a different endpoint
 * entirely (the URL parser resolves `..` before the request is sent).
 *
 * This module derives, AT RUN TIME, every place the SDK builds a request path,
 * so the guard test can assert that each interpolated value is percent-encoded.
 * It deliberately does NOT work from a hard-coded list of files or call sites:
 * a list is exactly what goes stale when site 92 is added.
 *
 * ── Two independent derivations, deliberately ────────────────────────────────
 * `scanAst` walks the TypeScript AST. `scanTextual` re-derives the same count
 * with a regex over the raw file text — a different parser making different
 * assumptions. The guard asserts the two AGREE. A scanner whose input set
 * silently empties reports "no raw interpolations" and looks exactly like a
 * pass, so the guard needs a second opinion on how much it actually examined.
 *
 * ── What this scanner covers, and what it does not ───────────────────────────
 * Covered representations (each searched separately, not as one pattern):
 *   A. `path:` property assignments in object literals   — the ctx.request shape
 *   B. every template literal anywhere in src containing `/v1/` — catches a path
 *      assembled into a local variable or returned from a helper, which A misses
 *   C. `+` string concatenation producing a `/v1/`-bearing string
 *   D. `new URL(...)` / `new URLSearchParams(...)` construction sites
 *
 * NOT covered syntactically, because it is one call site in one helper rather
 * than a repeatable family: the `{account_id}` placeholder substitution in
 * `internal/context.ts`. That site is covered by a BEHAVIOURAL test instead
 * (a traversal-shaped account id must arrive percent-encoded on the wire),
 * which is a stronger assertion than a syntactic one — plus a targeted AST
 * assertion that the helper calls the encoder at all.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Package root (test/support -> test -> package root). */
export const PKG_ROOT = resolve(__dirname, "..", "..");
export const SRC_ROOT = join(PKG_ROOT, "src");

/**
 * Directories under src/ that are excluded from the scan, with the reason.
 * `generated` holds the openapi-typescript output: pure type declarations with
 * no runtime path construction in them at all.
 */
const SKIP_DIRS = new Set(["generated"]);

/** Call expressions that count as percent-encoding a value. */
const ENCODER_NAMES = new Set(["encodeURIComponent", "encodePathParam"]);

/** Tagged-template tags that percent-encode every substitution themselves. */
const ENCODING_TAGS = new Set(["apiPath"]);

export type SiteStatus = "encoded-by-tag" | "encoded-by-call" | "raw";

/** One interpolated expression inside a request path. */
export interface PathSite {
  /** Package-relative file path, POSIX separators. */
  file: string;
  line: number;
  /** Source text of the interpolated expression, e.g. `postId`. */
  expression: string;
  /** Source text of the whole path template. */
  template: string;
  status: SiteStatus;
  /** Which representation this site was found through (A/B/C above). */
  representation: "path-property" | "v1-template" | "concatenation";
}

/** A path-bearing template with no interpolation at all (nothing to encode). */
export interface StaticPath {
  file: string;
  line: number;
  template: string;
}

/** A path expression the scanner could not classify. Always a failure. */
export interface UnclassifiedPath {
  file: string;
  line: number;
  kind: string;
  text: string;
}

/** A `new URL(...)` / `new URLSearchParams(...)` construction site. */
export interface UrlConstruction {
  file: string;
  line: number;
  text: string;
}

export interface AstScan {
  /** Package-relative paths of every file parsed. */
  files: string[];
  sites: PathSite[];
  staticPaths: StaticPath[];
  unclassified: UnclassifiedPath[];
  urlConstructions: UrlConstruction[];
}

/** Recursively collect .ts files under `dir`, skipping SKIP_DIRS. */
export function collectSourceFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...collectSourceFiles(abs));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(abs);
    }
  }
  return out.sort();
}

function rel(abs: string): string {
  return relative(PKG_ROOT, abs).split("\\").join("/");
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Is this call expression one of the recognised encoders? */
function isEncoderCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const callee = expr.expression;
  if (ts.isIdentifier(callee)) return ENCODER_NAMES.has(callee.text);
  // Namespaced form, e.g. `path.encodePathParam(x)`.
  if (ts.isPropertyAccessExpression(callee)) return ENCODER_NAMES.has(callee.name.text);
  return false;
}

/** Is this a tagged template whose tag encodes every substitution? */
function encodingTagOf(node: ts.Node): string | undefined {
  if (!ts.isTaggedTemplateExpression(node)) return undefined;
  const tag = node.tag;
  if (ts.isIdentifier(tag) && ENCODING_TAGS.has(tag.text)) return tag.text;
  return undefined;
}

/**
 * Classify every interpolation inside a template expression.
 * `encodedByTag` short-circuits the per-span check: the tag encodes all of them.
 */
function sitesInTemplate(
  sf: ts.SourceFile,
  tpl: ts.TemplateExpression,
  representation: PathSite["representation"],
  encodedByTag: boolean,
): PathSite[] {
  const template = tpl.getText(sf);
  return tpl.templateSpans.map((span) => ({
    file: rel(sf.fileName),
    line: lineOf(sf, span.expression),
    expression: span.expression.getText(sf),
    template,
    status: encodedByTag
      ? ("encoded-by-tag" as const)
      : isEncoderCall(span.expression)
        ? ("encoded-by-call" as const)
        : ("raw" as const),
    representation,
  }));
}

/** Does this text look like it is building a request path? */
function looksLikePath(text: string): boolean {
  return text.includes("/v1/");
}

/**
 * Representation A/B/C/D scan over the TypeScript AST.
 */
export function scanAst(files: string[] = collectSourceFiles()): AstScan {
  const scan: AstScan = {
    files: files.map(rel),
    sites: [],
    staticPaths: [],
    unclassified: [],
    urlConstructions: [],
  };
  // Templates already accounted for via representation A, so representation B
  // does not double-count them.
  const seenTemplates = new Set<ts.Node>();

  for (const abs of files) {
    const text = readFileSync(abs, "utf8");
    const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);

    // ── Representation A: `path:` property assignments ───────────────────────
    const visitA = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ((ts.isIdentifier(node.name) && node.name.text === "path") ||
          (ts.isStringLiteral(node.name) && node.name.text === "path"))
      ) {
        const init = node.initializer;
        const tag = encodingTagOf(init);
        if (tag !== undefined) {
          const tpl = (init as ts.TaggedTemplateExpression).template;
          seenTemplates.add(tpl);
          if (ts.isTemplateExpression(tpl)) {
            scan.sites.push(...sitesInTemplate(sf, tpl, "path-property", true));
          } else {
            scan.staticPaths.push({
              file: rel(abs),
              line: lineOf(sf, init),
              template: init.getText(sf),
            });
          }
        } else if (ts.isTemplateExpression(init)) {
          seenTemplates.add(init);
          scan.sites.push(...sitesInTemplate(sf, init, "path-property", false));
        } else if (ts.isNoSubstitutionTemplateLiteral(init) || ts.isStringLiteral(init)) {
          seenTemplates.add(init);
          scan.staticPaths.push({
            file: rel(abs),
            line: lineOf(sf, init),
            template: init.getText(sf),
          });
        } else {
          // A `path` built by something the scanner does not understand is not
          // a pass — it is an unknown. Say so loudly.
          scan.unclassified.push({
            file: rel(abs),
            line: lineOf(sf, init),
            kind: ts.SyntaxKind[init.kind] ?? String(init.kind),
            text: init.getText(sf).slice(0, 200),
          });
        }
      }
      ts.forEachChild(node, visitA);
    };
    visitA(sf);

    // ── Representations B, C, D ──────────────────────────────────────────────
    const visitBCD = (node: ts.Node): void => {
      // B: any `/v1/`-bearing template literal not already seen via A.
      if (ts.isTemplateExpression(node) && !seenTemplates.has(node)) {
        const parentTag = encodingTagOf(node.parent);
        if (looksLikePath(node.getText(sf))) {
          scan.sites.push(
            ...sitesInTemplate(sf, node, "v1-template", parentTag !== undefined),
          );
        }
      }
      // C: `+` concatenation producing a `/v1/`-bearing string.
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        looksLikePath(node.getText(sf))
      ) {
        for (const operand of [node.left, node.right]) {
          if (ts.isStringLiteral(operand) || ts.isNoSubstitutionTemplateLiteral(operand)) continue;
          if (ts.isBinaryExpression(operand)) continue; // handled by its own visit
          scan.sites.push({
            file: rel(abs),
            line: lineOf(sf, operand),
            expression: operand.getText(sf),
            template: node.getText(sf).slice(0, 200),
            status: isEncoderCall(operand) ? "encoded-by-call" : "raw",
            representation: "concatenation",
          });
        }
      }
      // D: URL construction sites, reported for review.
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "URL" || node.expression.text === "URLSearchParams")
      ) {
        scan.urlConstructions.push({
          file: rel(abs),
          line: lineOf(sf, node),
          text: node.getText(sf).slice(0, 200),
        });
      }
      ts.forEachChild(node, visitBCD);
    };
    visitBCD(sf);
  }

  return scan;
}

export interface TextualScan {
  /** Number of `${` substitutions found inside `path:` templates. */
  siteCount: number;
  /** Number of `path:` templates found (with or without substitutions). */
  templateCount: number;
  filesScanned: number;
}

/**
 * Independent re-derivation of the site count by regex over raw file text.
 * Different mechanism, different assumptions, on purpose: the guard compares
 * this against the AST count so a broken AST walk cannot masquerade as clean.
 */
export function scanTextual(files: string[] = collectSourceFiles()): TextualScan {
  // `path:` optionally preceded by a tag identifier, then a backtick-delimited
  // template. `[^`]*` spans newlines, so a multi-line template is still one match.
  const TEMPLATE_RE = /\bpath:\s*(?:[A-Za-z_$][\w$]*\s*)?`([^`]*)`/g;
  let siteCount = 0;
  let templateCount = 0;
  let filesScanned = 0;

  for (const abs of files) {
    filesScanned++;
    const text = readFileSync(abs, "utf8");
    for (const m of text.matchAll(TEMPLATE_RE)) {
      templateCount++;
      const body = m[1] ?? "";
      siteCount += (body.match(/\$\{/g) ?? []).length;
    }
  }
  return { siteCount, templateCount, filesScanned };
}

/** Format a site list for a failure message. */
export function formatSites(sites: PathSite[]): string {
  return sites
    .map((s) => `  ${s.file}:${s.line}  \${${s.expression}}  in  ${s.template}`)
    .join("\n");
}
