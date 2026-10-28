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
  type CurviateErrorDetails,
  type SequenceConflictCurrent,
} from "./errors.js";

export type {
  AccountListPage,
  AccountListParams,
  AccountDetail,
  AccountUpdateBody,
  AccountUpdateResult,
  SeatList,
  AccountTeamAccessResult,
  AccountMetricsParams,
  AccountMetricList,
  AccountOverviewParams,
  AccountOverview,
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
  TeamCreateBody,
  TeamCreateResult,
  TeamLogoResult,
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
  EnrollmentEventBody,
  EnrollmentSignalBody,
  EnrollmentReassignBody,
  EnrollmentReassignResult,
  EnrollmentBulkBody,
  EnrollmentBulkResult,
  EnrollmentBulkItem,
  EnrollmentReason,
} from "./resources/motions.js";

export type { TierResult, TierName, TierFeature } from "./resources/tier.js";

export type {
  Connection,
  ConnectionListParams,
  ConnectionListPage,
  NetworkSyncStatusParams,
  NetworkSyncStatus,
  NetworkResyncBody,
  NetworkResyncResult,
} from "./resources/network.js";

export type {
  UniboxChat,
  UniboxChatListParams,
  UniboxChatListPage,
  UniboxUnreadCountParams,
  UniboxUnreadCount,
  UniboxRefreshBody,
  UniboxRefreshResult,
  UniboxTagContactBody,
  UniboxTagContactResult,
  UniboxEnrollBody,
  UniboxEnrollResult,
  UniboxAccount,
  UniboxAccountList,
  UniboxAccountUpdateBody,
} from "./resources/unibox.js";

export type {
  MotionAnalyticsParams,
  MotionAnalyticsOverview,
  MotionAnalyticsDetailParams,
  MotionAnalyticsDetail,
  ActivityParams,
  Activity,
  AnalyticsEvent,
  AnalyticsEventListParams,
  AnalyticsEventListPage,
  BudgetRow,
  AnalyticsExportParams,
} from "./resources/analytics.js";

export type { ExportCreateBody, Export, ExportGetResult } from "./resources/exports.js";

export type {
  SeatLendBody,
  SeatLendResult,
  SeatReturnResult,
  InvoiceListParams,
  InvoiceListPage,
  Invoice,
} from "./resources/billing.js";

export type {
  DoNotContactListParams,
  DoNotContactPage,
  DoNotContactEntry,
  DoNotContactAddBody,
  DoNotContactUpdateBody,
} from "./resources/do-not-contact.js";

export type {
  IncomingEvent,
  IncomingEventCreateBody,
  IncomingEventCreateResult,
  IncomingEventListParams,
  IncomingEventPage,
  IncomingEventUpdateBody,
  IncomingEventArrivals,
} from "./resources/incoming-events.js";

export type { TenantBetaConsent, TenantBetaSetBody } from "./resources/tenant.js";

export type { Pageable } from "./internal/paginate.js";

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
  newStepId,
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
  type StepIdKind,
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
  type OwnMessagePayload,
  type ChatUpdatedPayload,
  type MessageOrigin,
  type ConnectionPayload,
  type AccountPayload,
  type MotionPayload,
  type PostPublishedPayload,
  type PostPublishFailedPayload,
  type ConstructEventOptions,
} from "./webhooks.js";

// Offline webhook body templates: the API's lint and renderer (no network)
export {
  validateWebhookTemplate,
  renderWebhookTemplate,
  type WebhookTemplateContext,
  type WebhookTemplateFinding,
  type WebhookTemplateSource,
} from "./templates.js";

export type {
  WebhookCreateBody,
  WebhookCreateResult,
  WebhookListParams,
  WebhookListResult,
  WebhookListEventsResult,
  WebhookGetResult,
  WebhookUpdateBody,
  WebhookUpdateResult,
  WebhookDeleteResult,
  WebhookVariablesParams,
  WebhookVariablesResult,
  WebhookTestBody,
  WebhookTestResult,
  WebhookRotateSecretResult,
  WebhookDeliveryListParams,
  WebhookDeliveryPage,
  WebhookDelivery,
  WebhookRedeliverResult,
} from "./resources/webhooks.js";
