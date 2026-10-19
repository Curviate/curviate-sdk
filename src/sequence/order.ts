/**
 * Canonical key order: the order the API's served documents use, key for
 * key. Runs on a document `validateSequence` accepted, so only known keys
 * occur; any other key would keep its place after the known ones. Returns a
 * fresh deep copy; values are never touched.
 */
const DOC = ["$schema", "on_reply", "steps"];
const STEP = ["id", "do", "wait", "until", "if", "emit", "tag", "timeout", "variants", "with", "then", "else", "next", "note"];
const WITH = ["post", "newer_than", "reaction", "subject", "text", "note", "note_fallback", "fallback", "withdraw_after"];
const VARIANT = ["id", "subject", "text"];
const FALLBACK = ["subject", "text"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep copy, keys as given (predicates, operands). */
function copy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(copy);
  if (!isObj(v)) return v;
  const out: Obj = {};
  for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = copy(v[k]);
  return out;
}

function ordered(o: Obj, order: readonly string[], child: (key: string, value: unknown) => unknown = (_, x) => copy(x)): Obj {
  const out: Obj = {};
  const keys = [...order.filter((k) => k in o), ...Object.keys(o).filter((k) => !order.includes(k))];
  for (const k of keys) if (o[k] !== undefined) out[k] = child(k, o[k]);
  return out;
}

function stepOf(s: unknown): unknown {
  if (!isObj(s)) return copy(s);
  return ordered(s, STEP, (k, v) => {
    if (k === "with" && isObj(v)) return ordered(v, WITH, (wk, wv) => (wk === "fallback" && isObj(wv) ? ordered(wv, FALLBACK) : copy(wv)));
    if (k === "variants" && Array.isArray(v)) return v.map((x) => (isObj(x) ? ordered(x, VARIANT) : copy(x)));
    return copy(v);
  });
}

/** The document in canonical key order, as a fresh object. */
export function canonical(doc: Obj): Obj {
  return ordered(doc, DOC, (k, v) => (k === "steps" && Array.isArray(v) ? v.map(stepOf) : copy(v)));
}
