/**
 * sdk/009 TS-004, TS-005, TS-006 (AC-004, AC-005, AC-006): compile-time
 * guarantees G1-G14. `pnpm typecheck` checks this file: each
 * `@ts-expect-error` case must fail to compile (an unused directive is itself
 * an error, so a guarantee that stops holding reds the typecheck), and each
 * compiling twin differs from it in exactly one property.
 *
 * Compile-only cases live in functions that never run; the runtime tests
 * below check that the literal documents emit what the corpus holds.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { Sequence, step, type SequenceDocument, type SequenceDocumentOut } from "../../src/index.js";
import type { components } from "../../src/generated/types.js";
import type { ActionParams, SequenceEvent } from "../../src/sequence/types.js";
import { SEQUENCE_SCHEMA_V1 } from "../../src/sequence/schema.js";
import { vocabulary } from "../../src/sequence/vocab.js";
import { corpus, sequenceOf } from "./_corpus.js";

const end = { next: "end" } as const;

/* eslint-disable @typescript-eslint/no-unused-vars */
function guarantees(): void {
  // G1: Sequence.create requires on_reply
  // @ts-expect-error G1
  Sequence.create({});
  Sequence.create({ on_reply: "end" });

  // G2: zero or two kinds cannot be built
  // @ts-expect-error G2
  Sequence.create({ on_reply: "end" }).add({ id: "x", wait: "1d", emit: "a.b" });
  Sequence.create({ on_reply: "end" }).add({ id: "x", wait: "1d" });
  // @ts-expect-error G2 (no kind)
  Sequence.create({ on_reply: "end" }).add({ id: "x" });

  // G3: actions, events, reactions, predicate keys are closed
  // @ts-expect-error G3 action
  step.do("s", "post.save");
  step.do("s", "profile.view");
  // @ts-expect-error G3 event
  step.until("u", "invite.acepted", { timeout: "1d", then: "end" });
  step.until("u", "invite.accepted", { timeout: "1d", then: "end" });
  step.until("u", "signal.paid", { timeout: "1d", then: "end" });
  // @ts-expect-error G3 reaction
  step.do("l", "post.react", { with: { reaction: "wow" } });
  step.do("l", "post.react", { with: { reaction: "love" } });
  // @ts-expect-error G3 predicate key
  step.if("i", { "contact.frist_name": { eq: "Ada" } }, { then: "end" });
  step.if("i", { "contact.first_name": { eq: "Ada" } }, { then: "end" });
  step.if("i", { "contact.extra.plan": { eq: "pro" } }, { then: "end" });
  step.if("i", { not: { "account.premium": true } }, { then: "end" });

  // G4: with keys per action; no step-level by; post only "latest"
  // @ts-expect-error G4 unknown with key
  step.do("m", "message.send", { with: { text: "Hi", subjet: "x" } });
  step.do("m", "message.send", { with: { text: "Hi" } });
  // @ts-expect-error G4 step-level by
  step.do("m", "message.send", { with: { text: "Hi" }, by: "acc_1" });
  // @ts-expect-error G4 post
  step.do("l", "post.react", { with: { post: "first" } });
  step.do("l", "post.react", { with: { post: "latest" } });

  // G5: until needs timeout and then; if needs then
  // @ts-expect-error G5 until without timeout
  step.until("u", "invite.accepted", { then: "end" });
  // @ts-expect-error G5 until without then
  step.until("u", "invite.accepted", { timeout: "14d" });
  // @ts-expect-error G5 if without then
  step.if("i", { "contact.connected": true }, { else: "end" });
  step.if("i", { "contact.connected": true }, { then: "end" });

  // G6: variants >= 2, messaging only, exclusive with the text
  // @ts-expect-error G6 one variant
  step.do("v", "message.send", { variants: [{ id: "a", text: "x" }] });
  step.do("v", "message.send", { variants: [{ id: "a", text: "x" }, { id: "b", text: "y" }] });
  // @ts-expect-error G6 text and variants
  step.do("v", "message.send", { with: { text: "x" }, variants: [{ id: "a", text: "x" }, { id: "b", text: "y" }] });
  // @ts-expect-error G6 variants on a non-messaging action
  step.do("v", "profile.view", { variants: [{ id: "a", text: "x" }, { id: "b", text: "y" }] });
  step.do("i", "invite.send", { with: { note: null }, variants: [{ id: "a", text: "x" }, { id: "b", text: "y" }] });

  // G7: a literal text with a variable needs its fallback; a comment always does
  // @ts-expect-error G7 message
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name}}" } });
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name}}", fallback: "Hi" } });
  // @ts-expect-error G7 variant
  step.do("m", "message.send", { variants: [{ id: "a", text: "Hi {{contact.first_name}}" }, { id: "b", text: "Hey" }] });
  step.do("m", "message.send", { variants: [{ id: "a", text: "Hi {{contact.first_name}}" }, { id: "b", text: "Hey" }], with: { fallback: "Hi" } });
  // @ts-expect-error G7 invite note
  step.do("i", "invite.send", { with: { note: "Hi {{contact.first_name}}" } });
  step.do("i", "invite.send", { with: { note: "Hi {{contact.first_name}}", note_fallback: "drop" } });
  // @ts-expect-error G7 inmail subject
  step.do("im", "inmail.send", { with: { subject: "For {{contact.company}}", text: "Hello" } });
  step.do("im", "inmail.send", { with: { subject: "For {{contact.company}}", text: "Hello", fallback: { subject: "Hi", text: "Hello" } } });
  // @ts-expect-error G7 comment
  step.do("c", "post.comment", { with: { text: "{{contact.extra.comment}}" } });
  step.do("c", "post.comment", { with: { text: "{{contact.extra.comment}}", fallback: "skip" } });

  // G8: a literal fallback holds no variable
  // @ts-expect-error G8
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name}}", fallback: "Hi {{contact.last_name}}" } });
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name}}", fallback: "Hi there" } });

  // G9: a literal comment uses a variable
  // @ts-expect-error G9
  step.do("c", "post.comment", { with: { text: "Great post", fallback: "skip" } });
  step.do("c", "post.comment", { with: { text: "Great post on {{contact.extra.topic}}", fallback: "skip" } });

  // G10: each {{...}} is a v1 variable, no default
  // @ts-expect-error G10 camelCase
  step.do("m", "message.send", { with: { text: "Hi {{firstName}}", fallback: "Hi" } });
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name}}", fallback: "Hi" } });
  // @ts-expect-error G10 default
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name | default:'x'}}", fallback: "Hi" } });
  step.do("m", "message.send", { with: { text: "Hi {{ contact.first_name }}", fallback: "Hi" } });
  step.do("m", "message.send", { with: { text: "Hi {{account.full_name}} {{motion.offer}}", fallback: "Hi" } });

  // G11: durations are <number><m|h|d>
  // @ts-expect-error G11 week
  step.wait("w", "1w");
  // @ts-expect-error G11 words
  step.wait("w", "1 day");
  step.wait("w", "1d");
  // @ts-expect-error G11 timeout
  step.until("u", "message.replied", { timeout: "2w", then: "end" });
  // @ts-expect-error G11 withdraw_after
  step.do("i", "invite.send", { with: { withdraw_after: "3 weeks" } });
  step.do("i", "invite.send", { with: { withdraw_after: "21d" } });

  // G12: id "end" or a literal id already added
  // @ts-expect-error G12 end
  step.wait("end", "1d");
  step.wait("fin", "1d");
  // @ts-expect-error G12 duplicate in one call
  Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d"), step.wait("a", "2d", end));
  Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d"), step.wait("b", "2d", end));
  // @ts-expect-error G12 duplicate across calls
  Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d")).add(step.wait("a", "2d", end));

  // G13: targets may name a later step; toDocument() needs every literal target added
  // @ts-expect-error G13 then
  Sequence.create({ on_reply: "end" }).add(step.until("u", "message.replied", { timeout: "4d", then: "replied" })).toDocument();
  Sequence.create({ on_reply: "end" }).add(step.until("u", "message.replied", { timeout: "4d", then: "end" })).toDocument();
  Sequence.create({ on_reply: "end" })
    .add(step.until("u", "message.replied", { timeout: "4d", then: "replied" }))
    .add(step.tag("replied", "in-conversation", end))
    .toDocument();
  // @ts-expect-error G13 on_reply
  Sequence.create({ on_reply: "thanks" }).add(step.wait("w", "1d", end)).toDocument();
  // @ts-expect-error G13 after remove of the target
  Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d", { next: "b" }), step.wait("b", "1d", end)).remove("b").toDocument();
  Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d", { next: "b" }), step.wait("b", "1d", end)).remove("a").toDocument();
}

/** AC-004's compiling cases past the type checker's reach: widened values, remove, an unclosed {{. */
function underReport(): void {
  const target: string = "later";
  const id: string = "dynamic";
  const text: string = "Hi {{contact.first_name}}";
  Sequence.create({ on_reply: target }).add(step.wait(id, "1d", { next: target })).toDocument();
  step.do("m", "message.send", { with: { text } });
  // remove of the only step referencing an undeclared id: toDocument compiles again
  Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d", { next: "ghost" }), step.wait("b", "1d", end)).remove("a").toDocument();
  // an unclosed {{ triggers neither G7 nor G8
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name" } });
  step.do("m", "message.send", { with: { text: "Hi {{contact.first_name", fallback: "Hi {{" } });
  // a loaded builder takes any target
  Sequence.fromDocument({}).add(step.wait("x", "1d", { next: "loaded_step" })).toDocument();
  // object literals are steps too
  Sequence.create({ on_reply: "end" }).add({ id: "x", do: "message.send", with: { text: "hi" }, next: "end" }).toDocument();
}

/** AC-005: the documents as literal constructor calls, a 100-step chain, an 8,000-character text with 30 variables. */
const literal = {
  "fr018": () =>
    Sequence.create({ on_reply: "replied" }).add(
      step.do("visit", "profile.view", {"note":"Warm-up visit before any contact."}),
      step.if("has_post", {"contact.posted_within":"14d"}, {"then":"w_like","else":"w_invite"}),
      step.wait("w_like", "1d"),
      step.do("like", "post.react", {"with":{"post":"latest","newer_than":"14d","reaction":"like"}}),
      step.wait("w_invite", "1d"),
      step.do("invite", "invite.send", {"with":{"withdraw_after":"21d"},"note":"No note: blank invites are accepted slightly more often."}),
      step.until("accepted", "invite.accepted", {"timeout":"21d","then":"w_opener","else":"end"}),
      step.wait("w_opener", "1d"),
      step.do("opener", "message.send", {"variants":[{"id":"opener_named","text":"Hi {{contact.first_name}}, {{contact.extra.opener}}"},{"id":"opener_plain","text":"{{contact.extra.opener}}"}],"with":{"fallback":"Hi, glad we are connected. How do you handle LinkedIn outreach today?"},"note":"No link in the first message."}),
      step.until("r_opener", "message.replied", {"timeout":"4d","then":"replied"}),
      step.do("followup", "message.send", {"with":{"text":"{{contact.extra.followup}}","fallback":"Quick follow-up in case this got buried. Happy to leave it here if the timing is off."}}),
      step.until("r_followup", "message.replied", {"timeout":"7d","then":"replied"}),
      step.tag("silent", "no-reply", {"next":"end"}),
      step.tag("replied", "in-conversation"),
      step.emit("handoff", "reply.received", {"next":"end"}),
    ),
  "connect-and-converse": () =>
    Sequence.create({ on_reply: "replied" }).add(
      step.do("visit", "profile.view", {"note":"Warm-up visit before any contact."}),
      step.if("has_post", {"contact.posted_within":"14d"}, {"then":"w_like","else":"w_invite"}),
      step.wait("w_like", "1d"),
      step.do("like", "post.react", {"with":{"post":"latest","newer_than":"14d","reaction":"like"}}),
      step.wait("w_invite", "1d"),
      step.do("invite", "invite.send", {"with":{"withdraw_after":"21d"},"note":"No note: blank invites are accepted slightly more often."}),
      step.until("accepted", "invite.accepted", {"timeout":"21d","then":"w_opener","else":"end"}),
      step.wait("w_opener", "1d"),
      step.do("opener", "message.send", {"variants":[{"id":"opener_named","text":"Hi {{contact.first_name}}, {{contact.extra.opener}}"},{"id":"opener_plain","text":"{{contact.extra.opener}}"}],"with":{"fallback":"Hi, glad we are connected. How do you handle LinkedIn outreach today?"},"note":"No link in the first message."}),
      step.until("r_opener", "message.replied", {"timeout":"4d","then":"replied"}),
      step.do("followup", "message.send", {"with":{"text":"{{contact.extra.followup}}","fallback":"Quick follow-up in case this got buried. Happy to leave it here if the timing is off."}}),
      step.until("r_followup", "message.replied", {"timeout":"7d","then":"replied"}),
      step.tag("silent", "no-reply", {"next":"end"}),
      step.tag("replied", "in-conversation"),
      step.emit("handoff", "reply.received", {"next":"end"}),
    ),
  "engage-then-connect": () =>
    Sequence.create({ on_reply: "replied" }).add(
      step.do("react", "post.react", {"with":{"newer_than":"60d"},"else":"w_invite"}),
      step.wait("w_comment", "10m"),
      step.do("comment", "post.comment", {"with":{"newer_than":"60d","text":"{{contact.extra.comment}}","fallback":"skip"},"note":"The agent writes one comment per Contact; no product mention."}),
      step.wait("w_invite", "30m"),
      step.do("invite", "invite.send", {"with":{"withdraw_after":"21d"}}),
      step.until("accepted", "invite.accepted", {"timeout":"21d","then":"w_opener","else":"end"}),
      step.wait("w_opener", "1d"),
      step.do("opener", "message.send", {"with":{"text":"Hi {{contact.first_name}}, {{contact.extra.opener}}","fallback":"Hi, thanks for connecting. What are you working on at the moment?"}}),
      step.until("r_opener", "message.replied", {"timeout":"5d","then":"replied"}),
      step.do("followup", "message.send", {"with":{"text":"{{contact.extra.followup}}","fallback":"Following up once in case this got buried. All good if now is not the time."}}),
      step.until("r_followup", "message.replied", {"timeout":"7d","then":"replied"}),
      step.tag("silent", "no-reply", {"next":"end"}),
      step.tag("replied", "in-conversation"),
      step.emit("handoff", "reply.received", {"next":"end"}),
    ),
  "nurture-connections": () =>
    Sequence.create({ on_reply: "replied" }).add(
      step.if("is_connected", {"contact.connected":true}, {"then":"dm","else":"not_connected"}),
      step.tag("not_connected", "not-connected", {"next":"end"}),
      step.do("dm", "message.send", {"with":{"text":"{{contact.extra.dm}}","fallback":"Hi, it has been a while. What are you focused on these days?"}}),
      step.until("r_dm", "message.replied", {"timeout":"5d","then":"replied"}),
      step.do("followup", "message.send", {"with":{"text":"{{contact.extra.followup}}","fallback":"No rush on this, just wanted to check in once more."}}),
      step.until("r_followup", "message.replied", {"timeout":"7d","then":"replied","else":"end"}),
      step.tag("replied", "in-conversation"),
      step.emit("handoff", "reply.received", {"next":"end"}),
    ),
  chain: () =>
    Sequence.create({ on_reply: "end" }).add(
    step.wait("s0", "1d"),
    step.wait("s1", "1d"),
    step.wait("s2", "1d"),
    step.wait("s3", "1d"),
    step.wait("s4", "1d"),
    step.wait("s5", "1d"),
    step.wait("s6", "1d"),
    step.wait("s7", "1d"),
    step.wait("s8", "1d"),
    step.wait("s9", "1d"),
    step.wait("s10", "1d"),
    step.wait("s11", "1d"),
    step.wait("s12", "1d"),
    step.wait("s13", "1d"),
    step.wait("s14", "1d"),
    step.wait("s15", "1d"),
    step.wait("s16", "1d"),
    step.wait("s17", "1d"),
    step.wait("s18", "1d"),
    step.wait("s19", "1d"),
    step.wait("s20", "1d"),
    step.wait("s21", "1d"),
    step.wait("s22", "1d"),
    step.wait("s23", "1d"),
    step.wait("s24", "1d"),
    step.wait("s25", "1d"),
    step.wait("s26", "1d"),
    step.wait("s27", "1d"),
    step.wait("s28", "1d"),
    step.wait("s29", "1d"),
    step.wait("s30", "1d"),
    step.wait("s31", "1d"),
    step.wait("s32", "1d"),
    step.wait("s33", "1d"),
    step.wait("s34", "1d"),
    step.wait("s35", "1d"),
    step.wait("s36", "1d"),
    step.wait("s37", "1d"),
    step.wait("s38", "1d"),
    step.wait("s39", "1d"),
    step.wait("s40", "1d"),
    step.wait("s41", "1d"),
    step.wait("s42", "1d"),
    step.wait("s43", "1d"),
    step.wait("s44", "1d"),
    step.wait("s45", "1d"),
    step.wait("s46", "1d"),
    step.wait("s47", "1d"),
    step.wait("s48", "1d"),
    step.wait("s49", "1d"),
    step.wait("s50", "1d"),
    step.wait("s51", "1d"),
    step.wait("s52", "1d"),
    step.wait("s53", "1d"),
    step.wait("s54", "1d"),
    step.wait("s55", "1d"),
    step.wait("s56", "1d"),
    step.wait("s57", "1d"),
    step.wait("s58", "1d"),
    step.wait("s59", "1d"),
    step.wait("s60", "1d"),
    step.wait("s61", "1d"),
    step.wait("s62", "1d"),
    step.wait("s63", "1d"),
    step.wait("s64", "1d"),
    step.wait("s65", "1d"),
    step.wait("s66", "1d"),
    step.wait("s67", "1d"),
    step.wait("s68", "1d"),
    step.wait("s69", "1d"),
    step.wait("s70", "1d"),
    step.wait("s71", "1d"),
    step.wait("s72", "1d"),
    step.wait("s73", "1d"),
    step.wait("s74", "1d"),
    step.wait("s75", "1d"),
    step.wait("s76", "1d"),
    step.wait("s77", "1d"),
    step.wait("s78", "1d"),
    step.wait("s79", "1d"),
    step.wait("s80", "1d"),
    step.wait("s81", "1d"),
    step.wait("s82", "1d"),
    step.wait("s83", "1d"),
    step.wait("s84", "1d"),
    step.wait("s85", "1d"),
    step.wait("s86", "1d"),
    step.wait("s87", "1d"),
    step.wait("s88", "1d"),
    step.wait("s89", "1d"),
    step.wait("s90", "1d"),
    step.wait("s91", "1d"),
    step.wait("s92", "1d"),
    step.wait("s93", "1d"),
    step.wait("s94", "1d"),
    step.wait("s95", "1d"),
    step.wait("s96", "1d"),
    step.wait("s97", "1d"),
    step.wait("s98", "1d"),
    step.wait("s99", "1d", { next: "end" }),
    ),
  long: () =>
    Sequence.create({ on_reply: "end" }).add(
      step.do("m", "message.send", { with: { text: "{{contact.extra.k0}} {{contact.extra.k1}} {{contact.extra.k2}} {{contact.extra.k3}} {{contact.extra.k4}} {{contact.extra.k5}} {{contact.extra.k6}} {{contact.extra.k7}} {{contact.extra.k8}} {{contact.extra.k9}} {{contact.extra.k10}} {{contact.extra.k11}} {{contact.extra.k12}} {{contact.extra.k13}} {{contact.extra.k14}} {{contact.extra.k15}} {{contact.extra.k16}} {{contact.extra.k17}} {{contact.extra.k18}} {{contact.extra.k19}} {{contact.extra.k20}} {{contact.extra.k21}} {{contact.extra.k22}} {{contact.extra.k23}} {{contact.extra.k24}} {{contact.extra.k25}} {{contact.extra.k26}} {{contact.extra.k27}} {{contact.extra.k28}} {{contact.extra.k29}} xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", fallback: "Hi" }, next: "end" }),
    ),
};

const file = (f: string) => sequenceOf(corpus.find(([n]) => n === f)![1]);

describe("literal documents (AC-005)", () => {
  it.each([
    ["fr018", "valid-fr018-normative-example.json"],
    ["connect-and-converse", "template-connect-and-converse.json"],
    ["engage-then-connect", "template-engage-then-connect.json"],
    ["nurture-connections", "template-nurture-connections.json"],
  ] as const)("%s built from literal constructor calls emits the corpus document", (name, f) => {
    const { $schema: _, ...want } = file(f) as Record<string, unknown>;
    const { $schema: __, ...got } = literal[name]().toDocument();
    expect(got).toEqual(want);
  });

  it("the 100-step chain and the 8,000-character text are valid", () => {
    expect(literal.chain().toDocument().steps).toHaveLength(100);
    const { text } = (literal.long().toDocument().steps[0] as { with: { text: string } }).with;
    expect(text).toHaveLength(8000);
    expect(text.match(/\{\{/g)).toHaveLength(30);
  });
});

describe("types (G14, pinned vocabulary)", () => {
  it("toDocument() is assignable to the generated SequenceDocument; post.save is not", () => {
    expectTypeOf<SequenceDocumentOut>().toMatchTypeOf<SequenceDocument>();
    expectTypeOf<SequenceDocument>().toEqualTypeOf<components["schemas"]["SequenceDocument"]>();
    const bad = { on_reply: "end", steps: [{ id: "s", do: "post.save" as const }] };
    // @ts-expect-error G14 negative control
    const doc: SequenceDocument = bad;
    void doc;
  });

  it("the hand-typed unions equal the schema's vocabulary", () => {
    const v = vocabulary(SEQUENCE_SCHEMA_V1);
    const EVENTS = ["invite.accepted", "message.replied", "message.read"] as const;
    expectTypeOf<(typeof EVENTS)[number]>().toEqualTypeOf<Exclude<SequenceEvent, `signal.${string}`>>();
    expect(v.events).toEqual(EVENTS);
    type GenWith<A extends keyof ActionParams> = NonNullable<Extract<SequenceDocument["steps"][number], { do: A }>["with"]>;
    expectTypeOf<keyof ActionParams["invite.send"]>().toEqualTypeOf<keyof GenWith<"invite.send">>();
    expectTypeOf<keyof ActionParams["message.send"]>().toEqualTypeOf<keyof GenWith<"message.send">>();
    expectTypeOf<keyof ActionParams["inmail.send"]>().toEqualTypeOf<keyof GenWith<"inmail.send">>();
    expectTypeOf<keyof ActionParams["post.react"]>().toEqualTypeOf<keyof GenWith<"post.react">>();
    expectTypeOf<keyof ActionParams["post.comment"]>().toEqualTypeOf<keyof GenWith<"post.comment">>();
    expectTypeOf<keyof ActionParams>().toEqualTypeOf<SequenceDocument["steps"][number] extends infer S ? (S extends { do: infer A } ? A : never) : never>();
    for (const a of Object.keys(v.actionParams)) expect(v.actions).toContain(a);
  });
});

void guarantees;
void underReport;
