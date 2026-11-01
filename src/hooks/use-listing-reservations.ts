// kaupet_open-stub. Reservasjon finnes ikke i kaupet_open, så ingen annonser
// er reservert og søket gjør ikke noe ekstra oppslag.
export async function fetchListingReservations(_ids: string[]) {
  return new Map<string, string | null>();
}

export function useListingReservations(_ids: string[]): Map<string, string | null> | undefined {
  return undefined;
}

export async function withReservations<T extends { id: string }>(rows: T[]) {
  return rows.map((r) => ({ ...r, reserved_until: null }));
}
