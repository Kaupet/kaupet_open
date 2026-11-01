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
import type {
  AttributeFilterValue,
  AttributeValue,
  CategoryFilter,
  CategoryNode,
  ValueGroup,
} from "@/lib/category-filters";

/**
 * Registreringspunkter for kategorivertikaler. Kjernen importerer aldri
 * vertikalkode: kjøretøy fyller inn punktene fra src/lib/vehicle/register.ts,
 * som importeres én gang ved oppstart (src/router.tsx). Uten registrert
 * vertikal (kaupet_open) er alle punktene tomme, og kjernen faller tilbake
 * til generisk oppførsel.
 *
 * Modulen importerer bare typer, slik at registreringen ikke drar
 * annonseflyten eller annonsesiden inn i inngangsbunten.
 */
/** Det annonsesiden gir vertikalen for å avlede sin del av siden. */
export type ListingDetailInput = {
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

/** Merke- og modellfeltene (filtertypene parent_select/child_select) og
 * delpassform (PART_FITMENT_*), som begge slår opp i vertikalens
 * verdilister. Uten registrert vertikal er listene tomme, feltene vises ikke,
 * og ingenting hentes. */
export type BrandModelFields = {
  useBrands: (enabled: boolean) => BrandRow[] | undefined;
  fetchBrands: (queryClient: QueryClient) => Promise<BrandRow[]>;
  /** Kort etikett for valgte modell-id-er i delpassformfilteret, f.eks. «Volvo (alle)». */
  usePartFitmentLabel: (modelIds: string[]) => string | null;
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
  PartFitmentField: ComponentType<{
    value: Record<string, AttributeValue>;
    onChange: (next: Record<string, AttributeValue>) => void;
    required?: boolean;
    scopeError?: string;
    modelsError?: string;
  }>;
  PartFitmentSearchField: ComponentType<{
    value: AttributeFilterValue | undefined;
    onChange: (value: AttributeFilterValue | undefined) => void;
    contentOnly?: boolean;
  }>;
  PartFitmentSummary: ComponentType<{ attributes: Record<string, unknown> }>;
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
  /** Felt uten egen validering som en valideringsfeil kan sende brukeren hit for. */
  reviewFields?: readonly string[];
  /** Gruppen viser kategoriattributter; mislykket validering markerer dem som berørt. */
  editsAttributes?: boolean;
  /** Gruppen er prissteget i flyten (i stedet for price). */
  priceStep?: boolean;
  /** Gruppen har beskrivelsesfeltet, som fyller siden på native når gruppen står alene. */
  hasDescription?: boolean;
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
  /** Filtre der hver valgverdi bare finnes i én kategori, slik at et
   * valgnavn i fritekstsøket kan peke rett på kategorien (matchAttributeOptionPhrase). */
  exclusiveOptionFilterKeys: readonly string[];
  /** Oppførselen til kategoriene vertikalen eier, se getCategoryBehavior. */
  categoryBehavior: CategoryBehavior;
  /** Egne tilstandsvalg per kategori-slug, brukt i stedet for CONDITIONS. */
  conditionsBySlug: Record<string, readonly { value: ConditionValue; label: string }[]>;
  /** Vertikalens del av annonsesiden, eller null når annonsen ikke hører til den. */
  listingDetail: (input: ListingDetailInput) => ListingDetailSections | null;
  /** Nøkkeltall i den utvidede kortvisningen i søkeresultatet, eller null. */
  listingCardFacts: (input: {
    categorySlug: string | null;
    attributes: Record<string, unknown>;
    mileageKm: number | null;
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

/** Se BrandModelFields.usePartFitmentLabel; null uten registrert vertikal. */
export function usePartFitmentLabel(modelIds: string[]): string | null {
  return (verticals.brandModel?.usePartFitmentLabel ?? noLabel)(modelIds);
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

export function registerVertical(vertical: Partial<Verticals>) {
  Object.assign(verticals, vertical);
}
