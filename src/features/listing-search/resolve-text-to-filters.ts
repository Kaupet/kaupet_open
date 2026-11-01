// kaupet_open-stub. Fritekst tolkes ikke til filtre i Open; teksten søkes som
// den er, og kategori, pris og egenskaper velges i filteret.
import type { AttributeFilterValue, CategoryFilter, ValueGroup } from "@/lib/category-filters";
import type { Category } from "@/lib/categories";

export type InterpretedCriterion =
  | { kind: "category"; slug: string; source: "text" | "user"; matchedText?: string }
  | {
      kind: "attribute";
      key: string;
      value: AttributeFilterValue;
      source: "text" | "user";
      matchedText?: string;
    }
  | { kind: "price"; min?: number; max?: number; source: "text" | "user"; matchedText?: string };

export type ResolvedTextFilters = {
  q: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  attrPatch: Record<string, AttributeFilterValue>;
  criteria: InterpretedCriterion[];
};

export async function resolveTextToFilters(params: {
  q: string;
  categories: Category[];
  brands: { name: string; category_group: ValueGroup }[];
  allFilters: CategoryFilter[];
}): Promise<ResolvedTextFilters> {
  return { q: params.q.trim(), attrPatch: {}, criteria: [] };
}
