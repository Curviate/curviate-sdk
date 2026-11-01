// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
export const SEQUENCE_RULES_DOCS_URL = "https://docs.curviate.com/reference/sequence-rules";
export type RuleCode = `R${number}` | `W${number}`;
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
    R25: () => "Put save and save_to_contact on an until event.<name> step, 1 to 20 entries each: save names are lowercase (not id), save_to_contact keys are custom fields or email.",
    R26: () => 'Write the path with dots, items[0] and ["a.b"], like lead.score, at most 256 characters.',
    R27: (t) => (t ? `Use ${t}.` : "Save the value with save on an until event.<name> step first; a save_to_contact key reads as {{contact.extra.<key>}}."),
    R28: () => 'Use gte or lte with a number, like {"gte": 50}, on enrollment.<key> or contact.extra.<key>.',
    R29: () => "Save a field inside the object or list, or compare that value with eq, neq or exists instead.",
    W1: () => "If the merge is intended, keep it; otherwise give the jumping step its own continuation.",
    W2: () => "Add a sending Account with Sales Navigator or Recruiter, or remove the InMail step.",
    W3: () => 'Set note_fallback to "drop" so invitations go on without a note once the noted ones are used up.',
    W4: () => "Wait for message.replied instead, or add a sending Account that does not use Recruiter.",
    W5: () => "Remove the follow step: the invitation already follows the person.",
    W6: () => "Send an invitation on this path before waiting for its acceptance.",
    W7: () => "Write the comment per Contact, for example in a custom field {{comment}}.",
    W8: () => "Keep the link for a later message.",
    W9: () => "Motion variables are deprecated: write the text in place, or use a custom field.",
    W10: () => "Retired: never emitted. The Sequence's on_reply decides what a reply does.",
    W11: (t) => `Did you mean ${t}?`,
    W12: () => "Send a message on this path before checking whether it was seen.",
    W13: (t) => `Use ${t} instead.`,
    W14: () => "Use the value in a message or an if step, or remove it from save if no webhook template sends it.",
    W16: (t) => `Use ${t} to read the saved value.`,
    W17: () => "Set settings.assign to auto, the default: it prefers an Account already connected and invites everyone else. Keep already_connected only for a Motion that writes to existing Connections.",
};
const TITLES: Record<string, string> = {
    R1: "Top-level keys and $schema",
    R2: "Step count and document size",
    R3: "Step ids",
    R4: "Exactly one kind per step",
    R5: "Keys a step kind takes",
    R6: "Targets exist",
    R7: "then on until and if",
    R8: "No cycle",
    R9: "No unreachable step",
    R10: "Explicit endings",
    R11: "on_reply",
    R12: "Durations and their bounds",
    R13: "Actions and their parameters",
    R14: "Events and timeout",
    R15: "Predicates",
    R16: "Variable syntax and names",
    R17: "No variable defaults or filters",
    R18: "No single-brace placeholder",
    R19: "Fallbacks",
    R20: "A comment uses a Contact variable",
    R21: "withdraw_after",
    R22: "Text lengths and variable count",
    R23: "Variants (A/B)",
    R24: "Event and Tag names",
    R25: "save and save_to_contact",
    R26: "Field paths",
    R27: "Enrollment values are saved before use",
    R28: "Number comparisons",
    R29: "Saved values against the sample",
    W1: "Merge point",
    W2: "InMail without Sales Navigator or Recruiter",
    W3: "Invitation note on a basic Account",
    W4: "Read receipts on Recruiter",
    W5: "Follow after an invitation",
    W6: "Acceptance without an invitation",
    W7: "Comment personalised by name only",
    W8: "Link in the first message",
    W9: "Motion variable checked by the server only",
    W10: "on_reply unused (retired)",
    W11: "Custom field that looks like a typo",
    W12: "Seen check before any message",
    W13: "Deprecated form accepted for now",
    W14: "Saved value never used",
    W16: "Saved value read as a Contact field",
    W17: "Invitation in a Connected only Motion",
};
export const SEQUENCE_RULE_CODES: readonly string[] = Object.keys(HINTS);
export function sequenceRuleDocs(): {
    code: string;
    anchor: string;
    title: string;
    hint: string;
}[] {
    const examples: Record<string, string> = { R12: "1m and 365d, for example 1d", W11: "first_name", W13: "the form the warning names", W16: "{{enrollment.score}}" };
    return SEQUENCE_RULE_CODES.map((code) => ({ code, anchor: code.toLowerCase(), title: TITLES[code]!, hint: ruleHelp(code, examples[code]).hint }));
}
export function ruleHelp(code: string, token = ""): {
    hint: string;
    docs_url: string;
} {
    const hint = HINTS[code];
    if (!hint)
        throw new Error(`no hint for ${code}`);
    return { hint: hint(token), docs_url: `${SEQUENCE_RULES_DOCS_URL}#${code.toLowerCase()}` };
}
const PROBLEMS: Record<string, {
    sentence: string;
    short: string;
}> = {
    R1: { sentence: "The document has a top-level key the API does not take.", short: "Unknown key" },
    R2: { sentence: "The Sequence has too many steps or is too large.", short: "Too long" },
    R3: { sentence: "A step has a missing or repeated id.", short: "Needs an id" },
    R4: { sentence: "This step is not exactly one kind of step.", short: "Needs setup: pick a kind" },
    R5: { sentence: "This step has a setting its kind does not take.", short: "Unknown setting" },
    R6: { sentence: "This step leads to a step that does not exist.", short: "Leads nowhere" },
    R7: { sentence: "Choose where this step goes on its \u2713 branch.", short: "Needs setup: the \u2713 branch" },
    R8: { sentence: "These steps loop back on themselves.", short: "Loops back" },
    R9: { sentence: "Nothing leads to this step.", short: "Not reached" },
    R10: { sentence: "This path runs off the end.", short: "Needs an ending" },
    R11: { sentence: "When they reply leads to a step that does not exist.", short: "Leads nowhere" },
    R12: { sentence: "The delay or timeout is out of range.", short: "Needs setup: a duration" },
    R13: { sentence: "A setting of this step is missing or not valid.", short: "Needs setup" },
    R14: { sentence: "Choose what to wait for and for how long.", short: "Needs setup: what to wait for" },
    R15: { sentence: "The condition is not one Curviate can check.", short: "Needs setup: the condition" },
    R16: { sentence: "A variable is not one Curviate knows.", short: "Unknown variable" },
    R17: { sentence: "A variable carries a default or a filter; use a fallback instead.", short: "Variable with a default" },
    R18: { sentence: "Single braces are not a variable.", short: "Single-brace placeholder" },
    R19: { sentence: "Add a fallback for Contacts missing a field.", short: "Needs a fallback" },
    R20: { sentence: "A comment must use a Contact variable.", short: "Needs a Contact variable" },
    R21: { sentence: "Withdraw after must be between 14 and 180 days.", short: "Needs setup: withdraw after" },
    R22: { sentence: "The text is over its limit.", short: "Text too long" },
    R23: { sentence: "A/B needs exactly two variants.", short: "Needs setup: variants" },
    R24: { sentence: "The event or Tag name is not valid.", short: "Needs setup: a valid name" },
    R25: { sentence: "Saved values belong on a wait for an incoming event, at most 20.", short: "Needs setup: saved values" },
    R26: { sentence: "A field path is not valid.", short: "Needs setup: a field path" },
    R27: { sentence: "This uses a value no step saves.", short: "Value not saved" },
    R28: { sentence: "At least and at most compare numbers on saved values and custom fields.", short: "Needs setup: a number" },
    R29: { sentence: "The incoming sample has no plain value at this field.", short: "Not a plain value" },
    W1: { sentence: "Two paths merge here.", short: "Merge point" },
    W2: { sentence: "InMail needs a sending Account with Sales Navigator or Recruiter.", short: "No InMail Account" },
    W3: { sentence: "Basic Accounts send only a few invitation notes a month.", short: "Few notes on Basic" },
    W4: { sentence: "Read receipts are not available on Recruiter.", short: "No read receipts" },
    W5: { sentence: "The invitation already follows the person.", short: "Follows twice" },
    W6: { sentence: "This waits for acceptance with no invitation before it.", short: "No invitation before" },
    W7: { sentence: "The comment is personalised by name only.", short: "Name-only comment" },
    W8: { sentence: "A link in the first message gets fewer replies.", short: "Link in first message" },
    W9: { sentence: "Motion variables are deprecated.", short: "Motion variable" },
    W10: { sentence: "Retired: no longer reported.", short: "Retired" },
    W11: { sentence: "A custom field looks like a typo.", short: "Possible typo" },
    W12: { sentence: "This checks for a seen message before any message is sent.", short: "Nothing seen yet" },
    W13: { sentence: "This form is deprecated.", short: "Deprecated form" },
    W14: { sentence: "A saved value is never used.", short: "Unused value" },
    W16: { sentence: "This reads a Contact field, not the saved value.", short: "Contact field, not the value" },
    W17: { sentence: "Connected only skips anyone not already connected, so the invitation in this Sequence never runs for them. Choose Best fit in Accounts to invite them.", short: "Invitation never runs" },
};
export const SEQUENCE_PROBLEM_CODES: readonly string[] = Object.keys(PROBLEMS);
const fieldWords = (k: string) => {
    const t = (k.startsWith("my_") ? `your ${k.slice(3)}` : k).replace(/_/g, " ");
    return t.charAt(0).toUpperCase() + t.slice(1);
};
const SHORT_TEXT: Record<string, string> = { text: "Write the message", note: "Write the note", subject: "Write the subject" };
export function problemWords(e: {
    code: string;
    path: string;
    rule: string;
}): {
    sentence: string;
    short: string;
    fix?: {
        from: string;
        to: string;
        label: string;
    };
} {
    const p = PROBLEMS[e.code];
    if (!p)
        throw new Error(`no words for ${e.code}`);
    if (e.code === "W11") {
        const m = /^(\{\{[^{}]*\}\}) is read as a custom field; did you mean ([a-z_]+)\?/.exec(e.rule);
        if (m) {
            const words = fieldWords(m[2]!);
            return { sentence: `${m[1]} is read as a custom field; did you mean ${words}?`, short: p.short, fix: { from: m[1]!, to: `{{${m[2]}}}`, label: `Use ${words}` } };
        }
    }
    const leaf = e.path.split(".").pop() ?? "";
    if (e.code === "R13" && e.rule === "must be non-empty text" && SHORT_TEXT[leaf])
        return { sentence: `${SHORT_TEXT[leaf]}.`, short: SHORT_TEXT[leaf]! };
    return { ...p };
}
