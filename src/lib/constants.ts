import { verticals } from "@/lib/verticals";

/** Høyeste pris en annonse kan ha. Felles for prisfeltet, klientskjemaet,
 * utkastlagring og publisering, så brukeren aldri kan skrive en pris som
 * serveren avviser først ved lagring. */
export const MAX_LISTING_PRICE_NOK = 10_000_000;

export const CONDITIONS = [
  { value: "new", label: "Helt ny", description: "Ubrukt, med eller uten original emballasje" },
  { value: "like_new", label: "Som ny", description: "Brukt svært lite — ingen synlige feil" },
  { value: "good", label: "Pent brukt", description: "Noe bruk, men i god stand" },
  {
    value: "acceptable",
    label: "Brukt med slitasje",
    description: "Tydelige bruksspor, men fungerer som normalt",
  },
  {
    value: "for_parts",
    label: "Må repareres",
    description: "Defekt eller mangler deler — selges for reparasjon",
  },
] as const;

export const CONDITION_LABEL: Record<string, string> = {
  new: "Helt ny",
  like_new: "Som ny",
  good: "Pent brukt",
  acceptable: "Brukt med slitasje",
  for_parts: "Må repareres",
};

export type ConditionValue = "new" | "like_new" | "good" | "acceptable" | "for_parts";

/** Tilstandsvalg en vertikal har registrert for en kategori (f.eks.
 * «Bruktbil» for bil), eller undefined når kategorien bruker CONDITIONS. */
export function verticalConditionsFor(
  categorySlug: string | null | undefined,
): readonly { value: ConditionValue; label: string }[] | undefined {
  return categorySlug ? verticals.conditionsBySlug?.[categorySlug] : undefined;
}

/** Visningsetikett for en tilstandsverdi i kategorien. */
export function conditionLabelFor(categorySlug: string | null | undefined, value: string): string {
  return (
    verticalConditionsFor(categorySlug)?.find((c) => c.value === value)?.label ??
    CONDITION_LABEL[value] ??
    value
  );
}

export const STATUS_LABEL: Record<"draft" | "active" | "sold" | "archived" | "expired", string> = {
  draft: "Utkast",
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
  expired: "Utløpt",
};
