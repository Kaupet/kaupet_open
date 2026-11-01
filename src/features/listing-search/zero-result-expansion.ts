// kaupet_open-stub. Forslag om å utvide søk uten treff finnes ikke i
// kaupet_open.
import type { CategoryFilter } from "@/lib/category-filters";
import type { Category } from "@/lib/categories";

import type { AppliedSearchState } from "@/features/listing-search/search-schema";

export type ZeroResultExpansion = {
  key: string;
  label: string;
  applied: AppliedSearchState;
  count: number;
};
type Candidate = Omit<ZeroResultExpansion, "count">;

export function buildZeroResultCandidates(
  _applied: AppliedSearchState,
  _filters: CategoryFilter[],
  _canRemoveCategory?: boolean,
): Candidate[] {
  return [];
}

export function bestZeroResultExpansions(
  _candidates: Candidate[],
  _counts: Array<number | undefined>,
  _limit?: number,
): ZeroResultExpansion[] {
  return [];
}

export function useZeroResultExpansion(_params: {
  applied: AppliedSearchState;
  filters: CategoryFilter[];
  categories: Pick<Category, "id" | "slug" | "parent_id">[];
  enabled: boolean;
  canRemoveCategory?: boolean;
}) {
  const expansions: ZeroResultExpansion[] = [];
  return { expansion: expansions[0], expansions, isPending: false };
}
