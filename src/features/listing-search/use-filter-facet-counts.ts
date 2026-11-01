// kaupet_open-stub. Antall treff per filterverdi finnes ikke i kaupet_open.
import { useQuery } from "@tanstack/react-query";

import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

export function useFilterFacetCounts(_args: {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  categoryIds: string[] | null;
  conditions: string[];
  min: number | undefined;
  max: number | undefined;
  includeFree: boolean;
}) {
  return useQuery<Record<string, Record<string, number>>>({
    queryKey: ["filter-facet-counts-unavailable"],
    queryFn: () => ({}),
    enabled: false,
  });
}
