/**
 * The copy guard's pattern sets, tested one entry at a time.
 *
 * A pattern set is only as strong as its weakest entry, and a set is uniquely
 * good at hiding its own breakage: a pattern that silently stops matching still
 * reports zero hits over clean sources, which is indistinguishable from a pass.
 * This is not hypothetical. While this guard was being written, an editing pass
 * overwrote the emoji pattern with a duplicate of the zero-width one, and
 * `check:copy` kept exiting 0. Every entry therefore gets a literal that proves
 * it fires, and the sample list is asserted to cover the set exactly, so adding
 * a pattern without a sample fails here rather than shipping untested.
 */

import { describe, it, expect } from "vitest";
// The module exports its pattern sets and does nothing on import; the scan only
// runs when the file is invoked as a script.
// @ts-expect-error - plain .mjs tooling script, no type declarations
import { TYPOGRAPHIC, REGISTER } from "../scripts/check-copy.mjs";

type Tell = { label: string; pattern: RegExp; fix?: string };

const TYPOGRAPHIC_SAMPLES: Array<[string, string]> = [
  ["em dash (U+2014)", "—"],
  ["en dash (U+2013)", "–"],
  ["horizontal bar (U+2015)", "―"],
  ["curly single quote (U+2018/U+2019)", "’"],
  ["curly double quote (U+201C/U+201D)", "“"],
  ["ellipsis glyph (U+2026)", "…"],
  ["non-breaking or exotic space", " "],
  ["zero-width or invisible character", "​"],
  ["arrow (U+2190-U+21FF)", "→"],
  ["minus sign (U+2212)", "−"],
  ["multiplication sign (U+00D7)", "×"],
  ["inequality glyph (U+2264/U+2265)", "≤"],
  ["prime (U+2032/U+2033)", "′"],
  ["decorative check or cross glyph", "✅"],
];

function matchLabels(set: Tell[], text: string): string[] {
  return set
    .filter((t) => {
      t.pattern.lastIndex = 0;
      return t.pattern.test(text);
    })
    .map((t) => t.label);
}

describe("check:copy pattern sets", () => {
  it("has a sample for every blocking pattern, and no orphan samples", () => {
    expect(TYPOGRAPHIC_SAMPLES.map(([label]) => label)).toEqual(
      (TYPOGRAPHIC as Tell[]).map((t) => t.label),
    );
  });

  it.each(TYPOGRAPHIC_SAMPLES)("blocks %s", (label, char) => {
    expect(matchLabels(TYPOGRAPHIC as Tell[], `published copy ${char} here`)).toContain(label);
  });

  it("every blocking entry names a plain-ASCII replacement", () => {
    for (const tell of TYPOGRAPHIC as Tell[]) {
      expect(tell.fix, `${tell.label} must tell the author what to use instead`).toBeTruthy();
      // A "fix" containing the character it replaces would send the author in a
      // circle. The advice has to be reachable from a keyboard.
      expect(/^[\x20-\x7E]*$/.test(tell.fix!), `${tell.label} fix must be ASCII`).toBe(true);
    }
  });

  it("leaves ordinary ASCII prose alone", () => {
    const clean =
      "Connect a LinkedIn account, then send a message. Ranges read 1-100; " +
      'arrows read -> and quotes read "like this", not otherwise.';
    expect(matchLabels(TYPOGRAPHIC as Tell[], clean)).toEqual([]);
  });

  it("does not block the legal marks", () => {
    // (c) / (R) / (TM) are Extended_Pictographic but are legal marks, not
    // decoration; the README's licence line carries one.
    for (const mark of ["©", "®", "™"]) {
      expect(matchLabels(TYPOGRAPHIC as Tell[], `MIT ${mark} Redmer Holding GmbH`)).toEqual([]);
      expect(matchLabels(REGISTER as Tell[], `MIT ${mark} Redmer Holding GmbH`)).toEqual([]);
    }
  });

  it("routes emoji and the marketing register to the warning tier, never the blocking one", () => {
    const samples = [
      "ships fast \u{1F680}",
      "a robust, comprehensive parser",
      "leverage the seamless integration",
      "unlock and streamline your workflow",
    ];
    for (const sample of samples) {
      expect(matchLabels(TYPOGRAPHIC as Tell[], sample), `"${sample}" must not block`).toEqual([]);
      expect(matchLabels(REGISTER as Tell[], sample), `"${sample}" should warn`).not.toEqual([]);
    }
  });
});
