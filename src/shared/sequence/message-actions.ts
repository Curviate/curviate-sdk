// Vendored from the API by scripts/vendor-shared.mjs. Do not edit: change the API and re-run.
export const MESSAGE_SEND_ACTIONS = ["message.send", "inmail.send", "voice.send"] as const;
export type MessageSendAction = (typeof MESSAGE_SEND_ACTIONS)[number];
export const isMessageSend = (a: unknown): a is MessageSendAction => (MESSAGE_SEND_ACTIONS as readonly unknown[]).includes(a);
export const MESSAGE_SEND_SQL = MESSAGE_SEND_ACTIONS.map((a) => `'${a}'`).join(", ");
