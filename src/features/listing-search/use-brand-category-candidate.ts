// kaupet_open-stub. Merkegjenkjenning i søk finnes ikke i kaupet_open.
type CategoryCandidate = { id: string; slug: string; name_nb: string };

export function useBrandCategoryCandidate(
  _candidates: CategoryCandidate[],
  _query: string,
): { candidate: CategoryCandidate | null; isLoading: boolean } {
  return { candidate: null, isLoading: false };
}
