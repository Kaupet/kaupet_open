// kaupet_open-stub. Søketolkning finnes ikke i kaupet_open, så det er ingen
// tolkning å vise.
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

import type { InterpretedCriterion } from "@/features/listing-search/resolve-text-to-filters";

export function SearchInterpretation(_props: {
  criteria: InterpretedCriterion[];
  categories: { slug: string; name_nb: string }[];
  filters: CategoryFilter[];
  onCategoryChange: (slug: string | undefined) => void;
  onAttributeChange: (key: string, value: AttributeFilterValue | undefined) => void;
  onAttributeRemove?: (key: string, values?: string[], matchedText?: string) => void;
  onPriceRemove?: (matchedText?: string) => void;
}) {
  return null;
}
