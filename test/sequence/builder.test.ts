/**
 * Constructors, operations, dynamic text, emission, canonical order and
 * performance, against the corpus documents the server wrote.
 */
import { describe, expect, it } from "vitest";
import { CurviateError, newStepId, Sequence, SEQUENCE_SCHEMA_URL, step, validateSequence } from "../../src/index.js";
import { corpus, sequenceOf } from "./_corpus.js";

const doc = (file: string) => sequenceOf(corpus.find(([f]) => f === file)![1]) as Record<string, unknown>;
const FR018 = doc("valid-fr018-normative-example.json");

/** The normative example written with constructors. */
const fr018 = () =>
  Sequence.create({ on_reply: "replied" }).add(
    step.do("visit", "profile.view", { note: "Warm-up visit before any contact." }),
    step.if("has_post", { "contact.posted_within": "14d" }, { then: "w_like", else: "w_invite" }),
    step.wait("w_like", "1d"),
    step.do("like", "post.react", { with: { post: "latest", newer_than: "14d", reaction: "like" } }),
    step.wait("w_invite", "1d"),
    step.do("invite", "invite.send", { with: { withdraw_after: "21d" }, note: "No note: blank invites are accepted slightly more often." }),
    step.until("accepted", "invite.accepted", { timeout: "21d", then: "w_opener", else: "end" }),
    step.wait("w_opener", "1d"),
    step.do("opener", "message.send", {
      variants: [
        { id: "opener_named", text: "Hi {{first_name}}, {{opener}}" },
        { id: "opener_plain", text: "{{opener}}" },
      ],
      with: { fallback: "Hi, glad we are connected. How do you handle LinkedIn outreach today?" },
      note: "No link in the first message.",
    }),
    step.until("r_opener", "message.replied", { timeout: "4d", then: "replied" }),
    step.do("followup", "message.send", {
      with: {
        text: "{{followup}}",
        fallback: "Quick follow-up in case this got buried. Happy to leave it here if the timing is off.",
      },
    }),
    step.until("r_followup", "message.replied", { timeout: "7d", then: "replied" }),
    step.tag("silent", "no-reply", { next: "end" }),
    step.tag("replied", "in-conversation", { next: "end" }),
  );

const thrown = (fn: () => unknown): CurviateError => {
  try {
    fn();
  } catch (err) {
    if (err instanceof CurviateError) return err;
    throw err;
  }
  throw new Error("expected a throw");
};

describe("constructors", () => {
  it("the normative example built with constructors emits it byte for byte", () => {
    expect(JSON.stringify(fr018().toDocument())).toBe(JSON.stringify(FR018));
  });

  it("adds no key the caller did not give: no with, no default", () => {
    expect(JSON.stringify(step.do("like", "post.react"))).toBe('{"id":"like","do":"post.react"}');
    expect(step.wait("w", "1d")).toEqual({ id: "w", wait: "1d" });
    expect(step.emit("e", "x.y")).toEqual({ id: "e", emit: "x.y" });
    expect(step.tag("t", "vip")).toEqual({ id: "t", tag: "vip" });
  });
});

describe("operations", () => {
  // Fall-through steps; every builder ends in `fin`, so each step stays reachable.
  const w = (id: string) => step.wait(id, "1d");
  const fin = step.emit("fin", "done", { next: "end" });

  it("each operation returns a new builder and leaves the receiver unchanged", () => {
    const b1 = Sequence.create({ on_reply: "end" }).add(w("a"), fin);
    const before = JSON.stringify(b1.toDocument());
    const b2 = b1.insertBefore("fin", w("b"));
    b1.onReply("a");
    b1.insertBefore("a", w("z"));
    b1.replace("a", w("y"));
    b1.remove("a");
    expect(JSON.stringify(b1.toDocument())).toBe(before);
    expect(b2.toDocument().steps.map((s) => s.id)).toEqual(["a", "b", "fin"]);
  });

  it("insertBefore lands at that index; replace swaps in place; remove drops", () => {
    const b = Sequence.create({ on_reply: "end" }).add(w("a"), w("w_invite"), fin);
    expect(b.insertBefore("w_invite", w("x"), w("y")).toDocument().steps.map((s) => s.id)).toEqual(["a", "x", "y", "w_invite", "fin"]);
    expect(b.replace("w_invite", w("opener")).toDocument().steps.map((s) => s.id)).toEqual(["a", "opener", "fin"]);
    expect(b.remove("a").toDocument().steps.map((s) => s.id)).toEqual(["w_invite", "fin"]);
  });

  it("acts on the first of duplicate ids", () => {
    const b = Sequence.fromDocument({ on_reply: "end", steps: [step.wait("a", "2d"), fin] }).insertBefore("fin", w("a"));
    expect(b.validate().errors).toMatchObject([{ path: "steps[1].id", rule: "duplicate step id a", code: "R3", pointer: "/steps/1/id" }]);
    expect(b.remove("a").toDocument().steps).toEqual([
      { id: "a", wait: "1d" },
      { id: "fin", emit: "done", next: "end" },
    ]);
  });

  it.each(["insertBefore", "replace", "remove"] as const)("%s on an unknown id throws INVALID_REQUEST, receiver unchanged", (op) => {
    const b = Sequence.create({ on_reply: "end" }).add(w("a"), fin);
    const err = thrown(() => (op === "remove" ? b.remove("nope") : op === "replace" ? b.replace("nope", w("x")) : b.insertBefore("nope", w("x"))));
    expect(err.code).toBe("INVALID_REQUEST");
    expect(err.message).toBe("unknown step id nope");
    expect(err.httpStatus).toBeUndefined();
    expect(err.userFixable).toBe(true);
    expect(err.retryLikelyToSucceed).toBe(false);
    expect(b.toDocument().steps.map((s) => s.id)).toEqual(["a", "fin"]);
  });

  it("a target added after its first reference validates", () => {
    const b = Sequence.create({ on_reply: "end" }).add(step.wait("a", "1d", { next: "fin" })).add(fin);
    expect(b.validate().errors).toEqual([]);
  });

  it("JSON.stringify(builder) equals JSON.stringify(toDocument()) and throws the same way", () => {
    const b = fr018();
    expect(JSON.stringify(b)).toBe(JSON.stringify(b.toDocument()));
    const bad = Sequence.fromDocument(FR018).remove("replied");
    expect(() => JSON.stringify(bad)).toThrow(CurviateError);
    expect(thrown(() => JSON.stringify(bad)).errors).toEqual(thrown(() => bad.toDocument()).errors);
  });

  it("a step object mutated after add does not reach the builder", () => {
    const s = { id: "a", wait: "1d", next: "end" };
    const b = Sequence.create({ on_reply: "end" }).add(s);
    s.wait = "2d";
    expect(b.toDocument().steps[0]).toEqual({ id: "a", wait: "1d", next: "end" });
  });
});

describe("dynamic text", () => {
  it("a string variable holding a variable without fallback compiles and throws R19 at toDocument()", () => {
    const text: string = "Hi {{contact.first_name}}";
    const b = Sequence.create({ on_reply: "end" }).add(step.do("m", "message.send", { with: { text }, next: "end" }));
    const err = thrown(() => b.toDocument());
    expect(err.code).toBe("SEQUENCE_INVALID");
    // the corpus's path and rule for this case (r19-missing-fallback.json)
    expect(err.errors).toEqual(corpus.find(([f]) => f === "r19-missing-fallback.json")![1].errors);
  });
});

describe("emission", () => {
  it("returns a fresh object each call; mutating one leaves the next unchanged", () => {
    const b = fr018();
    const one = b.toDocument();
    const two = b.toDocument();
    expect(one).toEqual(two);
    expect(one).not.toBe(two);
    one.steps.length = 0;
    expect(b.toDocument()).toEqual(two);
  });

  it("keeps values exactly: spaces in braces, newlines, emoji, null note, 0, in order, empty with", () => {
    const b = Sequence.create({ on_reply: "end" }).add(
      step.if("c0", { "contact.connections_gte": 0 }, { then: "deg", else: "end" }),
      step.if("deg", { "contact.degree": { in: [3, 2] } }, { then: "inv", else: "end" }),
      step.do("inv", "invite.send", { with: { note: null } }),
      step.do("fol", "profile.follow", { with: {} }),
      step.do("m", "message.send", { with: { text: "Hi {{ contact.first_name }},\nsee you 👋", fallback: "Hi,\nsee you 👋" }, note: undefined, next: "end" }),
    );
    const out = b.toDocument();
    expect(out.steps).toEqual([
      { id: "c0", if: { "contact.connections_gte": 0 }, then: "deg", else: "end" },
      { id: "deg", if: { "contact.degree": { in: [3, 2] } }, then: "inv", else: "end" },
      { id: "inv", do: "invite.send", with: { note: null } },
      { id: "fol", do: "profile.follow", with: {} },
      { id: "m", do: "message.send", with: { text: "Hi {{ contact.first_name }},\nsee you 👋", fallback: "Hi,\nsee you 👋" }, next: "end" },
    ]);
    expect("note" in out.steps[4]!).toBe(false);
    expect(out.$schema).toBe(SEQUENCE_SCHEMA_URL);
  });

  it("puts a step's event where the API serves it: after with, before then, else, next and note", () => {
    const out = Sequence.create({ on_reply: "end" })
      .add(
        step.do("invite", "invite.send", { note: "n", next: "t", with: { note: null }, event: "invite_sent" }),
        step.tag("t", "warm", { next: "end", event: "tagged" }),
      )
      .toDocument();
    expect(JSON.stringify(out.steps)).toBe(
      '[{"id":"invite","do":"invite.send","with":{"note":null},"event":"invite_sent","next":"t","note":"n"},{"id":"t","tag":"warm","event":"tagged","next":"end"}]',
    );
  });

  it("an empty builder throws R2; the normative example (W1 only) returns the document", () => {
    const err = thrown(() => Sequence.create({ on_reply: "end" }).toDocument());
    expect(err.errors).toMatchObject([{ path: "steps", rule: "required: an array of 1 to 100 steps", code: "R2" }]);
    const b = fr018();
    expect(b.validate().warnings.map((x) => x.code)).toEqual(["W1"]);
    expect(b.toDocument()).toEqual(FR018);
  });
});

describe("canonical order", () => {
  const templates = corpus.filter(([f]) => f.startsWith("template-")).map(([f, e]) => [f, sequenceOf(e)] as const);

  it.each([["valid-fr018-normative-example.json", FR018] as const, ...templates])("%s comes back byte for byte", (_, d) => {
    expect(JSON.stringify(Sequence.fromDocument(d).toDocument())).toBe(JSON.stringify(d));
  });

  it("a key-shuffled copy comes back deep-equal in canonical order", () => {
    const reversed = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reversed) : typeof v === "object" && v !== null ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)])) : v;
    const shuffled = reversed(FR018);
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(FR018));
    expect(JSON.stringify(Sequence.fromDocument(shuffled).toDocument())).toBe(JSON.stringify(FR018));
  });
});

describe("determinism", () => {
  // 100 steps padded to just under 256 KiB of compact JSON.
  const big = (() => {
    const steps = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      do: "message.send",
      with: { text: `Hi {{contact.first_name}} ${"x".repeat(2520)}`, fallback: "Hi" },
      ...(i === 99 ? { next: "end" } : {}),
    }));
    const d = { on_reply: "end", steps };
    const pad = 256 * 1024 - new TextEncoder().encode(JSON.stringify(d)).length;
    steps[0]!.with.text += "y".repeat(pad);
    return d;
  })();

  it("the fixture is 100 steps at exactly 256 KiB and valid", () => {
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBe(256 * 1024);
    expect(validateSequence(big)).toEqual({ errors: [], warnings: [] });
  });

  it("two runs give identical bytes and error order", () => {
    const broken = { ...big, steps: big.steps.map((s, i) => (i % 10 === 0 ? { ...s, with: { text: "{{Nope}}" } } : s)) };
    expect(JSON.stringify(validateSequence(broken))).toBe(JSON.stringify(validateSequence(broken)));
    expect(validateSequence(broken).errors.length).toBeGreaterThan(10);
    expect(JSON.stringify(Sequence.fromDocument(big).toDocument())).toBe(JSON.stringify(Sequence.fromDocument(big).toDocument()));
  });
});

describe("newStepId: the id a new step of a kind gets (the dashboard editor's rule)", () => {
  const d = { on_reply: "end", steps: [{ id: "message", do: "message.send", variants: [{ id: "message_2", text: "a" }, { id: "b", text: "b" }] }, { id: "visit", do: "profile.view" }] };
  const long = "a".repeat(40);
  it.each([
    ["first of its kind", {}, "message.send", undefined, "message"],
    ["next free in the series, variant ids taken too", d, "message.send", undefined, "message_3"],
    ["the kind's own base", d, "post.react", undefined, "like"],
    ["each step kind", {}, "until", undefined, "accepted"],
    ["a wait before a step", d, "wait", "visit", "w_visit"],
    ["a wait with no step after", d, "wait", undefined, "wait"],
    ["cut to 40 characters", {}, "wait", long, `w_${long}`.slice(0, 40)],
    ["cut to 40 with its suffix", { steps: [{ id: `w_${long}`.slice(0, 40) }] }, "wait", long, `w_${long}`.slice(0, 38) + "_2"],
    ["not a document: nothing taken", "x", "tag", undefined, "tag"],
  ] as const)("%s", (_, doc, kind, before, expected) => {
    expect(newStepId(doc, kind, before)).toBe(expected);
  });
});
