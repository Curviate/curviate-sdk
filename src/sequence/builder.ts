/**
 * The immutable Sequence builder (sdk/009 FR-003, FR-006, FR-008).
 *
 * Every operation returns a new builder and leaves the receiver unchanged.
 * Operations never validate (forward references and work in progress are
 * legal); `validate`, `toDocument` and `fromDocument` do, with the same rules
 * the API applies.
 */
import { CurviateError, type CurviateErrorDetail } from "../errors.js";
import { canonical } from "./order.js";
import { SEQUENCE_SCHEMA_URL } from "./schema.js";
import type { Lit, SequenceDocumentOut, SequenceStep, SequenceTypeError, Summary } from "./types.js";
import { validateSequence, type SequenceValidationResult } from "./validate.js";

/** What a builder knows at compile time: each literal step id with the literal targets its step names. */
type Track = { id: unknown; t: unknown };
type Ids<S> = S extends Track ? S["id"] : never;
type Targets<S> = S extends Track ? S["t"] : never;
type Unresolved<S, R> = Exclude<Targets<S> | R, Ids<S> | "end">;
type Get<T, K extends PropertyKey> = T extends { readonly [P in K]?: infer V } ? V : undefined;
/** Literal ids `steps` would duplicate (among themselves, with `taken`, or `"end"`). */
type Dups<T extends readonly unknown[], Taken> = T extends readonly [infer H, ...infer Rest]
  ? [Lit<Get<H, "id">>] extends [never]
    ? Dups<Rest, Taken>
    : Lit<Get<H, "id">> extends Taken
      ? Lit<Get<H, "id">> | Dups<Rest, Taken>
      : Dups<Rest, Taken | Lit<Get<H, "id">>>
  : never;
type NoDups<T extends readonly unknown[], Taken> = [Dups<T, Taken | "end">] extends [never]
  ? unknown
  : { readonly "duplicate step id": SequenceTypeError<`duplicate or reserved step id ${Dups<T, Taken | "end"> & string}`> };
type Steps<T extends readonly unknown[]> = Summary<T[number]>;
/** After an edit by a non-literal id the builder cannot know which step went: stop checking targets. */
type Edited<S, I extends string, Add, R extends string, O extends boolean> = string extends I
  ? Sequence<S | Add, R, true>
  : Sequence<Exclude<S, { id: I }> | Add, R, O>;

/** The `this` a builder must have for `toDocument()` to compile (G13). */
export type ResolvedSequence<S, R extends string, O extends boolean> = O extends true
  ? Sequence<S, R, O>
  : [Unresolved<S, R>] extends [never]
    ? Sequence<S, R, O>
    : SequenceTypeError<`unknown step ${Unresolved<S, R> & string}; add it or target "end"`>;

interface Doc {
  $schema?: string;
  on_reply?: string;
  steps: readonly unknown[];
}

const refuse = (errors: CurviateErrorDetail[]): CurviateError =>
  new CurviateError({
    code: "SEQUENCE_INVALID",
    message: `${errors[0]!.path}: ${errors[0]!.rule}${errors.length > 1 ? ` and ${errors.length - 1} more` : ""}`,
    userFixable: true,
    retryLikelyToSucceed: false,
    errors,
  });

/** A plain JSON copy: what the builder holds never aliases what the caller holds. */
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * A Sequence under construction. Its output, `toDocument()`, is exactly the
 * api/040 Sequence document the API stores; raw JSON stays a first-class
 * alternative everywhere.
 *
 * Type parameters track literal step ids and targets so a jump to a missing
 * step fails to compile at `toDocument()`; you never write them.
 *
 * @example
 * import { Sequence, step } from "@curviate/sdk";
 *
 * const seq = Sequence.create({ on_reply: "end" })
 *   .add(
 *     step.do("invite", "invite.send", { with: { note: null } }),
 *     step.until("w_accept", "invite.accepted", { timeout: "14d", then: "opener", else: "end" }),
 *     step.do("opener", "message.send", {
 *       with: { text: "Hi {{contact.first_name}}, thanks for connecting.", fallback: "Hi, thanks for connecting." },
 *       next: "end",
 *     }),
 *   );
 * const document = seq.toDocument();
 */
export class Sequence<S = never, R extends string = never, O extends boolean = false> {
  readonly #doc: Doc;

  private constructor(doc: Doc) {
    this.#doc = doc;
  }

  /**
   * An empty builder. `on_reply` (a step id or `"end"`) is required: decide
   * what a reply does first. `$schema` is set to {@link SEQUENCE_SCHEMA_URL}.
   *
   * @example
   * const seq = Sequence.create({ on_reply: "end" });
   */
  static create<const T extends string>(init: { on_reply: T }): Sequence<never, Lit<T>, false> {
    return new Sequence({ $schema: SEQUENCE_SCHEMA_URL, on_reply: init.on_reply, steps: [] });
  }

  /**
   * Loads a parsed Sequence document (a fetched Motion's `sequence`, a version's
   * `document`, JSON you wrote). Valid → a builder whose `toDocument()`
   * deep-equals the input, keys in canonical order. Invalid → throws
   * `SEQUENCE_INVALID` with every error. A string is not parsed. The input is
   * never mutated.
   *
   * @example
   * const motion = await curviate.motions.get("mot_123");
   * const edited = Sequence.fromDocument(motion.sequence).remove("bump");
   */
  static fromDocument(value: unknown): Sequence<{ id: string; t: never }, never, true> {
    const { errors } = validateSequence(value);
    if (errors.length) throw refuse(errors);
    return new Sequence(canonical(value as Record<string, unknown>) as unknown as Doc);
  }

  #with(steps: readonly unknown[], on_reply = this.#doc.on_reply): never {
    const doc: Doc = { ...this.#doc, steps };
    if (on_reply !== undefined) doc.on_reply = on_reply;
    return new Sequence(doc) as never;
  }

  #index(id: string): number {
    const i = this.#doc.steps.findIndex((s) => typeof s === "object" && s !== null && (s as { id?: unknown }).id === id);
    if (i < 0) {
      throw new CurviateError({ code: "INVALID_REQUEST", message: `unknown step id ${id}`, userFixable: true, retryLikelyToSucceed: false });
    }
    return i;
  }

  /**
   * Appends steps in order: constructor output or object literals.
   *
   * @example
   * const next = seq.add(step.wait("pause", "2d"), step.emit("done", "sequence.done", { next: "end" }));
   */
  add<const T extends readonly SequenceStep[]>(...steps: T & NoDups<T, Lit<Ids<S>>>): Sequence<S | Steps<T>, R, O> {
    return this.#with([...this.#doc.steps, ...clone(steps as readonly unknown[])]);
  }

  /**
   * Inserts steps before the step `id` (the first, with duplicate ids).
   * Throws `INVALID_REQUEST` `unknown step id <id>` when no step has that id.
   *
   * @example
   * const next = seq.insertBefore("opener", step.wait("pause", "1d"));
   */
  insertBefore<const T extends readonly SequenceStep[]>(id: string, ...steps: T & NoDups<T, Lit<Ids<S>>>): Sequence<S | Steps<T>, R, O> {
    const i = this.#index(id);
    const all = [...this.#doc.steps];
    all.splice(i, 0, ...clone(steps as readonly unknown[]));
    return this.#with(all);
  }

  /**
   * Swaps the step `id` in place; the new step may carry another id.
   * Throws `INVALID_REQUEST` when no step has that id.
   *
   * @example
   * const next = seq.replace("pause", step.wait("pause", "3d"));
   */
  replace<const I extends string, const T extends SequenceStep>(
    id: I,
    step: T & NoDups<[T], Exclude<Lit<Ids<S>>, I>>,
  ): Edited<S, I, Summary<T>, R, O> {
    const i = this.#index(id);
    const all = [...this.#doc.steps];
    all[i] = clone(step);
    return this.#with(all);
  }

  /**
   * Drops the step `id`. Throws `INVALID_REQUEST` when no step has that id.
   *
   * @example
   * const next = seq.remove("pause");
   */
  remove<const I extends string>(id: I): Edited<S, I, never, R, O> {
    const i = this.#index(id);
    return this.#with(this.#doc.steps.filter((_, k) => k !== i));
  }

  /**
   * Sets `on_reply`: the step a reply interrupts to, or `"end"`.
   *
   * @example
   * const next = seq.onReply("thanks");
   */
  onReply<const T extends string>(target: T): Sequence<S, Lit<T>, O> {
    return this.#with(this.#doc.steps, target);
  }

  /**
   * Every error and warning the API would report for this document, offline.
   * Never throws.
   *
   * @example
   * const { errors, warnings } = seq.validate();
   */
  validate(): SequenceValidationResult {
    return validateSequence(this.#doc);
  }

  /**
   * The Sequence document: a fresh plain object in canonical key order.
   * Throws `SEQUENCE_INVALID` (every error, as the API would) when invalid;
   * warnings never block. Does not compile while a literal target names no
   * added step.
   *
   * @example
   * const document = seq.toDocument();
   */
  toDocument(this: ResolvedSequence<S, R, O>): SequenceDocumentOut;
  toDocument(): SequenceDocumentOut {
    const { errors } = validateSequence(this.#doc);
    if (errors.length) throw refuse(errors);
    return canonical(this.#doc as unknown as Record<string, unknown>) as unknown as SequenceDocumentOut;
  }

  /**
   * `JSON.stringify(builder)` equals `JSON.stringify(builder.toDocument())`
   * and throws the same way.
   *
   * @example
   * const body = JSON.stringify({ name: "Q4", sequence: seq });
   */
  toJSON(): SequenceDocumentOut {
    return (this as Sequence).toDocument();
  }
}
