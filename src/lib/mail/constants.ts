// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
export const OPT_OUT_TEXTS = ["opt_out_text", "opt_out_link_text", "opt_out_link_word"] as const;
export type OptOutTextKey = (typeof OPT_OUT_TEXTS)[number];
export const OPT_OUT_DEFAULTS: Readonly<Record<OptOutTextKey, string>> = {
    opt_out_text: `If you'd rather not hear from me, reply "no" and I won't email you again.`,
    opt_out_link_text: "Don't want to hear from me?",
    opt_out_link_word: "Unsubscribe",
};
export const OPT_OUT_MAX: Readonly<Record<OptOutTextKey, number>> = { opt_out_text: 200, opt_out_link_text: 100, opt_out_link_word: 30 };
