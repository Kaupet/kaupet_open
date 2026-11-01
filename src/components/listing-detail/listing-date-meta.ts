import { formatDate, formatDateLong } from "@/lib/format";
export function getListingDateMeta(
  listingStatus: string | null | undefined,
  publishedAt: string | null,
  createdAt: string,
  updatedAt: string | null,
) {
  const fmt = (s: string) => formatDateLong(s);
  if (listingStatus === "draft") return { label: "Opprettet", dateStr: fmt(createdAt) };
  const published = publishedAt ?? createdAt;
  const isEditedLater =
    updatedAt != null &&
    Date.parse(updatedAt) > Date.parse(published) &&
    formatDate(updatedAt) !== formatDate(published);
  return {
    label: isEditedLater ? "Sist redigert" : "Publisert",
    dateStr: fmt(isEditedLater && updatedAt ? updatedAt : (publishedAt ?? createdAt)),
  };
}
