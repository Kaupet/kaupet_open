// kaupet_open-stub. Forslag til annonsetitler mens man skriver finnes ikke i
// kaupet_open.
import { useQuery } from "@tanstack/react-query";

export type ListingSuggestion = { id: string; kaupet_code: string; title: string };

export function useSearchSuggestions(_q: string) {
  return useQuery<ListingSuggestion[]>({
    queryKey: ["search-suggestions-unavailable"],
    queryFn: () => [],
    enabled: false,
  });
}
