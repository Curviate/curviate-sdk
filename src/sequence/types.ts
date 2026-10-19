/**
 * Sequence types (sdk/009 FR-001, FR-004). Principle: under-report, never
 * over-report. A document the server accepts always compiles; checks that
 * need a literal type apply to literals only, and a widened `string` (or a
 * builder loaded with `fromDocument`) is left to `validateSequence` at run
 * time.
 *
 * Vocabulary comes from the generated OpenAPI types wherever they express it
 * (actions, reactions, standard fields, boolean predicates); the one union
 * typed by hand (events: the generated type widens them to `string`) is
 * pinned to the embedded schema by `test/sequence/types.test.ts`.
 */
import type { components } from "../generated/types.js";

/** The Sequence document as the API types it (`components["schemas"]["SequenceDocument"]`). */
export type SequenceDocument = components["schemas"]["SequenceDocument"];

type GenStep = SequenceDocument["steps"][number];
type GenDo = Extract<GenStep, { do: string }>;
type GenIf = Extract<GenStep, { if: unknown }>["if"];
type GenWith<A extends Action> = NonNullable<Extract<GenDo, { do: A }>["with"]>;

/** Every action a `do` step can run. */
export type Action = GenDo["do"];
/** The messaging actions: the ones that take `variants` and a fallback. */
export type MessagingAction = Extract<GenDo, { variants?: unknown }>["do"];
/** `post.react` reactions. */
export type Reaction = NonNullable<GenWith<"post.react">["reaction"]>;
/** Events an `until` step waits for; `signal.<name>` is a custom signal. */
export type SequenceEvent = "invite.accepted" | "message.replied" | "message.read" | `signal.${string}`;

/** Single-key predicate members of the generated union (the standard-field and extra members excluded). */
type GenSingle = GenIf extends infer P ? (P extends unknown ? (string extends keyof P ? never : keyof P extends "not" ? never : P) : never) : never;
/** The standard Contact fields a predicate or a variable may name. */
export type StandardField = Extract<keyof Extract<GenSingle, { "contact.first_name"?: unknown }>, `contact.${string}`> extends `contact.${infer F}`
  ? F
  : never;
/** Predicates whose operand is `true` or `false`. */
export type BooleanPredicate = GenSingle extends infer P ? (P extends unknown ? (keyof P extends infer K ? (K extends keyof P ? (P[K] extends boolean ? K : never) : never) : never) : never) : never;

/** `<number><m|h|d>`, like `30d`. */
export type Duration = `${number}${"m" | "h" | "d"}`;
type Scalar = string | number | boolean;
type Degree = 1 | 2 | 3;

/** One operator on a Contact field. */
export type FieldOperand = { eq: Scalar } | { neq: Scalar } | { in: readonly Scalar[] } | { contains: string } | { exists: boolean };
type BasePredicate =
  | { [K in BooleanPredicate]: { [P in K]: boolean } }[BooleanPredicate]
  | { "contact.degree": { eq: Degree } | { in: readonly Degree[] } }
  | { "contact.connections_gte": number }
  | { "contact.posted_within": string }
  | { "contact.tag": string }
  | { [F in StandardField]: { [P in `contact.${F}`]: FieldOperand } }[StandardField]
  | { [key: `contact.extra.${string}`]: FieldOperand };
/** An `if` predicate: one key, `contact.*` or `account.*`, optionally wrapped in one `not`. */
export type Predicate = BasePredicate | { not: BasePredicate };

/** `with` of each action, keys as the document writes them. */
export interface ActionParams {
  "profile.view": Record<string, never>;
  "profile.follow": Record<string, never>;
  "profile.unfollow": Record<string, never>;
  "invite.withdraw": Record<string, never>;
  "skill.endorse": Record<string, never>;
  "invite.send": { note?: string | null; note_fallback?: string; withdraw_after?: string };
  "message.send": { text?: string; fallback?: string };
  "inmail.send": { subject?: string; text?: string; fallback?: { subject: string; text: string } };
  "post.react": { post?: "latest"; newer_than?: string; reaction?: Reaction };
  "post.comment": { post?: "latest"; newer_than?: string; text?: string; fallback?: string };
}
/** One A/B variant of a messaging step. */
export type Variant<A extends Action = Action> = A extends "inmail.send" ? { id: string; subject: string; text: string } : { id: string; text: string };
type Variants<A extends Action> = readonly [Variant<A>, Variant<A>, ...Variant<A>[]];

type Kind = "do" | "wait" | "until" | "if" | "emit" | "tag";
type Only<K extends Kind> = { [P in Exclude<Kind, K>]?: never };

type DoStepOf<A extends Action> = {
  id: string;
  do: A;
  with?: ActionParams[A];
  variants?: A extends MessagingAction ? Variants<A> : never;
  next?: string;
  else?: string;
  note?: string;
} & Only<"do">;

/** One Sequence step: exactly one kind key (`do`, `wait`, `until`, `if`, `emit`, `tag`). */
export type SequenceStep =
  | { [A in Action]: DoStepOf<A> }[Action]
  | ({ id: string; wait: string; next?: string; note?: string } & Only<"wait">)
  | ({ id: string; until: SequenceEvent; timeout: string; then: string; else?: string; note?: string } & Only<"until">)
  | ({ id: string; if: Predicate; then: string; else?: string; note?: string } & Only<"if">)
  | ({ id: string; emit: string; next?: string; note?: string } & Only<"emit">)
  | ({ id: string; tag: string; next?: string; note?: string } & Only<"tag">);

type DeepMutable<T> = T extends readonly (infer E)[] ? DeepMutable<E>[] : T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;

/** What `toDocument()` returns: a valid Sequence document, assignable to {@link SequenceDocument}. */
export type SequenceDocumentOut = {
  $schema?: "https://docs.curviate.com/schemas/sequence/v1.json";
  on_reply: string;
  steps: DeepMutable<SequenceStep>[];
};

// ---------------------------------------------------------------------------
// Literal checks (G4, G6-G11). Each yields `unknown` when the value passes, or
// a requirement the value cannot meet, so the error lands on the offending
// property. A message reads `Sequence: ...`.

/** A compile error carrying its reason. */
export type SequenceTypeError<M extends string> = `Sequence: ${M}`;
type IsLiteral<S> = S extends string ? (string extends S ? false : true) : false;

// ponytail: trims space, tab, CR, LF only; another Unicode space inside braces
// over-reports, widen Trim when that ever shows up in a real document.
type WS = " " | "\n" | "\t" | "\r";
type Trim<S extends string> = S extends `${WS}${infer R}` ? Trim<R> : S extends `${infer L}${WS}` ? Trim<L> : S;
/** Inner text of every closed `{{...}}`; a candidate holding a brace is left to run time. */
type Inners<S extends string, Acc = never> = S extends `${string}{{${infer I}}}${infer Rest}`
  ? Inners<Rest, I extends `${string}${"{" | "}"}${string}` ? Acc : Acc | I>
  : Acc;
type HasVar<S> = IsLiteral<S> extends true ? ([Inners<S & string>] extends [never] ? false : true) : false;
type VarOk<I extends string> = I extends `${string}|${string}`
  ? false
  : Trim<I> extends `contact.extra.${infer K}`
    ? K extends "" ? false : true
    : Trim<I> extends `contact.${infer F}`
      ? F extends StandardField ? true : false
      : Trim<I> extends `account.${"first_name" | "last_name" | "full_name"}`
        ? true
        : Trim<I> extends `motion.${infer K}`
          ? K extends "" ? false : true
          : false;
type BadVar<S extends string> = Inners<S> extends infer I ? (I extends string ? (VarOk<I> extends true ? never : I) : never) : never;
/** G10: every `{{...}}` of a literal text is a v1 variable. */
type CheckVars<S> = IsLiteral<S> extends true
  ? [BadVar<S & string>] extends [never]
    ? unknown
    : SequenceTypeError<`{{${BadVar<S & string>}}} is not a v1 variable; use contact.<field>, contact.extra.<key>, account.first_name|last_name|full_name or motion.<key>, without a default`>
  : unknown;
/** G8: a literal fallback holds no variable. */
type CheckFallback<S> = HasVar<S> extends true ? SequenceTypeError<"a fallback must not contain a variable"> : CheckVars<S>;
/** G11: a literal duration is `<number><m|h|d>`. */
export type CheckDuration<S> = IsLiteral<S> extends true ? (S extends Duration ? unknown : SequenceTypeError<"a duration is a number then m, h or d, like 30d">) : unknown;
/** G12: a literal step id is not `"end"`. */
export type CheckId<S> = S extends "end" ? SequenceTypeError<'"end" is reserved'> : unknown;

type Get<T, K extends PropertyKey> = T extends { readonly [P in K]?: infer V } ? V : undefined;
type VariantTexts<F> = Get<F, "variants"> extends readonly (infer V)[] ? Get<V, "text"> | Get<V, "subject"> : never;
/** The literal texts of a messaging step: `with` text fields and every variant's. */
type Texts<A extends Action, W> =
  | (A extends "invite.send" ? Get<W, "note"> : A extends "inmail.send" ? Get<W, "subject"> | Get<W, "text"> : Get<W, "text">)
  | never;
type AnyVar<T> = T extends unknown ? HasVar<T> : never;

type Exact<T, Allowed extends PropertyKey> = { [K in Exclude<keyof T, Allowed>]: SequenceTypeError<`unknown key ${K & string}`> };

type DoKeys = "with" | "variants" | "next" | "else" | "note";
type TextFields = "text" | "subject" | "note";

/** G4, G6-G11 on the `fields` of `step.do`. */
export type CheckDo<A extends Action, F> = Exact<F, A extends MessagingAction ? DoKeys : Exclude<DoKeys, "variants">> &
  (F extends { readonly with: infer W } ? { with: Exact<W, keyof ActionParams[A]> & CheckWith<A, F, W> } : unknown) &
  (A extends MessagingAction ? CheckMessaging<A, F> : unknown);

type CheckWith<A extends Action, F, W> = {
  [K in keyof W]: K extends "fallback"
    ? A extends "inmail.send"
      ? { [P in keyof W[K]]: CheckFallback<W[K][P]> }
      : CheckFallback<W[K]>
    : K extends "note_fallback"
      ? CheckFallback<W[K]>
      : K extends "withdraw_after" | "newer_than"
        ? CheckDuration<W[K]>
        : K extends TextFields
          ? (Get<F, "variants"> extends undefined ? unknown : W[K] extends null ? unknown : SequenceTypeError<"use either variants or the text in with, not both">) &
            CheckVars<W[K]> &
            (A extends "post.comment" ? (IsLiteral<W[K]> extends true ? (W[K] extends `${string}{{${string}` ? unknown : SequenceTypeError<"a comment must use a contact variable">) : unknown) : unknown)
          : unknown;
};

type CheckMessaging<A extends Action, F> = (Get<F, "variants"> extends readonly unknown[]
  ? { variants: { [I in keyof Get<F, "variants">]: { [P in keyof Get<F, "variants">[I]]: P extends "id" ? unknown : CheckVars<Get<F, "variants">[I][P]> } } }
  : unknown) &
  // G7: a variable in a literal text needs its fallback; a comment always needs one.
  (A extends "post.comment"
    ? { with: { fallback: string } }
    : true extends AnyVar<Texts<A, Get<F, "with">> | VariantTexts<F>>
      ? { with: A extends "invite.send" ? { note_fallback: string } : A extends "inmail.send" ? { fallback: { subject: string; text: string } } : { fallback: string } }
      : unknown);

/** Fields of `step.do`, per action. */
export type DoFields<A extends Action> = {
  with?: ActionParams[A];
  variants?: A extends MessagingAction ? Variants<A> : never;
  next?: string;
  else?: string;
  note?: string;
};

/** The step ids and targets a step adds to a builder (G12, G13). */
export type Summary<S> = S extends { readonly id: infer I }
  ? { id: I; t: Lit<Get<S, "next"> | Get<S, "then"> | Get<S, "else">> }
  : never;
/** Literal strings only: a widened `string` is never tracked. */
export type Lit<T> = T extends string ? (string extends T ? never : T) : never;
