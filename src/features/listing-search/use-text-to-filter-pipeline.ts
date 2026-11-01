// kaupet_open-stub. Fritekst tolkes ikke til filtre i Open.
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

import type { InterpretedCriterion } from "@/features/listing-search/resolve-text-to-filters";

export function useTextToFilterPipeline(_params: {
  qDraft: string;
  setQDraft: (q: string) => void;
  updateSearch: (patch: { q: string; min?: number; max?: number }) => void;
  attrFilters: CategoryFilter[];
  allFilters: CategoryFilter[];
  attrValues: Record<string, AttributeFilterValue>;
  handleAttrValueChange: (key: string, value: AttributeFilterValue | undefined) => void;
  categoryId: string | null;
  min?: number;
  max?: number;
  onApplied?: (applied: Record<string, string>) => void;
  onInterpreted?: (criteria: InterpretedCriterion[]) => void;
  ignoredInterpretations?: Set<string>;
}): void {}
