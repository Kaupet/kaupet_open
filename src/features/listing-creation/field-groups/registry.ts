import type { ComponentType } from "react";

import { PhotosGroup, TitleGroup } from "./title-photos";
import { CategorySelect } from "./category-select";
import { CategoryConfirm } from "./category-confirm";
import { CategoryAttributes } from "./category-attributes";
import { Condition } from "./condition";
import { PriceGroup } from "./price";
import { DescriptionKeywordsGroup } from "./description-keywords";
import { DeliveryGroup, LocationGroup } from "./delivery-location";
import { ReviewPublishGroup } from "./review-publish";
import type { ListingFormShape, WizardSharedProps, WizardVerticalProps } from "./types";
import type { CategoryBehavior } from "@/lib/category-behavior";
import { verticals } from "@/lib/verticals";
import { listingTaskFor, type ListingTask } from "@/features/listing-creation/category-flows";

/** Context passed to a field-group's `validateExtra`, mirroring what
 * `goToStep2/3` used to close over directly in ny-annonse.tsx. Vertikalens
 * props (WizardVerticalProps) er med, slik at dens feltgrupper kan validere
 * mot dem. */
export type ValidateCtx = WizardVerticalProps & {
  images: WizardSharedProps["images"];
  attributes: WizardSharedProps["attributes"];
  attributesOwnedByGroup: boolean;
  missingFilters: { key: string; label_nb: string }[];
  isFree: boolean;
  priceNok: WizardSharedProps["priceNok"];
  categoryId: string;
  categories: WizardSharedProps["categories"];
  verticalRootCategoryId: string | null;
  behavior: CategoryBehavior;
  knownIssues: WizardSharedProps["knownIssues"];
  noKnownIssues: WizardSharedProps["noKnownIssues"];
  canShip: WizardSharedProps["canShip"];
};

export type FieldGroup = {
  key: string;
  classification: "requiredToPublish" | "recommendedForTrust" | "optionalEnhancement";
  Component: ComponentType<WizardSharedProps>;
  fieldsToValidate?: (keyof ListingFormShape)[];
  validateExtra?: (
    ctx: ValidateCtx,
  ) => "CONFIRM_NO_IMAGE" | string | { field: string; message: string } | null;
};

export const FIELD_GROUP_REGISTRY: Record<string, FieldGroup> = {
  "category-select": {
    key: "category-select",
    classification: "requiredToPublish",
    Component: CategorySelect,
    fieldsToValidate: ["category_id"],
  },
  "category-confirm": {
    key: "category-confirm",
    classification: "requiredToPublish",
    Component: CategoryConfirm,
    fieldsToValidate: ["category_id"],
  },
  photos: {
    key: "photos",
    classification: "recommendedForTrust",
    Component: PhotosGroup,
    validateExtra: (ctx) => (ctx.images.length === 0 ? "CONFIRM_NO_IMAGE" : null),
  },
  title: {
    key: "title",
    classification: "requiredToPublish",
    Component: TitleGroup,
    fieldsToValidate: ["title"],
  },
  "category-attributes": {
    key: "category-attributes",
    classification: "requiredToPublish",
    Component: CategoryAttributes,
    fieldsToValidate: ["category_id"],
    validateExtra: (ctx) => {
      // Kategorier der vertikalen fanger egenskapene i egne steg, rendrer
      // ingenting her (se CategoryAttributes) og validerer derfor heller
      // ikke noe her.
      if (!ctx.behavior.showGenericAttributes || ctx.attributesOwnedByGroup) return null;
      const firstMissingFilter = ctx.missingFilters[0];
      if (firstMissingFilter) {
        return {
          field: firstMissingFilter.key,
          message: `Fyll inn ${firstMissingFilter.label_nb.toLowerCase()} før du går videre.`,
        };
      }
      return null;
    },
  },
  condition: {
    key: "condition",
    classification: "requiredToPublish",
    Component: Condition,
    fieldsToValidate: ["condition"],
  },
  price: {
    key: "price",
    classification: "requiredToPublish",
    Component: PriceGroup,
    fieldsToValidate: ["price_nok"],
    validateExtra: (ctx) =>
      !ctx.isFree && (ctx.priceNok === "" || ctx.priceNok === undefined)
        ? { field: "price_nok", message: "Oppgi en pris før annonsen publiseres." }
        : null,
  },
  "description-keywords": {
    key: "description-keywords",
    classification: "requiredToPublish",
    Component: DescriptionKeywordsGroup,
    fieldsToValidate: ["description"],
  },
  delivery: {
    key: "delivery",
    classification: "requiredToPublish",
    Component: DeliveryGroup,
    fieldsToValidate: ["can_ship"],
    validateExtra: (ctx) =>
      ctx.behavior.requiresDeliveryMethod && ctx.canShip == null
        ? { field: "can_ship", message: "Velg en leveringsmetode før du går videre." }
        : null,
  },
  location: {
    key: "location",
    classification: "recommendedForTrust",
    Component: LocationGroup,
  },
  "review-publish": {
    key: "review-publish",
    classification: "requiredToPublish",
    Component: ReviewPublishGroup,
  },
};

/** Finner en feltgruppe i kjernen eller blant gruppene en vertikal har registrert. */
export function fieldGroupFor(key: string): FieldGroup | undefined {
  return FIELD_GROUP_REGISTRY[key] ?? verticals.fieldGroups?.[key];
}

/** Resolves field-group keys (from a category flow) to registered field groups. */
export function fieldGroupsForKeys(keys: string[]): FieldGroup[] {
  return keys.map(fieldGroupFor).filter((g): g is FieldGroup => !!g);
}

/** Shared Norwegian task labels for the step indicator, page heading and the
 * web next-button. Structural category/registration pages keep their own
 * labels outside the four content tasks. */
const LISTING_TASK_LABEL_NB: Record<ListingTask, string> = {
  showcase: "Tittel og bilder",
  searchable: "Om tingen",
  trade: "Pris og henting",
  review: "Se over",
};

const STRUCTURAL_PAGE_LABEL_NB: Record<string, string> = {
  "category-select": "Kategori",
  "category-confirm": "Kategori",
};

/** Representative label for a wizard page, derived from its semantic task. */
export function pageLabel(groups: FieldGroup[]): string {
  const key = groups[0]?.key;
  if (!key) return "Steg";
  const task = listingTaskFor(key);
  if (task) return LISTING_TASK_LABEL_NB[task];
  return STRUCTURAL_PAGE_LABEL_NB[key] ?? verticals.fieldGroups?.[key]?.pageLabelNb ?? "Steg";
}

/** Norwegian admin-display labels — distinct from the step-indicator labels above (different audience/purpose). */
const FIELD_GROUP_LABELS_NB: Record<string, string> = {
  "category-select": "Kategori",
  "category-confirm": "Bekreft kategori",
  photos: "Bilder",
  title: "Tittel",
  "category-attributes": "Kategoriegenskaper",
  condition: "Tilstand",
  price: "Pris",
  "description-keywords": "Beskrivelse & nøkkelord",
  delivery: "Levering",
  location: "Sted",
  "review-publish": "Forhåndsvisning & publiser",
};

/** Admin-etikett for en feltgruppe, også for grupper en vertikal har registrert. */
export function fieldGroupLabelNb(key: string): string {
  return FIELD_GROUP_LABELS_NB[key] ?? verticals.fieldGroups?.[key]?.labelNb ?? key;
}

/** Field groups every flow must include — admin UI won't let these be unchecked; enforced in DB too. */
export const LOCKED_FIELD_GROUP_KEYS: string[] = [
  "photos",
  "title",
  "category-attributes",
  "description-keywords",
  "review-publish",
];
