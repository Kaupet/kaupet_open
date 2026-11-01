// kaupet_open-stub. Strukturerte søkeforslag finnes ikke i kaupet_open.
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

export type StructuredSearchSuggestion = {
  id: string;
  filterKey: string;
  label: string;
  matchedText: string;
  value: AttributeFilterValue;
};

export function buildStructuredSearchSuggestions(
  _query: string,
  _filters: CategoryFilter[],
  _values: Record<string, AttributeFilterValue>,
  _limit?: number,
): StructuredSearchSuggestion[] {
  return [];
}
