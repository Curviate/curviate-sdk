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
  type RetryHint,
  type SafetyHint,
  type SafetyReason,
  type ConnectionLocation,
  type CurviateErrorInit,
  type CurviateErrorJSON,
  type CurviateErrorDetail,
} from "./errors.js";

export type {
  AccountListPage,
  AccountListParams,
  AccountDetail,
  AccountUpdateBody,
  AccountUpdateResult,
  SeatList,
  AccountTeamAccessResult,
} from "./resources/accounts.js";

export type {
  AuthIntentBody,
  ConnectionCountry,
  ConnectionLocationSource,
} from "./resources/auth.js";

export type {
  DraftCreateBody,
  DraftCreateResult,
  DraftListParams,
  DraftListResult,
  DraftGetResult,
  DraftUpdateBody,
  DraftUpdateResult,
  DraftDeleteResult,
  DraftPublishResult,
  DraftAttachmentContentType,
  DraftUploadOptions,
  DraftUploadResult,
} from "./resources/drafts.js";

export type {
  Notification,
  NotificationListPage,
  NotificationListQuery,
  NotificationUnreadCount,
  NotificationUpdateBody,
  NotificationUpdateResult,
  NotificationMarkAllReadBody,
  NotificationMarkAllReadResult,
} from "./resources/notifications.js";

export type {
  ConnectRequest,
  ConnectRequestCreateBody,
  ConnectRequestGetResult,
  ConnectRequestCancelResult,
} from "./resources/connect-requests.js";

export type {
  Team,
  TeamListParams,
  TeamListPage,
  TeamUpdateBody,
  TeamUpdateResult,
  TeamMemberListParams,
  TeamMemberListPage,
  TeamMemberUpdateBody,
  TeamMemberUpdateResult,
  TeamMemberRemoveResult,
  TeamInviteCreateBody,
  TeamInviteCreateResult,
  TeamInviteListParams,
  TeamInviteListPage,
  TeamInviteResendResult,
  TeamInviteRevokeResult,
} from "./resources/teams.js";

export type {
  Contact,
  ContactListParams,
  ContactListPage,
  ContactUpsertBody,
  ContactUpsertResult,
  ContactUpdateBody,
  ContactUpdateResult,
  ContactDeleteManyBody,
  ContactDeleteManyResult,
  ContactUpdateManyBody,
  ContactUpdateManyResult,
  ContactEnrichBody,
  ContactEnrichResult,
  ContactExportParams,
  ContactImport,
  ContactImportCreateBody,
  ContactImportListParams,
  ContactImportListPage,
  ContactImportGetResult,
  ContactImportRowsParams,
  ContactImportRowsPage,
} from "./resources/contacts.js";

export type {
  ContactListObject,
  ContactListCreateBody,
  ContactListListParams,
  ContactListListPage,
  ContactListGetResult,
  ContactListUpdateBody,
  ContactListUpdateResult,
} from "./resources/contact-lists.js";

export type { Tag, TagListParams, TagListPage, TagUpdateBody } from "./resources/tags.js";

export type {
  Motion,
  MotionCreateBody,
  MotionUpdateBody,
  MotionListParams,
  MotionListPage,
  MotionPreviewParams,
  MotionPreview,
  SequenceVersionParams,
  SequenceVersion,
  MotionAddContactsBody,
  MotionRemoveContactsBody,
  MotionContactsResult,
  MotionRemoveContactsResult,
  SequenceInput,
  Enrollment,
  EnrollmentDetail,
  EnrollmentListParams,
  EnrollmentListPage,
  EnrollmentResumeBody,
  EnrollmentSignalBody,
} from "./resources/motions.js";

export type { TierResult, TierName, TierFeature } from "./resources/tier.js";

export type {
  ResourceNamespaces,
  RootNamespaces,
  AccountScopedNamespaces,
} from "./resources/index.js";

export type { paths, components, operations } from "./generated/types.js";

// Offline Sequence module: builder, step constructors, validator, schema (no network)
export {
  Sequence,
  step,
  validateSequence,
  SEQUENCE_SCHEMA_V1,
  SEQUENCE_SCHEMA_URL,
  type SequenceDocument,
  type SequenceDocumentOut,
  type SequenceStep,
  type SequenceValidationResult,
  type SequenceError,
  type SequenceWarning,
  type SequenceEvent,
  type SequenceTypeError,
  type Action as SequenceAction,
  type Duration as SequenceDuration,
  type FieldOperand as SequenceFieldOperand,
  type Predicate as SequencePredicate,
  type Reaction as SequenceReaction,
  type Variant as SequenceVariant,
  type JsonSchema,
} from "./sequence/index.js";

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
  type MotionPayload,
  type PostPublishedPayload,
  type PostPublishFailedPayload,
  type ConstructEventOptions,
} from "./webhooks.js";
