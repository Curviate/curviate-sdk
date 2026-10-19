/**
 * The Sequence v1 vocabulary, read from the embedded JSON Schema (sdk/009
 * FR-005, FR-010): actions and their `with` keys, events, reactions,
 * predicates, patterns and the bounds the schema states. Nothing here is
 * restated; a schema change changes the validator with it.
 */

type Schema = Record<string, unknown>;

/**
 * Every JSON Schema keyword the v1 schema uses. The validator reads exactly
 * these; a schema using any other keyword is refused (`assertKeywords`), never
 * silently skipped.
 */
export const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "$id",
  "$schema",
  "additionalProperties",
  "anyOf",
  "const",
  "default",
  "description",
  "enum",
  "items",
  "maxItems",
  "maxLength",
  "maxProperties",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "oneOf",
  "pattern",
  "patternProperties",
  "properties",
  "required",
  "title",
  "type",
]);

const MAPS = new Set(["properties", "patternProperties"]);

/** Every keyword `schema` uses, walking subschemas (property names are not keywords). */
export function schemaKeywords(schema: unknown): Set<string> {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isObject(node)) return;
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      if (MAPS.has(k) && isObject(v)) Object.values(v).forEach(visit);
      else if (k !== "enum" && k !== "const" && k !== "default" && k !== "required") visit(v);
    }
  };
  visit(schema);
  return out;
}

/** Throws on a keyword the validator does not support (sdk/009 FR-010). */
export function assertKeywords(schema: unknown): void {
  const unknown = [...schemaKeywords(schema)].filter((k) => !SUPPORTED_KEYWORDS.has(k));
  if (unknown.length) throw new Error(`Sequence schema uses unsupported JSON Schema keyword(s): ${unknown.join(", ")}`);
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const obj = (v: unknown, at: string): Schema => {
  if (!isObject(v)) throw new Error(`Sequence schema: expected an object at ${at}`);
  return v;
};
const arr = (v: unknown, at: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`Sequence schema: expected an array at ${at}`);
  return v;
};
const num = (v: unknown, at: string): number => {
  if (typeof v !== "number") throw new Error(`Sequence schema: expected a number at ${at}`);
  return v;
};
const str = (v: unknown, at: string): string => {
  if (typeof v !== "string") throw new Error(`Sequence schema: expected a string at ${at}`);
  return v;
};
/** `^<prefix><rest>` to `^<rest>`: the part of a pattern after a fixed prefix. */
const after = (pattern: string, prefix: string): string => {
  if (!pattern.startsWith(prefix)) throw new Error(`Sequence schema: pattern ${pattern} does not start with ${prefix}`);
  return "^" + pattern.slice(prefix.length);
};

export interface Vocabulary {
  schemaUrl: string;
  minSteps: number;
  maxSteps: number;
  stepKinds: readonly string[];
  /** Keys a step of each kind may hold (all `do` alternatives merged). */
  stepKeys: Readonly<Record<string, readonly string[]>>;
  actions: readonly string[];
  /** `with` keys per action, in schema order. */
  actionParams: Readonly<Record<string, readonly string[]>>;
  /** Actions that take `variants`. */
  messagingActions: readonly string[];
  minVariants: number;
  maxVariants: number;
  idPattern: string;
  maxNoteChars: number;
  durationPattern: string;
  events: readonly string[];
  signalNamePattern: string;
  emitPattern: string;
  tagPattern: string;
  maxTagChars: number;
  reactions: readonly string[];
  post: string;
  booleanPredicates: readonly string[];
  standardFields: readonly string[];
  fieldOperators: readonly string[];
  extraKeyPattern: string;
  degrees: readonly unknown[];
  connectionsMin: number;
}

/** Reads the vocabulary from a Sequence v1 schema. Throws when the schema is not shaped like v1. */
export function vocabulary(schema: unknown): Vocabulary {
  assertKeywords(schema);
  const root = obj(schema, "$");
  const props = obj(root["properties"], "properties");
  const steps = obj(props["steps"], "properties.steps");
  const alts = arr(obj(steps["items"], "steps.items")["oneOf"], "steps.items.oneOf").map((a, i) => obj(a, `steps.items.oneOf[${i}]`));
  const propsOf = (a: Schema) => obj(a["properties"], "step.properties");
  const withProps = (a: Schema) => obj(obj(propsOf(a)["with"], "with")["properties"], "with.properties");

  const doAlts = alts.filter((a) => isObject(propsOf(a)["do"]));
  const kindOf = (a: Schema): string => {
    const req = arr(a["required"], "step.required");
    return str(req[1], "step.required[1]");
  };
  const stepKinds = [...new Set(alts.map(kindOf))];
  const stepKeys: Record<string, string[]> = {};
  for (const a of alts) {
    const k = kindOf(a);
    stepKeys[k] = [...new Set([...(stepKeys[k] ?? []), ...Object.keys(propsOf(a))])];
  }
  const actions: string[] = [];
  const actionParams: Record<string, string[]> = {};
  const messagingActions: string[] = [];
  let variants: Schema | undefined;
  for (const a of doAlts) {
    const p = propsOf(a);
    const action = str(obj(p["do"], "do")["const"], "do.const");
    actions.push(action);
    actionParams[action] = Object.keys(withProps(a));
    if (isObject(p["variants"])) {
      messagingActions.push(action);
      variants ??= p["variants"];
    }
  }
  if (!variants) throw new Error("Sequence schema: no action takes variants");
  const byKind = (k: string) => propsOf(alts.find((a) => kindOf(a) === k) ?? {});
  const stepId = obj(propsOf(alts[0]!)["id"], "id");
  const until = arr(obj(byKind("until")["until"], "until")["anyOf"], "until.anyOf").map((x) => obj(x, "until.anyOf[]"));
  const tag = obj(byKind("tag")["tag"], "tag");
  const reacting = doAlts.find((a) => "reaction" in withProps(a));
  if (!reacting) throw new Error("Sequence schema: no action takes a reaction");
  const reactWith = withProps(reacting);

  const preds = arr(obj(byKind("if")["if"], "if")["oneOf"], "if.oneOf").map((x) => obj(x, "if.oneOf[]"));
  const singleKey = (p: Schema): string | null => {
    const req = p["required"];
    return Array.isArray(req) && req.length === 1 && typeof req[0] === "string" ? req[0] : null;
  };
  const booleanPredicates = preds
    .filter((p) => {
      const k = singleKey(p);
      return k !== null && k.startsWith("contact.") && obj(propsOf(p)[k], k)["type"] === "boolean";
    })
    .map((p) => singleKey(p)!);
  const fields = preds.find((p) => singleKey(p) === null && isObject(p["properties"]) && Object.keys(propsOf(p)).length > 1);
  if (!fields) throw new Error("Sequence schema: no standard-field predicate");
  const standardFields = Object.keys(propsOf(fields)).map((k) => k.slice("contact.".length));
  const operand = obj(Object.values(propsOf(fields))[0], "field operand");
  const extra = preds.find((p) => isObject(p["patternProperties"]));
  if (!extra) throw new Error("Sequence schema: no contact.extra predicate");
  const extraKey = Object.keys(obj(extra["patternProperties"], "patternProperties"))[0]!;
  const degree = obj(preds.find((p) => singleKey(p) === "contact.degree")!["properties"], "degree")["contact.degree"];
  const degreeEq = obj(obj(arr(obj(degree, "degree")["oneOf"], "degree.oneOf")[0], "degree.eq")["properties"], "degree.eq.properties")["eq"];
  const connections = obj(propsOf(preds.find((p) => singleKey(p) === "contact.connections_gte")!)["contact.connections_gte"], "connections_gte");

  return {
    schemaUrl: str(root["$id"], "$id"),
    minSteps: num(steps["minItems"], "steps.minItems"),
    maxSteps: num(steps["maxItems"], "steps.maxItems"),
    stepKinds,
    stepKeys,
    actions,
    actionParams,
    messagingActions,
    minVariants: num(variants["minItems"], "variants.minItems"),
    maxVariants: num(variants["maxItems"], "variants.maxItems"),
    idPattern: after(str(stepId["pattern"], "id.pattern"), "^(?!end$)"),
    maxNoteChars: num(obj(propsOf(alts[0]!)["note"], "note")["maxLength"], "note.maxLength"),
    durationPattern: str(obj(byKind("wait")["wait"], "wait")["pattern"], "wait.pattern"),
    events: arr(until[0]!["enum"], "until.enum").map((e) => str(e, "until.enum[]")),
    signalNamePattern: after(str(until[1]!["pattern"], "until.pattern"), "^signal\\."),
    emitPattern: str(obj(byKind("emit")["emit"], "emit")["pattern"], "emit.pattern"),
    tagPattern: str(tag["pattern"], "tag.pattern"),
    maxTagChars: num(tag["maxLength"], "tag.maxLength"),
    reactions: arr(obj(reactWith["reaction"], "reaction")["enum"], "reaction.enum").map((e) => str(e, "reaction.enum[]")),
    post: str(obj(reactWith["post"], "post")["const"], "post.const"),
    booleanPredicates,
    standardFields,
    fieldOperators: Object.keys(obj(operand["properties"], "operand.properties")),
    extraKeyPattern: after(extraKey, "^contact\\.extra\\."),
    degrees: arr(obj(degreeEq, "degree.eq")["enum"], "degree.enum"),
    connectionsMin: num(connections["minimum"], "connections_gte.minimum"),
  };
}
