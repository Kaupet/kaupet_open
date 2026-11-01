// kaupet_open-stub. Søkeforslag under søkefeltet finnes ikke i kaupet_open.
import type { Category } from "@/lib/categories";
import type { SavedSearch } from "@/lib/saved-searches";

export function SearchSuggestionsLayer(_props: {
  q: string;
  categories: Category[];
  onSubmitQuery: (text: string) => void;
  onPickCategory: (category: Category) => void;
  onPickSavedSearch: (saved: SavedSearch) => void;
  currentCategorySlugs?: string[];
}) {
  return null;
}
