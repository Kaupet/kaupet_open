// kaupet_open-stub. «Ønskes kjøpt» finnes ikke i kaupet_open.
export function useWtbListings(_options: Record<string, unknown>) {
  return {
    wtbCount: 0,
    wtbLoading: false,
    wtbListings: [] as { id: string }[],
    hasSearchCriteria: false,
  };
}
