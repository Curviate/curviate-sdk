// @curviate/sdk: the official TypeScript SDK for the Curviate API.
//
// Entry point. Re-exports the client, the typed error model, the generated
// request/response types, and the webhook-receiving surface.

export { Curviate } from "./client.js";
export type {
  CurviateConfig,
  ResolvedConfig,
} from "./config.js";

export {
  CurviateError,
  isCurviateError,
  // The runtime array behind `ErrorCode`. Exported so a consumer can ITERATE
  // the taxonomy instead of hand-copying it: `@curviate/cli`'s exit-code
  // exhaustiveness guard kept a copy of this list, which meant a code added
  // here could never red it. A type has no runtime representation, so the type
  // alone could not be that instrument.
  ERROR_CODES,
  type ErrorCode,
  type RequiredTier,
  type RetryHint,
  type SafetyHint,
  type SafetyReason,
  type CurviateErrorInit,
  type CurviateErrorJSON,
} from "./errors.js";

export type {
  AccountListPage,
  AccountListParams,
} from "./resources/accounts.js";

export type {
  ResourceNamespaces,
  AccountScopedNamespaces,
} from "./resources/index.js";

export type { paths, components, operations } from "./generated/types.js";

// Webhook signature verification and typed event surface
export {
  constructEvent,
  WebhookSignatureError,
  type CurviateEvent,
  type CurviateEventEnvelope,
  type EventPayloadBase,
  type MessagePayload,
  type ConnectionPayload,
  type AccountPayload,
  type ConstructEventOptions,
} from "./webhooks.js";
