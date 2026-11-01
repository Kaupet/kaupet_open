import type { AttributeFilterValue } from "@/lib/category-filters";
import type { SortValue } from "@/lib/categories";
import type { TermGroup } from "@/lib/term-groups";
import type { SearchCriteria } from "@/lib/saved-searches";
import { verticalConditionsFor } from "@/lib/constants";

export const DEFAULT_SEARCH_RADIUS_KM = 10;

export type LocationValue = {
  lat: number | null;
  lng: number | null;
  radius: number;
  label?: string;
};

export const CONDITIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "Helt ny" },
  { value: "like_new", label: "Som ny" },
  { value: "good", label: "Pent brukt" },
  { value: "acceptable", label: "Brukt med slitasje" },
  { value: "for_parts", label: "Må repareres" },
];

/** Vertikalens rotkategori tillater bare én valgt underkategori om gangen
 * (Verticals.rootCategory), så "nøyaktig én valgt kategori med egne
 * tilstandsvalg" er riktig betingelse for å bytte til vertikalens
 * tilstandsetiketter — ellers vises det generiske settet. */
export function conditionOptionsFor(
  selectedCategorySlugs: string[],
): { value: string; label: string }[] {
  const verticalOptions =
    selectedCategorySlugs.length === 1
      ? verticalConditionsFor(selectedCategorySlugs[0])
      : undefined;
  return [...(verticalOptions ?? CONDITIONS)];
}

export type AdvancedSearchValue = {
  terms: string[];
  qMode: "all" | "any";
  categories: string[];
  catMode: "all" | "any";
  conditions: string[];
  min: number | null;
  max: number | null;
  includeFree: boolean;
  location: LocationValue;
  sort: SortValue;
  extraGroups: TermGroup[];
  attributes?: Record<string, AttributeFilterValue>;
};

export function defaultAdvancedSearchValue(): AdvancedSearchValue {
  return {
    terms: [],
    qMode: "all",
    categories: [],
    catMode: "any",
    conditions: [],
    min: null,
    max: null,
    includeFree: true,
    location: { lat: null, lng: null, radius: DEFAULT_SEARCH_RADIUS_KM, label: "" },
    attributes: {},
    sort: "new",
    extraGroups: [],
  };
}

export function valueToCriteria(v: AdvancedSearchValue): SearchCriteria {
  return {
    terms: v.terms,
    qMode: v.qMode,
    categories: v.categories,
    catMode: v.catMode,
    conditions: v.conditions,
    min: v.min,
    max: v.max,
    includeFree: v.includeFree,
    // Relevance sort has no meaning without a live query context, so a
    // saved search persists "new" instead.
    sort: v.sort === "relevance" ? "new" : v.sort,
    extraGroups: v.extraGroups,
    lat: v.location.lat,
    lng: v.location.lng,
    attributes: v.attributes ?? {},
    radius: v.location.lat != null ? v.location.radius : null,
    loc: v.location.label || undefined,
  };
}

export function criteriaToValue(c: SearchCriteria): AdvancedSearchValue {
  const terms = c.terms?.length ? c.terms : c.q ? c.q.split(/\s+/).filter(Boolean) : [];
  return {
    terms,
    qMode: c.qMode ?? "all",
    categories: c.categories ?? [],
    catMode: c.catMode ?? "any",
    conditions: c.conditions ?? [],
    min: c.min ?? null,
    max: c.max ?? null,
    includeFree: c.includeFree ?? true,
    sort: c.sort ?? "new",
    extraGroups: c.extraGroups ?? [],
    attributes: c.attributes ?? {},
    location: {
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      radius: c.radius ?? DEFAULT_SEARCH_RADIUS_KM,
      label: c.loc ?? "",
    },
  };
}
