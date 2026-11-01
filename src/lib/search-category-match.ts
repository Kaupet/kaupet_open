// kaupet_open-stub. Gjenkjenning av kategori, merke og egenskap i fritekst er
// ikke med i kaupet_open; kategori velges i filteret.
import type { CategoryFilter, ValueGroup } from "@/lib/category-filters";

export type CategoryMatch = {
  matchedText: string;
  categorySlug: string;
  categoryName: string;
  source: "category" | "brand" | "attribute";
  brandCategoryGroup: ValueGroup | null;
};

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchCategoryPhrase<T extends { slug: string; name_nb: string }>(
  _query: string,
  _categories: T[],
): CategoryMatch | null {
  return null;
}

export function matchBrandPhrase(
  _query: string,
  _brands: { name: string; category_group: ValueGroup }[],
): CategoryMatch | null {
  return null;
}

export function matchAttributeOptionPhrase<T extends { id: string; slug: string; name_nb: string }>(
  _query: string,
  _allFilters: CategoryFilter[],
  _categories: T[],
  _keys?: readonly string[],
): CategoryMatch | null {
  return null;
}

export function removeCategoryMatch(query: string, _match: CategoryMatch): string {
  return query;
}
