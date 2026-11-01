// kaupet_open-stub. Tolkning av tall og enheter i fritekst finnes ikke i
// kaupet_open; søketeksten brukes som den er.
import type { CategoryFilter } from "@/lib/category-filters";

export type NumericFilterMatch = {
  matchedText: string;
  filterKey: string;
  min?: number;
  max?: number;
};
export type PriceFilterMatch = Omit<NumericFilterMatch, "filterKey">;

export function parsePriceFilters(_query: string): PriceFilterMatch[] {
  return [];
}

export function parseNumericFilters(
  _query: string,
  _filters: CategoryFilter[],
): NumericFilterMatch[] {
  return [];
}

export function removeNumericMatches(query: string, _matches: NumericFilterMatch[]): string {
  return query;
}
