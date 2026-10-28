/**
 * The compiler-style keys every rule and warning adds to `{path, rule}`: a
 * fixed `hint` (filled with the offending token where the rule names one) and
 * the `docs_url` of its entry. The API's own table, copied; the vendored corpus
 * pins every hint the SDK emits, so a change on either side reds the corpus
 * test. Hints never hold a Contact value.
 */

const SEQUENCE_RULES_DOCS_URL = "https://docs.curviate.com/reference/sequence-rules";

const HINTS: Record<string, (token: string) => string> = {
  R1: () => "Keep only $schema, on_reply and steps at the top level; $schema, when present, is https://docs.curviate.com/schemas/sequence/v1.json.",
  R2: () => "Keep the document to 1 to 100 steps and 256 KiB; split a longer flow into two Motions.",
  R3: () => "Give each step a unique id: lowercase letters, digits and _, starting with a letter, at most 40 characters, not end.",
  R4: () => "Give the step exactly one of do, wait, until, if, emit or tag.",
  R5: () => "Remove the key: each step kind takes only its own keys, and the sending Account is chosen with settings.assign.",
  R6: () => 'Point the exit at a step id of this document, or at "end".',
  R7: () => "Add then: the step to go to when the event happens or the condition is true.",
  R8: () => 'Break the loop: point one exit of the cycle at a later step or at "end".',
  R9: () => "Lead an exit of another step here, or delete the step.",
  R10: () => 'End the last step explicitly: set its exits to a step id or "end".',
  R11: () => 'Set on_reply to a step id or "end".',
  R12: (t) => `Use a duration between ${t}.`,
  R13: () => "Use an action from the list and only the parameters it takes, with values of their type.",
  R14: () => "Wait for invite.accepted, message.replied, message.read or event.<name>, and give a timeout.",
  R15: () => "Use one predicate key per object with its typed operand; chain if steps instead of all or any. account.* and message.* work in if steps only.",
  R16: () => "Write a variable as {{first_name}}, {{my_first_name}} or a custom field {{opener}}; the long forms {{contact.first_name}}, {{contact.extra.opener}} and {{account.first_name}} work too.",
  R17: () => "Remove the part after | and add a variable-free fallback on the step instead.",
  R18: () => "Write a variable with double braces, like {{first_name}}, or remove the braces.",
  R19: () => 'Add a variable-free fallback: with.fallback, with.note_fallback (or "drop") on an invitation, "skip" on a comment.',
  R20: () => "Use a Contact variable in the comment, for example a custom field {{comment}} your AI writes per Contact.",
  R21: () => "Set withdraw_after between 14d and 180d, for example 21d.",
  R22: () => "Shorten the text to the limit (variables are not counted) or use fewer variables.",
  R23: () => "Give the step exactly 2 variants (A/B) with ids unique in the document, or one text in with.",
  R24: () => "Name the event with lowercase letters, digits, _ and ., starting with a letter, like reply.received; a Tag is 1 to 64 characters without , or ;.",
  W1: () => "If the merge is intended, keep it; otherwise give the jumping step its own continuation.",
  W5: () => "Remove the follow step: the invitation already follows the person.",
  W6: () => "Send an invitation on this path before waiting for its acceptance.",
  W7: () => "Write the comment per Contact, for example in a custom field {{comment}}.",
  W8: () => "Keep the link for a later message.",
  W9: () => "Motion variables are deprecated: write the text in place, or use a custom field.",
  W11: (t) => `Did you mean ${t}?`,
  W12: () => "Send a message on this path before checking whether it was seen.",
  W13: (t) => `Use ${t} instead.`,
};

/** `hint` and `docs_url` of a rule or warning code. */
export function ruleHelp(code: string, token = ""): { hint: string; docs_url: string } {
  const hint = HINTS[code];
  if (!hint) throw new Error(`no hint for ${code}`);
  return { hint: hint(token), docs_url: `${SEQUENCE_RULES_DOCS_URL}#${code.toLowerCase()}` };
}
