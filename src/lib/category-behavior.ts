import { capitalizeWord } from "@/lib/utils";
import { verticals } from "@/lib/verticals";
import type { AttributeFilterValue, CategoryFilter, DateAttribute } from "@/lib/category-filters";
import type { ConditionValue } from "@/lib/constants";

/**
 * A single extra breadcrumb segment appended after the category chain.
 * `slug: null` renders as plain (non-clickable) text; a non-null `slug`
 * links to `/annonser` for that category, optionally narrowed by `attrs`
 * (the same attribute-filter shape used by the search page).
 */
export type BreadcrumbSegment = {
  name_nb: string;
  slug: string | null;
  attrs?: Record<string, AttributeFilterValue>;
};

/**
 * Context needed to resolve extra breadcrumb segments, gathered once at the
 * breadcrumb-building call site. `rootCategorySlug` is the top-level
 * category slug (e.g. "bil-og-mc"), used as the search target for clickable
 * segments. `genericBrandFilter` is the listing's category's plain
 * text/select "brand" filter (see `genericBrandFilterFor`), if any.
 */
export type CategoryBreadcrumbContext = {
  rootCategorySlug: string | null;
  genericBrandFilter: CategoryFilter | null;
};

/**
 * Per-category-group flags that generic listing-creation/detail code branches
 * on. Consolidates what used to be bare vehicle checks threaded
 * through several unrelated files (listings.functions.ts, delivery-location,
 * category-attributes, field-groups/registry.ts, validators.ts) so a new
 * flag only needs to be added in one place.
 */
type ComposerPage = { groups: { key: string }[] };

/** Falls back to a vertical step marked `attributeReviewFallback` when present
 * (kjøretøy: registreringssteget), else the generic attributes step. */
export function defaultAttributeReviewGroupKey(pages: ComposerPage[]) {
  for (const page of pages) {
    for (const group of page.groups) {
      if (verticals.fieldGroups?.[group.key]?.attributeReviewFallback) return group.key;
    }
  }
  return "category-attributes";
}

export type CategoryBehavior = {
  /** Whether the listing must declare a delivery method (pickup/ship/both). Vertikalene kan velge det bort. */
  requiresDeliveryMethod: boolean;
  /** Whether the generic category-attributes field group should render. False for vehicles, whose attributes are captured via the vehicle-* field groups instead. */
  showGenericAttributes: boolean;
  /** Whether category-specific filter values are required before publishing. */
  requiresCategoryFilterValues: boolean;
  /** Filter keys excluded from the required-attribute contract for this category behavior. */
  requiredFilterExclusions: readonly string[];
  /** Filtre vertikalens egne steg setter (eller lar stå tomme), og som
   * getMissingRequiredFilters derfor aldri krever som vanlige attributter. */
  flowManagedFilterKeys: readonly string[];
  /** Attributter uten filterrad som lagres som ISO-dato og valideres som det
   * (filtre av typen `date` dekkes allerede av filtertypen). */
  extraDateAttributes: readonly DateAttribute[];
  /** Eldre klienter kan fortsatt sende disse feltene under en overgang. */
  legacyFilterAliases: readonly {
    key: string;
    replacementKey: string;
    value: boolean;
    replacementValue: string;
  }[];
  /** Extra breadcrumb segments appended after the category chain, derived from the listing's attributes. */
  extraBreadcrumbSegments: (
    attributes: Record<string, unknown>,
    ctx: CategoryBreadcrumbContext,
  ) => BreadcrumbSegment[];
  /** Resolves which review-step group an "attr-*" validation error should scroll the wizard to. */
  attributeReviewGroupKey: (pages: ComposerPage[], verticalRegistered: boolean) => string;
  /** Bryter i budarket der den som byr sier om budet inkluderer en avgift,
   * og teksten budkortet viser for hvert valg. null skjuler bryteren. */
  offerFee: { toggleLabel: string; included: string; excluded: string } | null;
  /** Tittelen avledes av attributtene (verticals.derivedTitle) i stedet for å
   * skrives fritt, og valideres ikke på bildesteget. */
  derivedTitle: boolean;
  /** Kjente feil/mangler og vedlikeholdshistorikk lagres med annonsen. */
  conditionDetails: boolean;
  /** Egne tilstandsvalg (uten beskrivelse) for bladkategorien, eller null for
   * de generiske CONDITIONS. */
  conditionOptions: ((leafSlug: string | undefined) => readonly ConditionOption[]) | null;
  /** Plassholder i beskrivelsesfeltet; null gir den generiske. */
  descriptionPlaceholder: string | null;
  /** Kjøperen betaler en avgift i tillegg til prisen; prissteget viser
   * avgiften og totalprisen. */
  buyerFee: boolean;
  /** Prissteget tilbyr «Gis bort gratis». */
  allowsGiveaway: boolean;
  /** Annonsen kan få 360°-opptak (Spin360-registreringen). */
  spin360: boolean;
  /** Underkategorien velges i vertikalens eget steg; veiviserens header viser
   * hovedkategorien til underkategorien er låst. */
  subcategoryChosenInFlow: boolean;
};

type ConditionOption = { value: ConditionValue; label: string };

const DEFAULT_BEHAVIOR: CategoryBehavior = {
  requiresDeliveryMethod: true,
  showGenericAttributes: true,
  requiresCategoryFilterValues: true,
  requiredFilterExclusions: [],
  flowManagedFilterKeys: [],
  extraDateAttributes: [],
  legacyFilterAliases: [],
  attributeReviewGroupKey: defaultAttributeReviewGroupKey,
  offerFee: null,
  derivedTitle: false,
  conditionDetails: false,
  conditionOptions: null,
  descriptionPlaceholder: null,
  buyerFee: false,
  allowsGiveaway: true,
  spin360: false,
  subcategoryChosenInFlow: false,
  extraBreadcrumbSegments: (attributes, { rootCategorySlug, genericBrandFilter }) => {
    if (!genericBrandFilter) return [];
    const raw = attributes[genericBrandFilter.key];
    if (typeof raw !== "string" || !raw) return [];
    // Multiselect (not a single "select"/"text" value), matching the
    // vehicle Merke/Modell breadcrumb behavior — landing here shows every
    // other brand as a checkable option too (see the "brand" key branch in
    // category-filter-fields.tsx), not just this one fixed value.
    return [
      {
        name_nb: capitalizeWord(raw) ?? raw,
        slug: rootCategorySlug,
        attrs: {
          [genericBrandFilter.key]: { kind: "multiselect", values: [raw] },
        },
      },
    ];
  },
};

/** Den generiske oppførselen, som vertikalene bygger sin egen på. */
export const GENERIC_CATEGORY_BEHAVIOR: CategoryBehavior = DEFAULT_BEHAVIOR;

/**
 * Resolves category behavior. `verticalGroup` is the category's value group
 * (valueGroupFor); when set, the registered vertical's behavior applies
 * (src/lib/verticals.ts). Otherwise `filterBehavior`
 * (filterCategoryBehavior) applies, else the generic behavior. Without a
 * registered vertical (kaupet_open) the generic behavior always applies.
 */
export function getCategoryBehavior(
  verticalGroup: string | null,
  filterBehavior: CategoryBehavior | null = null,
): CategoryBehavior {
  if (verticalGroup && verticals.categoryBehavior) return verticals.categoryBehavior;
  return filterBehavior ?? DEFAULT_BEHAVIOR;
}
