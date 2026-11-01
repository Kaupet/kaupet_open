// kaupet_open-stub. Bud, reservasjon og bekreftet salg finnes ikke i kaupet_open.
export const TRADE_AVAILABLE = false;

// Ingen reservasjon i Open: kolonnene finnes ikke, så ingen select nevner dem.
export const LISTING_RESERVATION_COLUMN = "";

export const CONVERSATION_RESERVATION_COLUMN = "";

export function listingReservedUntil(_listing: object | null | undefined): string | null {
  return null;
}

export function conversationHoldsReservation(_conversation: object | null | undefined): boolean {
  return false;
}
