/**
 * Step constructors (sdk/009 FR-002): one per kind, arguments
 * `(id, <kind value>, fields)`, `fields` keys exactly the document's
 * (`with`, `variants`, `next`, `then`, `else`, `timeout`, `note`). Each returns
 * the plain step object and adds no key the caller did not give: no default is
 * written.
 *
 * Literal arguments are checked at compile time (G4, G6-G12): a typo'd key, a
 * variable without its fallback, `{FIRST_NAME}`-style placeholders inside
 * `{{...}}`, a malformed duration, the reserved id `"end"`. A widened `string`
 * passes the type checker and is checked by `validateSequence`.
 */
import type {
  Action,
  CheckDo,
  CheckDuration,
  CheckId,
  DoFields,
  Predicate,
  SequenceEvent,
  SequenceTypeError,
} from "./types.js";

type Exact<T, Allowed extends PropertyKey> = { [K in Exclude<keyof T, Allowed>]: SequenceTypeError<`unknown key ${K & string}`> };
type Flow = { next?: string; note?: string };
type Branch = { then: string; else?: string; note?: string };
type Timed = Branch & { timeout: string };
type TimeoutOf<F> = F extends { readonly timeout: infer D } ? D : never;

function build(id: string, kind: string, value: unknown, fields: object | undefined): Record<string, unknown> {
  return { id, [kind]: value, ...fields };
}

/** Step constructors, one per kind. */
export const step: {
  /**
   * A `do` step: run one action. `fields.with` takes the action's parameters,
   * `fields.variants` (messaging actions) 2 to 5 A/B texts, `else` the step
   * taken when the action cannot run. A literal text using a variable needs
   * its fallback; a comment always needs one.
   *
   * @example
   * step.do("opener", "message.send", {
   *   with: { text: "Hi {{contact.first_name}}, thanks for connecting.", fallback: "Hi, thanks for connecting." },
   *   next: "end",
   * });
   */
  do<const Id extends string, const F extends DoFields<"post.comment">>(
    id: Id & CheckId<Id>,
    action: "post.comment",
    fields: F & CheckDo<"post.comment", F>,
  ): { id: Id; do: "post.comment" } & F;
  do<const Id extends string, const A extends Exclude<Action, "post.comment">, const F extends DoFields<A> = {}>(
    id: Id & CheckId<Id>,
    action: A,
    fields?: F & CheckDo<A, F>,
  ): { id: Id; do: A } & F;
  /**
   * A `wait` step: calendar time, `<number><m|h|d>`, 1m to 365d.
   *
   * @example
   * step.wait("pause", "2d");
   */
  wait<const Id extends string, const D extends string, const F extends Flow = {}>(
    id: Id & CheckId<Id>,
    duration: D & CheckDuration<D>,
    fields?: F & Exact<F, keyof Flow>,
  ): { id: Id; wait: D } & F;
  /**
   * An `until` step: wait for an event, at most `timeout`; `then` on the event,
   * `else` (or the next step) on timeout.
   *
   * @example
   * step.until("w_accept", "invite.accepted", { timeout: "14d", then: "opener", else: "end" });
   */
  until<const Id extends string, const E extends SequenceEvent, const F extends Timed>(
    id: Id & CheckId<Id>,
    event: E,
    fields: F & Exact<F, keyof Timed> & { timeout: CheckDuration<TimeoutOf<F>> },
  ): { id: Id; until: E } & F;
  /**
   * An `if` step: branch on one predicate about the Contact or the sending Account.
   *
   * @example
   * step.if("is_connected", { "contact.connected": true }, { then: "opener", else: "invite" });
   */
  if<const Id extends string, const F extends Branch>(
    id: Id & CheckId<Id>,
    predicate: Predicate,
    fields: F & Exact<F, keyof Branch>,
  ): { id: Id; if: Predicate } & F;
  /**
   * An `emit` step: send a `motion.signal` webhook with this name.
   *
   * @example
   * step.emit("notify", "reply.received", { next: "end" });
   */
  emit<const Id extends string, const F extends Flow = {}>(
    id: Id & CheckId<Id>,
    name: string,
    fields?: F & Exact<F, keyof Flow>,
  ): { id: Id; emit: string } & F;
  /**
   * A `tag` step: add a Tag to the Contact.
   *
   * @example
   * step.tag("mark", "replied", { next: "end" });
   */
  tag<const Id extends string, const F extends Flow = {}>(
    id: Id & CheckId<Id>,
    name: string,
    fields?: F & Exact<F, keyof Flow>,
  ): { id: Id; tag: string } & F;
} = {
  do: (id: string, action: string, fields?: object) => build(id, "do", action, fields),
  wait: (id: string, duration: string, fields?: object) => build(id, "wait", duration, fields),
  until: (id: string, event: string, fields: object) => build(id, "until", event, fields),
  if: (id: string, predicate: Predicate, fields: object) => build(id, "if", predicate, fields),
  emit: (id: string, name: string, fields?: object) => build(id, "emit", name, fields),
  tag: (id: string, name: string, fields?: object) => build(id, "tag", name, fields),
} as never;
