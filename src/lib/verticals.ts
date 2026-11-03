import type { ComponentType, ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";

import type { AttributeMap } from "@/components/attribute-fields";
import type { FieldGroup } from "@/features/listing-creation/field-groups/registry";
import type { WizardVerticalProps } from "@/features/listing-creation/field-groups/types";
import type { CategorySuggestion } from "@/features/listing-creation/use-title-category-suggestion";
import type { ListingTask } from "@/features/listing-creation/category-flows";
import type { ReviewSection } from "@/features/listing-creation/use-wizard-navigation";
import type { CategoryBehavior } from "@/lib/category-behavior";
import type { ConditionValue } from "@/lib/constants";
import type { RangeBounds } from "@/lib/filter-range-bounds";
import type {
  AttributeFilterValue,
  AttributeValue,
  CategoryFilter,
  CategoryNode,
  ValueGroup,
} from "@/lib/category-filters";

/**
 * Registreringspunkter for kategorivertikaler. Kjernen importerer aldri
 * vertikalkode: kjøretøy og båt fyller inn punktene fra
 * src/lib/vehicle/register.ts og src/lib/boat/register.ts, som importeres én
 * gang ved oppstart (src/router.tsx). Uten registrert vertikal (kaupet_open)
 * er alle punktene tomme, og kjernen faller tilbake til generisk oppførsel.
 * Flere vertikaler kan registrere seg, se registerVertical.
 *
 * Modulen importerer bare typer, slik at registreringen ikke drar
 * annonseflyten eller annonsesiden inn i inngangsbunten.
 */
/** Det annonsesiden gir vertikalen for å avlede sin del av siden. */
export type ListingDetailInput = {
  categoryId: string | null;
  categorySlug: string | null;
  attributes: Record<string, unknown>;
  priceNok: number | null;
  condition: string | null;
  knownIssues: string | null;
  noKnownIssues: boolean | null;
  maintenanceHistory: string | null;
};

/** Vertikalens del av annonsesiden. Seksjonene settes inn på faste steder. */
export type ListingDetailSections = {
  /** Beløp kjøperen betaler i tillegg til selgers pris (kjøretøy:
   * omregistreringsavgift). Alle priser på siden inkluderer det. */
  buyerSurchargeKr: number | null;
  /** Tittelen avledes av vertikalen og kan ikke redigeres fritt. */
  fixedTitle: boolean;
  /** Over og under prisen i priskortet. */
  priceHeading: ReactNode;
  priceDetails: ReactNode;
  /** Merke ved tittelen (kjøretøyets skilt), med plasseringens klasser. */
  titleBadge: ((className: string) => ReactNode) | null;
  /** Faktaseksjonen over beskrivelsen. */
  facts: ReactNode;
  afterDescription: ReactNode;
  /** Etter selgerkortet når det står i innholdskolonnen. */
  afterSeller: ReactNode;
};

/** Ett bilde i en 360°-bildesekvens. */
export type Spin360Frame = { storage_path: string; frame_order: number };

/** En verdi i foreldrelisten til filtertypene parent_select/child_select
 * (f.eks. et merke), med verdigruppen den hører til. */
export type BrandRow = { id: string; name: string; category_group: ValueGroup };

type BrandFieldProps = {
  categoryGroup: ValueGroup;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  required?: boolean;
  error?: string;
};

/** Merke- og modellfeltene (filtertypene parent_select/child_select), som
 * slår opp i vertikalens verdilister. Uten registrert vertikal er listene
 * tomme, feltene vises ikke, og ingenting hentes. */
export type BrandModelFields = {
  useBrands: (enabled: boolean) => BrandRow[] | undefined;
  fetchBrands: (queryClient: QueryClient) => Promise<BrandRow[]>;
  BrandField: ComponentType<BrandFieldProps>;
  ModelWithClassField: ComponentType<BrandFieldProps & { brandName: string | undefined }>;
  ModelMultiField: ComponentType<{
    categoryGroup: ValueGroup;
    brandNames: string[];
    values: string[];
    onChange: (values: string[]) => void;
    counts?: Record<string, number>;
  }>;
  ModelMultiComboboxContent: ComponentType<{
    categoryGroup: ValueGroup;
    brandNames: string[];
    values: string[];
    onChange: (values: string[]) => void;
    counts?: Record<string, number>;
  }>;
};

/** Et attributt som lagres i flere nøkler og har egne felt i annonseskjemaet,
 * søket og annonsesiden (kjøretøy: delpassform for bildeler). Kjernen kjenner
 * bare nøklene vertikalen oppgir her. Kategorier med `anchorKey` blant
 * filtrene har attributtet. */
export type CompoundAttribute = {
  /** Filteret der Field står i annonseskjemaet. */
  anchorKey: string;
  /** Filteret der SearchField står i søket. Verdien lagres som en liste, og
   * søket krever at listen inneholder de valgte verdiene. */
  searchKey: string;
  /** Alle nøklene attributtet eier, inkludert de to over. Vises ikke som
   * generiske felt i skjemaet eller i faktarutenettet på annonsesiden. */
  keys: readonly string[];
  /** Etiketten for en valgt søkeverdi i aktive filtre, etter filternavnet. */
  searchValueLabel: string;
  /** Gjør eldre nøkkelnavn (f.eks. i lokale utkast) om til filterets nøkkel. */
  normalize: <T>(
    attributes: Record<string, T>,
    filters: readonly CategoryFilter[],
  ) => Record<string, T>;
  /** Serverkontrollen ved publisering; feilmeldingen, eller null. */
  validate: (attributes: Record<string, AttributeValue>) => string | null;
  /** Linjen under tittelen på annonsekortet, eller null. */
  cardLabel: (attributes: Record<string, unknown> | null | undefined) => string | null;
  /** Kort etikett for valgte søkeverdier, f.eks. «Volvo (alle)», eller null. */
  useSearchLabel: (values: string[]) => string | null;
  Field: ComponentType<{
    value: Record<string, AttributeValue>;
    onChange: (next: Record<string, AttributeValue>) => void;
    required?: boolean;
    /** Nøklene getMissingRequiredFilters fant uten verdi. */
    missingKeys: ReadonlySet<string>;
  }>;
  SearchField: ComponentType<{
    value: AttributeFilterValue | undefined;
    onChange: (value: AttributeFilterValue | undefined) => void;
    contentOnly?: boolean;
  }>;
  Summary: ComponentType<{ attributes: Record<string, unknown> }>;
};

/** Avgiften kjøperen betaler i tillegg til selgers pris (kjøretøy:
 * omregistreringsavgiften), i prissteget for kategorier med
 * CategoryBehavior.buyerFee. */
export type BuyerFeeFields = {
  /** Beløpet som legges på prisen, eller null når ingenting kommer i tillegg. */
  addedOnTopKr: (attributes: AttributeMap, calculatedKr: number | null) => number | null;
  /** Feltene for avgiften under prisen. */
  Fields: ComponentType<{
    attributes: AttributeMap;
    onAttributesChange: (next: AttributeMap) => void;
    calculatedKr: number | null;
  }>;
};

/** Det annonseflyten (ny-annonse.tsx) gir vertikalens wizard-hook. */
export type WizardVerticalContext = {
  /** Verdigruppen for valgt kategori (valueGroupFor), null utenfor vertikalen. */
  categoryGroup: ValueGroup | null;
  categoryId: string;
  categoriesById: Map<string, CategoryNode & { name_nb: string; slug?: string }>;
  attributes: AttributeMap;
  setAttributes: (next: AttributeMap) => void;
  setCategoryTouchedManually: (touched: boolean) => void;
  setSelectedParentId: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
  goNext: () => void;
};

/** Vertikalens tilstand i annonseflyten (kjøretøy: registeroppslaget). */
export type WizardVertical = {
  /** Legges i props-sekken til alle feltgrupper og i valideringskonteksten. */
  props: WizardVerticalProps;
  /** Attributtnøkler vertikalens egne steg eier, skjult i de generiske feltene. */
  hiddenAttributeKeys: readonly string[];
  /** Brukeren har lagt inn noe som går tapt ved navigering. */
  hasInput: boolean;
  /** Tekst på Neste-knappen mens vertikalen jobber; knappen er da deaktivert. */
  busyLabel: string | null;
  /** Merknad på Se over-steget (kjøretøy: ansvar for registeropplysningene). */
  reviewNotice: string | null;
  /** Sendes til CategoryBehavior.attributeReviewGroupKey. */
  registered: boolean;
  calculatedBuyerFeeKr: number | null;
  /** Før en side valideres. true holder brukeren på siden (f.eks. mens et
   * oppslag kjøres og vises). */
  beforeValidate: (groupKeys: string[]) => Promise<boolean>;
  /** Etter at siden er validert. true betyr at vertikalen selv gikk videre. */
  afterValidate: (groupKeys: string[]) => boolean;
};

/** Flyten til en vertikal som eier hele annonseflyten (kjøretøy:
 * registreringssteget). Når eiergruppen står i en kategoris flyt, vises
 * verken title eller category-attributes, sidene deles i biter
 * (resolveWizardPages), og underkategorien velges på eiergruppens side. */
export type VerticalFlow = {
  /** De lagrede nøklene slik veiviseren skal bruke dem (normalizeFieldGroupKeys). */
  normalize: (keys: string[]) => string[];
  /** Grupper som settes inn rett før review-publish ved kjøring, uten å lagres. */
  runtimeGroups: readonly string[];
  /** Attributtene etter at brukeren har valgt underkategori på eiergruppens side. */
  onSubcategorySelect: (previous: AttributeMap) => AttributeMap;
  /** Rekkefølgen admins flyteditor lagrer. `middle` er de aktive, sorterbare
   * kjernegruppene (MIDDLE_FIELD_GROUP_KEYS) i valgt rekkefølge. */
  adminOrder: (stored: string[], middle: string[]) => string[];
  /** Forklaring over feltgruppene i admins flyteditor. */
  adminInfoNb: string;
};

/** En feltgruppe vertikalen registrerer. Flaggene sier hvordan kjernens
 * flytlogikk (category-flows.ts, ny-annonse.tsx) skal behandle den, slik at
 * kjernen ikke trenger å kjenne nøklene. */
export type VerticalFieldGroup = FieldGroup & {
  /** Vises i admin. */
  labelNb: string;
  /** Egen sidetittel når gruppen står alene på en side. */
  pageLabelNb?: string;
  /** attr-*-feil sendes hit når gruppen er i flyten
   * (CategoryBehavior.attributeReviewGroupKey). */
  attributeReviewFallback?: boolean;
  /** Oppgavesiden gruppen hører til (sideinndeling og sidetittel). */
  task?: ListingTask;
  /** Gruppen får alltid en egen side. */
  solo?: boolean;
  /** Starter en ny side i den oppdelte sideinndelingen uten å stå alene. */
  forceBreakBefore?: boolean;
  /** Delen av forhåndsvisningen (data-preview-section) gruppen redigerer. */
  previewSection?: string;
  /** Delen av Se over-steget som redigeres her. */
  reviewSection?: ReviewSection;
  /** Felt uten egen validering som en valideringsfeil kan sende brukeren hit
   * for, med etiketten feilen vises med. */
  reviewFields?: Readonly<Record<string, string>>;
  /** Gruppen viser kategoriattributter; mislykket validering markerer dem som berørt. */
  editsAttributes?: boolean;
  /** Gruppen er prissteget i flyten (i stedet for price). */
  priceStep?: boolean;
  /** Gruppen har beskrivelsesfeltet, som fyller siden på native når gruppen står alene. */
  hasDescription?: boolean;
  /** Gruppen fanger alle kategoriattributtene og beskrivelsen når den står i
   * kategoriens flyt (båt: boat-facts): category-attributes viser da bare
   * kategorivalget, og description-keywords vises ikke. */
  ownsCategoryAttributes?: boolean;
  /** Gruppen vises bare for disse bladkategoriene. */
  leafSlugs?: readonly string[];
  /** Gruppen er ikke et steg, men tilbys som forbedring på Se over-steget når
   * `when` gir true for kategorien. */
  improvement?: { labelNb: string; when: (behavior: CategoryBehavior) => boolean };
  /** Merknad ved den låste raden i admins flyteditor. */
  adminNoteNb?: string;
  /** Gruppen eier flyten den står i, se VerticalFlow. */
  flow?: VerticalFlow;
};

export type Verticals = {
  /** Ekstra feltgrupper i annonseflyten, se VerticalFieldGroup. */
  fieldGroups: Record<string, VerticalFieldGroup>;
  /** Rotkategorien vertikalen eier (kjøretøy: «Bil og MC»). Underkategorien
   * velges i vertikalens eget steg, og avansert søk tillater bare én
   * underkategori om gangen. */
  rootCategory: { slug: string; nameNb: string };
  /** Utstyrsattributter: samles i én rad i søkepanelet, vises i vertikalens
   * egen utstyrsliste og kreves aldri ved publisering. */
  equipmentFilterKeys: readonly string[];
  /** `select`-filtre der en annonse har én verdi, men kjøperen kan krysse av
   * for flere i søket, i tillegg til SEARCH_MULTISELECT_KEYS. */
  searchMultiselectFilterKeys: readonly string[];
  /** Filtre der hver valgverdi bare finnes i én kategori, slik at et
   * valgnavn i fritekstsøket kan peke rett på kategorien (matchAttributeOptionPhrase). */
  exclusiveOptionFilterKeys: readonly string[];
  /** Oppførselen til kategoriene vertikalen eier, se getCategoryBehavior. */
  categoryBehavior: CategoryBehavior;
  /** Oppførselen til kategorier som har (eller arver) filteret med nøkkelen
   * (båt: boat_type), se filterCategoryBehavior. */
  filterCategoryBehaviors: Record<string, CategoryBehavior>;
  /** Bruksmålet under tittelen på annonsekortet (kjøretøy: kilometerstand,
   * båt: motortimer). Den første nøkkelen annonsen har en tallverdi for, vises. */
  cardUsageKeys: readonly { key: string; unit: string }[];
  /** Sliderskala for tallfiltre, i tillegg til kjernens (filter-range-bounds.ts). */
  numericFilterBounds: Record<string, Omit<RangeBounds, "unit">>;
  /** Maks antall siffer i tallfelt, i tillegg til NUMERIC_DIGIT_CAPS. */
  numericDigitCaps: Record<string, number>;
  /** Egne tilstandsvalg per kategori-slug, brukt i stedet for CONDITIONS. */
  conditionsBySlug: Record<string, readonly { value: ConditionValue; label: string }[]>;
  /** Vertikalens del av annonsesiden, eller null når annonsen ikke hører til
   * den. Med flere vertikaler gjelder den første som svarer. */
  listingDetail: (input: ListingDetailInput) => ListingDetailSections | null;
  /** Nøkkeltall i den utvidede kortvisningen i søkeresultatet, eller null.
   * Med flere vertikaler gjelder den første som svarer. */
  listingCardFacts: (input: {
    categorySlug: string | null;
    attributes: Record<string, unknown>;
  }) => ReactNode;
  /** Owner-only dialog for å endre det vertikalen avleder annonsen fra
   * (kjøretøy: registreringsnummeret), åpnet via openVerticalEditDialog. */
  ListingPlateEditDialog: ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    listingId: string;
    kaupetCode: string;
    currentCategoryId: string | null;
    attributes: Record<string, unknown>;
  }>;
  /** Knapp som starter et 360°-opptak for en annonse. */
  Spin360CaptureLauncher: ComponentType<{
    listingId: string | null;
    ensureListingId?: () => Promise<string | null>;
    listingTitle: string;
    label?: string;
    variant?: "outline" | "ghost";
    size?: "default" | "sm" | "icon";
  }>;
  /** 360-bildene til en annonse, hentet parallelt med annonsen. */
  fetchListing360Frames: (kaupetCode: string) => Promise<Spin360Frame[]>;
  /** 360°-visning først i bildegalleriet og lysboksen. */
  Spin360Viewer: ComponentType<{
    frames: Spin360Frame[];
    imgUrls: Record<string, string>;
    title: string;
  }>;
  brandModel: BrandModelFields;
  compoundAttribute: CompoundAttribute;
  buyerFee: BuyerFeeFields;
  /** Totalprisen kjøperen betaler (kjøretøy: inkl. omregistreringsavgift),
   * eller null når kategorien bare viser selgers pris. */
  listingTotalPriceKr: (
    categorySlug: string | null | undefined,
    priceNok: number | null | undefined,
    attributes: Record<string, unknown> | null | undefined,
  ) => number | null;
  /** Tittel avledet av attributtene for kategorier der den ikke skrives fritt. */
  derivedTitle: (attributes: Record<string, AttributeValue>) => string;
  wizard: {
    useWizard: (ctx: WizardVerticalContext) => WizardVertical;
    /** Lokalt kategoriforslag fra tittelen (kjøretøy: merke/modell i tittelen). */
    useTitleCategoryHint: (params: {
      title: string;
      allFilters: CategoryFilter[] | undefined;
      categories:
        { id: string; slug: string; name_nb: string; parent_id: string | null }[] | undefined;
      categoriesById: Map<string, CategoryNode & { name_nb: string }>;
      verticalRootCategoryId: string | null;
    }) => CategorySuggestion | null;
  };
  /** Utvider valgte multiselect-verdier for et filter i søkespørringen. */
  expandSearchValues: (filterKey: string, values: string[]) => string[];
};

export const verticals: Partial<Verticals> = {};

const noBrands = () => undefined;
const noLabel = () => null;

/** Godkjente merker fra vertikalen; undefined uten registrert vertikal. */
export function useVerticalBrands(enabled = true): BrandRow[] | undefined {
  return (verticals.brandModel?.useBrands ?? noBrands)(enabled);
}

const NO_WIZARD: WizardVertical = {
  // Uten registrert vertikal er WizardVerticalProps tom.
  props: {} as WizardVerticalProps,
  hiddenAttributeKeys: [],
  hasInput: false,
  busyLabel: null,
  reviewNotice: null,
  registered: false,
  calculatedBuyerFeeKr: null,
  beforeValidate: async () => false,
  afterValidate: () => false,
};
const noWizard = () => NO_WIZARD;
const noHint = () => null;

/** Se Verticals.wizard.useWizard. */
export function useWizardVertical(ctx: WizardVerticalContext): WizardVertical {
  return (verticals.wizard?.useWizard ?? noWizard)(ctx);
}

/** Se Verticals.wizard.useTitleCategoryHint. */
export function useVerticalTitleCategoryHint(
  params: Parameters<Verticals["wizard"]["useTitleCategoryHint"]>[0],
): CategorySuggestion | null {
  return (verticals.wizard?.useTitleCategoryHint ?? noHint)(params);
}

/** Se CompoundAttribute.useSearchLabel; null uten registrert vertikal. */
export function useCompoundAttributeSearchLabel(values: string[]): string | null {
  return (verticals.compoundAttribute?.useSearchLabel ?? noLabel)(values);
}

/** Se CompoundAttribute.normalize; uendret uten registrert vertikal. */
export function normalizeCompoundAttributes<T>(
  attributes: Record<string, T>,
  filters: readonly CategoryFilter[],
): Record<string, T> {
  return verticals.compoundAttribute?.normalize(attributes, filters) ?? attributes;
}

/** Feltgruppen med denne nøkkelen, hvis en vertikal har registrert den. */
export function verticalFieldGroup(key: string): VerticalFieldGroup | undefined {
  return verticals.fieldGroups?.[key];
}

/** Alle feltgruppene vertikalene har registrert. */
export function verticalFieldGroups(): VerticalFieldGroup[] {
  return Object.values(verticals.fieldGroups ?? {});
}

/** Flyten til gruppen som eier flyten med disse nøklene, eller null. */
export function flowOwner(keys: readonly string[]): (VerticalFlow & { key: string }) | null {
  for (const key of keys) {
    const flow = verticals.fieldGroups?.[key]?.flow;
    if (flow) return { ...flow, key };
  }
  return null;
}

/** Se Verticals.equipmentFilterKeys; tom uten registrert vertikal. */
export function equipmentFilterKeys(): readonly string[] {
  return verticals.equipmentFilterKeys ?? [];
}

/** Se Verticals.rootCategory; null uten registrert vertikal. */
export function verticalRootCategory(): Verticals["rootCategory"] | null {
  return verticals.rootCategory ?? null;
}

/** Se Verticals.cardUsageKeys: bruksmålet under tittelen på annonsekortet,
 * eller null. */
export function listingCardUsage(
  attributes: Record<string, unknown> | null | undefined,
): { value: number; unit: string } | null {
  for (const { key, unit } of verticals.cardUsageKeys ?? []) {
    const value = attributes?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return { value, unit };
  }
  return null;
}

/** Punkter flere vertikaler kan fylle: lister legges etter hverandre og
 * oppslag slås sammen. */
const MERGED: readonly (keyof Verticals)[] = [
  "fieldGroups",
  "filterCategoryBehaviors",
  "cardUsageKeys",
  "numericFilterBounds",
  "numericDigitCaps",
  "equipmentFilterKeys",
  "searchMultiselectFilterKeys",
  "exclusiveOptionFilterKeys",
  "conditionsBySlug",
];

/** Kobler en vertikal inn. Punktene i MERGED og de to annonsesideoppslagene
 * deles mellom vertikalene; de andre punktene kan bare én vertikal fylle (den
 * siste vinner). */
export function registerVertical(vertical: Partial<Verticals>) {
  const { listingDetail, listingCardFacts, ...rest } = vertical;
  const target = verticals as Record<string, unknown>;
  for (const [key, value] of Object.entries(rest)) {
    const previous = target[key];
    if (!MERGED.includes(key as keyof Verticals) || previous === undefined) {
      target[key] = value;
    } else {
      target[key] = Array.isArray(previous)
        ? [...previous, ...(value as unknown[])]
        : { ...(previous as object), ...(value as object) };
    }
  }
  if (listingDetail) {
    const previous = verticals.listingDetail;
    verticals.listingDetail = previous
      ? (input) => previous(input) ?? listingDetail(input)
      : listingDetail;
  }
  if (listingCardFacts) {
    const previous = verticals.listingCardFacts;
    verticals.listingCardFacts = previous
      ? (input) => previous(input) ?? listingCardFacts(input)
      : listingCardFacts;
  }
}
