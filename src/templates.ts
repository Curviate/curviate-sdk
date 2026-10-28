/**
 * Webhook body templates, offline: the API's own lint and renderer (vendored
 * in `src/shared/`), so a template checked here is answered the same way by
 * `webhooks.create` / `webhooks.update`. Nothing is sent anywhere.
 */
import {
  lintWebhookTemplate,
  renderWebhookTemplate as render,
  type TemplateContext,
  type TemplateFinding,
  type TemplateLintResult,
} from "./shared/webhook-template.js";

export type { TemplateContext as WebhookTemplateContext, TemplateFinding as WebhookTemplateFinding };
export type WebhookTemplateSource = "messaging" | "user" | "account_status" | "post" | "motion";

/**
 * Lint a webhook `body_template` for a source: every finding at once, in
 * template order, each with `code` (`T1` to `T10`), `rule`, `hint`,
 * `docs_url`, `line` and `col` (1-based) and, for a did-you-mean,
 * `candidates`. `errors` equals what `WEBHOOK_TEMPLATE_INVALID` would list.
 * Offline there are no `warnings`: TW1 (an `{{enrollment.<key>}}` no current
 * Sequence saves) needs your Team's Sequences, so only the API reports it.
 *
 * @example
 * import { validateWebhookTemplate } from "@curviate/sdk";
 *
 * const { errors } = validateWebhookTemplate('{"email": "{{contact.email}}"}', { source: "motion" });
 * for (const e of errors) console.error(`${e.line}:${e.col} ${e.code} ${e.rule} (${e.hint})`);
 */
export function validateWebhookTemplate(template: string, opts: { source: WebhookTemplateSource }): TemplateLintResult {
  return lintWebhookTemplate(template, { source: opts.source });
}

/**
 * Render a template on sample values exactly as a delivery would: a string
 * that is one variable keeps the value's type, a missing one drops its key or
 * array element; inside other text a variable renders as text, missing as
 * empty; `\{{` is a literal `{{`. Every value is JSON-escaped. Lint first: a
 * template that is not JSON throws.
 *
 * @example
 * import { renderWebhookTemplate } from "@curviate/sdk";
 *
 * const body = renderWebhookTemplate('{"to": "{{contact.email}}"}', { event: "enrollment.finished", contact: { email: "alex@example.com" } });
 */
export function renderWebhookTemplate(template: string, context: TemplateContext): string {
  return render(template, context);
}
