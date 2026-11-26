// kaupet_open-stubb: modereringssamtaler finnes ikke i Open.
export function moderationSenderName(_firstName: string | null | undefined): string {
  return "";
}
export function moderationThreadName(): string {
  return "";
}

export const MODERATION_CONVERSATION_COLUMN = "";
export const MODERATION_MESSAGE_COLUMN = "";
export const INBOX_RELATION = "conversations";
export const INBOX_MEMBER_COLUMNS = "";

export type ModerationInboxMember = {
  conversation_id: string;
  last_read_at: string | null;
  deleted_at: string | null;
};
export type ModerationInboxFields = {
  moderation_user_id?: string | null;
  moderation_last_read_at?: string | null;
  moderation_deleted_at?: string | null;
};

export function isModerationConversation(_row: object | null | undefined): boolean {
  return false;
}

export function moderationThreadClosedText(
  _status: string | null,
  _viewerIsSeller: boolean,
): string | null {
  return null;
}

export async function moderationThreadStatus(_conversationId: string): Promise<string | null> {
  return null;
}

export function excludeModerationThreads<Query>(query: Query): Query {
  return query;
}

export function moderationInboxFilters(userId: string, trash = false) {
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const deleted = trash ? `gte.${cutoff}` : "is.null";
  return [
    `and(buyer_id.eq.${userId},buyer_deleted_at.${deleted}),and(seller_id.eq.${userId},seller_deleted_at.${deleted})`,
  ];
}

export async function queryModerationInbox<Row extends { id: string; last_message_at: string }>(
  userId: string,
  trash: boolean,
  run: (filter: string) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ data: Row[]; error: unknown }> {
  const result = await run(moderationInboxFilters(userId, trash)[0]!);
  return { data: (result.data ?? []) as Row[], error: result.error };
}

export function withModerationInbox<T extends { id: string } & ModerationInboxFields>(rows: T[]) {
  return rows.map((row) => ({
    ...row,
    moderation_member: undefined as ModerationInboxMember | undefined,
  }));
}

export async function setModerationInboxState(_conversationId: string, _trash?: boolean) {}

export async function moderationMembership(
  _conversationId: string,
  _userId: string,
): Promise<ModerationInboxMember | undefined> {
  return undefined;
}

export const MODERATOR_ALIAS_QUERY_KEY = ["my-moderator-alias"] as const;

export function useMyModeratorAlias(): string | null {
  return null;
}

export function moderatorSenderIds(
  _messages: { sender_id: string; from_moderator?: boolean }[],
): string[] {
  return [];
}

export async function moderatorFirstNames(_aliasIds: string[]) {
  return new Map<string, string | null>();
}

export async function deleteModerationMessage(_messageId: string) {}
