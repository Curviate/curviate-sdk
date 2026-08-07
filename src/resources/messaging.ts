/**
 * Messaging resource: 13 methods.
 *
 * Account-scoped: the bound context injects `account_id` as the leading
 * `/v1/` path segment on every request (account-first grammar).
 *
 * `startChat` / `sendMessage` accept optional `attachments[]` as JSON objects
 * carrying base64-encoded `content`, the served surface has NO multipart
 * ops; every write here is `application/json`.
 *
 * `getMessage` / `editMessage` / `deleteMessage` / `addReaction` /
 * `getAttachment` are re-homed under `/chats/{chat_id}/messages/{message_id}`;
 * every one of them now takes `chatId` as well as `messageId`.
 *
 * `getInMailBalance` relocated to `users.getInMailCredits`; `syncChat` and
 * `syncMessages` have no served equivalent and are removed.
 *
 * `searchChats` free-text searches the account's own inbox (participant
 * names and message content), distinct from `companies.searchChats`, which
 * searches a company page's admin inbox.
 */
import type { RequestContext } from "../internal/context.js";
import type { paths } from "../generated/types.js";

// ─── Type aliases from generated OpenAPI snapshot ──────────────────────────

export type ChatListPage =
  paths["/v1/{account_id}/chats"]["get"]["responses"]["200"]["content"]["application/json"];
export type ChatListQuery = NonNullable<
  paths["/v1/{account_id}/chats"]["get"]["parameters"]["query"]
>;

export type StartChatBody =
  paths["/v1/{account_id}/chats"]["post"]["requestBody"]["content"]["application/json"];
export type StartChatResult =
  paths["/v1/{account_id}/chats"]["post"]["responses"]["201"]["content"]["application/json"];

export type ChatDetail =
  paths["/v1/{account_id}/chats/{chat_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type MarkChatReadBody =
  paths["/v1/{account_id}/chats/{chat_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type MarkChatReadResult =
  paths["/v1/{account_id}/chats/{chat_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type MessageListPage =
  paths["/v1/{account_id}/chats/{chat_id}/messages"]["get"]["responses"]["200"]["content"]["application/json"];
export type MessageListQuery = NonNullable<
  paths["/v1/{account_id}/chats/{chat_id}/messages"]["get"]["parameters"]["query"]
>;

export type SendMessageBody =
  paths["/v1/{account_id}/chats/{chat_id}/messages"]["post"]["requestBody"]["content"]["application/json"];
export type SendMessageResult =
  paths["/v1/{account_id}/chats/{chat_id}/messages"]["post"]["responses"]["201"]["content"]["application/json"];

export type MessageDetail =
  paths["/v1/{account_id}/chats/{chat_id}/messages/{message_id}"]["get"]["responses"]["200"]["content"]["application/json"];

export type EditMessageBody =
  paths["/v1/{account_id}/chats/{chat_id}/messages/{message_id}"]["patch"]["requestBody"]["content"]["application/json"];
export type EditMessageResult =
  paths["/v1/{account_id}/chats/{chat_id}/messages/{message_id}"]["patch"]["responses"]["200"]["content"]["application/json"];

export type DeleteMessageResult =
  paths["/v1/{account_id}/chats/{chat_id}/messages/{message_id}"]["delete"]["responses"]["200"]["content"]["application/json"];

export type AddReactionBody =
  paths["/v1/{account_id}/chats/{chat_id}/messages/{message_id}/reactions"]["post"]["requestBody"]["content"]["application/json"];
export type AddReactionResult =
  paths["/v1/{account_id}/chats/{chat_id}/messages/{message_id}/reactions"]["post"]["responses"]["200"]["content"]["application/json"];

export type SendInMailBody =
  paths["/v1/{account_id}/messages/inmail"]["post"]["requestBody"]["content"]["application/json"];
export type SendInMailResult =
  paths["/v1/{account_id}/messages/inmail"]["post"]["responses"]["201"]["content"]["application/json"];

export type ChatSearchQuery = paths["/v1/{account_id}/chats/search"]["get"]["parameters"]["query"];
export type ChatSearchPage =
  paths["/v1/{account_id}/chats/search"]["get"]["responses"]["200"]["content"]["application/json"];

// ─── Resource class ───────────────────────────────────────────────────────────

export class MessagingResource {
  constructor(protected readonly ctx: RequestContext) {}

  /** List paginated chats for the account. `GET /v1/{account_id}/chats` */
  listChats(params?: ChatListQuery): Promise<ChatListPage> {
    return this.ctx.request<ChatListPage>({
      method: "GET",
      path: "/v1/{account_id}/chats",
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Start a new chat with one or more members. `POST /v1/{account_id}/chats`
   * `attachments[]`, when supplied, carry base64-encoded file bytes, always
   * sent as JSON, never multipart.
   *
   * Company pages are reply-only and cannot start a conversation this way.
   * Reply to an existing one instead, with `sendMessage()` using a
   * `COMPANY_` chat id from `inboxes.listChats()`.
   */
  startChat(body: StartChatBody): Promise<StartChatResult> {
    return this.ctx.request<StartChatResult>({
      method: "POST",
      path: "/v1/{account_id}/chats",
      body,
    });
  }

  /** Get details of a single chat. `GET /v1/{account_id}/chats/{chat_id}` */
  getChat(chatId: string): Promise<ChatDetail> {
    return this.ctx.request<ChatDetail>({
      method: "GET",
      path: `/v1/{account_id}/chats/${chatId}`,
    });
  }

  /**
   * Mark a chat read or unread. `PATCH /v1/{account_id}/chats/{chat_id}`
   * Body: `{read}`.
   */
  markChatRead(chatId: string, body: MarkChatReadBody): Promise<MarkChatReadResult> {
    return this.ctx.request<MarkChatReadResult>({
      method: "PATCH",
      path: `/v1/{account_id}/chats/${chatId}`,
      body,
    });
  }

  /**
   * List messages in a chat, cursor-paginated.
   * `GET /v1/{account_id}/chats/{chat_id}/messages`
   */
  listMessages(chatId: string, params?: MessageListQuery): Promise<MessageListPage> {
    return this.ctx.request<MessageListPage>({
      method: "GET",
      path: `/v1/{account_id}/chats/${chatId}/messages`,
      ...(params ? { query: params as Record<string, string | number | boolean | string[] | undefined | null> } : {}),
    });
  }

  /**
   * Send a message in a chat. `POST /v1/{account_id}/chats/{chat_id}/messages`
   * `attachments[]`, when supplied, carry base64-encoded file bytes, always
   * sent as JSON, never multipart. At least one of `text`/`attachments` is
   * required (enforced server-side).
   *
   * Sending on behalf of a company page: this same method is the reply
   * surface for a company page, there is no separate send-as-page method.
   * Pass a `COMPANY_` chat id (from `inboxes.listChats()`, e.g.
   * `"COMPANY_83734124_2-YTQ3ODU3Njgt"`) and the message sends AS THE PAGE,
   * no extra parameter needed. Any other chat id sends as the connected
   * member. Company pages are reply-only: they can answer an existing
   * conversation this way, but `startChat()` cannot start one on their
   * behalf.
   *
   * The response echoes `sent_as`, the acting identity actually used:
   * `{ kind: "company", company_id, name }` (`company_id` is `null` when
   * the page could not be correlated to a managed page) or
   * `{ kind: "personal" }`. Never infer the acting identity from a
   * message's `sender` field, only from `sent_as`.
   *
   * @example
   * const acc = curviate.account("acc_YOUR_ACCOUNT_ID");
   * const result = await acc.messaging.sendMessage("COMPANY_83734124_2-YTQ3ODU3Njgt", {
   *   text: "Thanks for reaching out!",
   * });
   * console.log(result.sent_as); // { kind: "company", company_id: "112013061", name: "Acme Inc" }
   */
  sendMessage(chatId: string, body: SendMessageBody): Promise<SendMessageResult> {
    return this.ctx.request<SendMessageResult>({
      method: "POST",
      path: `/v1/{account_id}/chats/${chatId}/messages`,
      body,
    });
  }

  /**
   * Get a single message by ID, re-homed under its chat.
   * `GET /v1/{account_id}/chats/{chat_id}/messages/{message_id}`
   */
  getMessage(chatId: string, messageId: string): Promise<MessageDetail> {
    return this.ctx.request<MessageDetail>({
      method: "GET",
      path: `/v1/{account_id}/chats/${chatId}/messages/${messageId}`,
    });
  }

  /**
   * Edit a message within the ~60-minute edit window.
   * `PATCH /v1/{account_id}/chats/{chat_id}/messages/{message_id}`
   */
  editMessage(chatId: string, messageId: string, body: EditMessageBody): Promise<EditMessageResult> {
    return this.ctx.request<EditMessageResult>({
      method: "PATCH",
      path: `/v1/{account_id}/chats/${chatId}/messages/${messageId}`,
      body,
    });
  }

  /**
   * Delete a message within the delete window (bodyless).
   * `DELETE /v1/{account_id}/chats/{chat_id}/messages/{message_id}`
   */
  deleteMessage(chatId: string, messageId: string): Promise<DeleteMessageResult> {
    return this.ctx.request<DeleteMessageResult>({
      method: "DELETE",
      path: `/v1/{account_id}/chats/${chatId}/messages/${messageId}`,
    });
  }

  /**
   * Add a reaction to a message.
   * `POST /v1/{account_id}/chats/{chat_id}/messages/{message_id}/reactions`
   */
  addReaction(chatId: string, messageId: string, body: AddReactionBody): Promise<AddReactionResult> {
    return this.ctx.request<AddReactionResult>({
      method: "POST",
      path: `/v1/{account_id}/chats/${chatId}/messages/${messageId}/reactions`,
      body,
    });
  }

  /**
   * Download a message attachment. Returns raw binary.
   * `GET /v1/{account_id}/chats/{chat_id}/messages/{message_id}/attachments/{attachment_id}`
   * Returns `ArrayBuffer`, binary response; the SDK does not cache or store it.
   */
  getAttachment(chatId: string, messageId: string, attachmentId: string): Promise<ArrayBuffer> {
    return this.ctx.request<ArrayBuffer>({
      method: "GET",
      path: `/v1/{account_id}/chats/${chatId}/messages/${messageId}/attachments/${attachmentId}`,
    });
  }

  /** Send an InMail. `POST /v1/{account_id}/messages/inmail` */
  sendInMail(body: SendInMailBody): Promise<SendInMailResult> {
    return this.ctx.request<SendInMailResult>({
      method: "POST",
      path: "/v1/{account_id}/messages/inmail",
      body,
    });
  }

  /**
   * Free-text search the account's own inbox; matches participant names
   * and message content. `GET /v1/{account_id}/chats/search`
   *
   * @param params - `query` (required free-text term) plus `limit` and an
   *   opaque `cursor` for pagination.
   */
  searchChats(params: ChatSearchQuery): Promise<ChatSearchPage> {
    return this.ctx.request<ChatSearchPage>({
      method: "GET",
      path: "/v1/{account_id}/chats/search",
      query: params as Record<string, string | number | boolean | string[] | undefined | null>,
    });
  }
}
