import type { WizardSharedProps, ComposerReviewStatus, ComposerReviewGroup } from "../types";
import { verticalFieldGroup } from "@/lib/verticals";

/**
 * Optional "gjør annonsen bedre"-forbedringer avledet fra samme
 * klassifisering som publiseringskravene (registry: recommendedForTrust /
 * optionalEnhancement) — ikke en egen regelmotor. Delt mellom
 * ReviewPublishGroup (mobil, øverst på Se over) og ny-annonse.tsx sin
 * desktop-aside (gjennom hele flyten), så de to alltid viser samme liste.
 * Egen fil (ikke review-publish/index.tsx) fordi den ikke er en komponent —
 * å eksportere den ved siden av komponentene der brøt fast refresh.
 */
export function deriveComposerImprovements(
  props: Pick<
    WizardSharedProps,
    | "improvementGroupKeys"
    | "improvementGroups"
    | "images"
    | "previewPrice"
    | "city"
    | "postalCode"
    | "onEditReviewSection"
  >,
): ComposerReviewStatus[] {
  const improvementGroups: ComposerReviewGroup[] =
    props.improvementGroups ??
    props.improvementGroupKeys.map((key) => ({
      key,
      classification:
        verticalFieldGroup(key)?.classification === "optionalEnhancement"
          ? ("optionalEnhancement" as const)
          : ("recommendedForTrust" as const),
    }));
  const improvementClassification = (key: string) =>
    improvementGroups.find((group) => group.key === key)?.classification ?? "recommendedForTrust";
  const editGroup = (key: string) => {
    const section =
      key === "category-select" || key === "category-confirm"
        ? "category"
        : key === "photos" || key === "title"
          ? "content"
          : key === "delivery" || key === "location"
            ? "location"
            : "details";
    props.onEditReviewSection(section, { groupKey: key });
  };
  // Prissteget: price, eller vertikalens egen gruppe med priceStep.
  const priceKey = props.improvementGroupKeys.includes("price")
    ? "price"
    : props.improvementGroupKeys.find((key) => verticalFieldGroup(key)?.priceStep);
  return (
    [
      props.improvementGroupKeys.includes("photos") && props.images.length === 0
        ? {
            key: "photos",
            label: "Legg til bilder",
            classification: improvementClassification("photos"),
            onAction: () => editGroup("photos"),
          }
        : null,
      priceKey && !props.previewPrice
        ? {
            key: "price",
            label: "Oppgi pris",
            classification: improvementClassification(priceKey),
            onAction: () => editGroup(priceKey),
          }
        : null,
      props.improvementGroupKeys.includes("location") && !props.city && !props.postalCode
        ? {
            key: "location",
            label: "Oppgi sted",
            classification: improvementClassification("location"),
            onAction: () => editGroup("location"),
          }
        : null,
      ...props.improvementGroupKeys.map((key) => {
        const improvement = verticalFieldGroup(key)?.improvement;
        return improvement
          ? {
              key,
              label: improvement.labelNb,
              classification: improvementClassification(key),
              onAction: () => editGroup(key),
            }
          : null;
      }),
    ] as (ComposerReviewStatus | null)[]
  ).filter((item): item is ComposerReviewStatus => item !== null);
}
