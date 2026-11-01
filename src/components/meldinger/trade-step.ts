export type TradeStep = "contact" | "agreed" | "sold";

/**
 * Hvor langt handelen i samtalen har kommet: Kontakt → Avtalt (godtatt bud
 * eller reservasjon til samtalen) → Solgt. null: ingen meldinger ennå.
 */
export function tradeStep({
  hasMessages,
  agreed,
  soldInThisConversation,
}: {
  hasMessages: boolean;
  agreed: boolean;
  soldInThisConversation: boolean;
}): TradeStep | null {
  if (soldInThisConversation) return "sold";
  if (agreed) return "agreed";
  return hasMessages ? "contact" : null;
}
