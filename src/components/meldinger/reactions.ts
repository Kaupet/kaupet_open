/** Samme sett som CHECK-begrensningen i 20261020210000_message_reactions.sql. */
export const REACTIONS = [
  { emoji: "👍", label: "tommel opp" },
  { emoji: "❤️", label: "hjerte" },
  { emoji: "😂", label: "latter" },
  { emoji: "😮", label: "overraskelse" },
  { emoji: "😢", label: "tåre" },
  { emoji: "🙏", label: "takk" },
] as const;

export type Reaction = { message_id: string; user_id: string; emoji: string };

export function reactionLabel(emoji: string) {
  return REACTIONS.find((r) => r.emoji === emoji)?.label ?? emoji;
}

/** Legger inn, bytter eller fjerner (emoji null) én persons reaksjon. */
export function applyReaction(
  prev: Reaction[] | undefined,
  row: { message_id: string; user_id: string; emoji: string | null },
): Reaction[] {
  const rest = (prev ?? []).filter(
    (r) => !(r.message_id === row.message_id && r.user_id === row.user_id),
  );
  return row.emoji ? [...rest, { ...row, emoji: row.emoji }] : rest;
}

export function groupReactions(reactions: Reaction[] | undefined) {
  const byMessage = new Map<string, Reaction[]>();
  for (const r of reactions ?? []) {
    byMessage.set(r.message_id, [...(byMessage.get(r.message_id) ?? []), r]);
  }
  return byMessage;
}
