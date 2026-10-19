/**
 * The Sequence document v1 JSON Schema, embedded so it works offline.
 * `schema.v1.json` is written by `pnpm gen:types` from
 * `components.schemas.SequenceDocument` of the deployed OpenAPI document and
 * guarded by `pnpm check:types`; never edit it by hand.
 */
import schema from "./schema.v1.json";

/** Where the v1 schema is published; the `$schema` value a builder writes. */
export const SEQUENCE_SCHEMA_URL = "https://docs.curviate.com/schemas/sequence/v1.json" as const;

/** A JSON Schema object, read-only. */
export type JsonSchema = { readonly [keyword: string]: unknown };

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * The published Sequence v1 JSON Schema (draft 2020-12), the same object the
 * API serves at {@link SEQUENCE_SCHEMA_URL}. Deep-frozen: point an editor or
 * a JSON Schema tool at it, mutation throws in strict mode.
 *
 * @example
 * import { SEQUENCE_SCHEMA_V1 } from "@curviate/sdk";
 * console.log(SEQUENCE_SCHEMA_V1["$id"]); // https://docs.curviate.com/schemas/sequence/v1.json
 */
export const SEQUENCE_SCHEMA_V1: JsonSchema = deepFreeze(schema as JsonSchema);
