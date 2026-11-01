// kaupet_open: søkeformatet er felles, lagring og varsler er private.
import type { AttributeFilterValue } from "@/lib/category-filters";
import type { TermGroup } from "@/lib/term-groups";

export type SearchCriteria = {
  q?: string;
  terms?: string[];
  qMode?: "all" | "any";
  extraGroups?: TermGroup[];
  categories?: string[];
  catMode?: "all" | "any";
  conditions?: string[];
  min?: number | null;
  max?: number | null;
  includeFree?: boolean;
  sort?: "new" | "price_asc" | "price_desc";
  lat?: number | null;
  lng?: number | null;
  radius?: number | null;
  loc?: string;
  attributes?: Record<string, AttributeFilterValue>;
};

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  criteria: SearchCriteria;
  notify: boolean;
  created_at: string;
  updated_at: string;
};

export type SavedSearchNotification = {
  id: string;
  saved_search_id: string;
  listing_id: string;
  read_at: string | null;
  created_at: string;
};

export function summarizeCriteria(c: SearchCriteria): string {
  const parts: string[] = [];
  const terms = c.terms?.length ? c.terms : c.q ? c.q.split(/\s+/).filter(Boolean) : [];
  if (terms.length) {
    const joiner = c.qMode === "any" ? " ELLER " : " OG ";
    parts.push(`"${terms.join(terms.length > 1 ? joiner : " ")}"`);
  }
  for (const g of c.extraGroups ?? []) {
    if (g.terms.length === 0) continue;
    const joiner = g.mode === "all" ? " OG " : " ELLER ";
    const sign = g.exclude ? "−" : "+";
    parts.push(`${sign}${g.terms.join(joiner)}`);
  }
  if (c.categories?.length)
    parts.push(`${c.categories.length} kategori${c.categories.length === 1 ? "" : "er"}`);
  if (c.conditions?.length)
    parts.push(`${c.conditions.length} tilstand${c.conditions.length === 1 ? "" : "er"}`);
  if (c.min != null || c.max != null) {
    const min = c.min != null ? `${c.min} kr` : "0 kr";
    const max = c.max != null ? `${c.max} kr` : "∞";
    parts.push(`${min}–${max}`);
  }
  if (c.loc) parts.push(`${c.loc}${c.radius ? ` (${c.radius} km)` : ""}`);
  const attributeCount = Object.keys(c.attributes ?? {}).length;
  if (attributeCount) {
    parts.push(`${attributeCount} egenskap${attributeCount === 1 ? "" : "er"}`);
  }
  return parts.length ? parts.join(" · ") : "Alle annonser";
}

/** Søkenavn uten anførselstegnene summarizeCriteria setter rundt søkeordene
 * (`"volvo" · 1 kategori`) — også for eldre lagrede navn. Andre tegn, som
 * tommer i `Sykkel 26"`, beholdes. */
export function savedSearchLabel(name: string): string {
  return name.replace(/^"([^"]*)"/, "$1").trim();
}

export type UnreadCountBySearch = { saved_search_id: string; unread_count: number };
export type PriceDropNotification = {
  id: string;
  listing_id: string;
  old_price_nok: number;
  new_price_nok: number;
  drop_pct: number;
  read_at: string | null;
  created_at: string;
};
export type SoldNotification = {
  id: string;
  listing_id: string;
  read_at: string | null;
  created_at: string;
};

function unavailable(): never {
  throw new Error("Lagrede søk og varsler er ikke tilgjengelige.");
}
export async function listSavedSearches(): Promise<SavedSearch[]> {
  return [];
}
export async function createSavedSearch(
  _name: string,
  _criteria: SearchCriteria,
  _notify = true,
): Promise<SavedSearch> {
  return unavailable();
}
export async function updateSavedSearch(
  _id: string,
  _patch: Partial<Pick<SavedSearch, "name" | "criteria" | "notify">>,
) {
  return unavailable();
}
export async function deleteSavedSearch(_id: string) {
  return unavailable();
}
export async function listNotifications(
  _limit = 30,
  _offset = 0,
): Promise<SavedSearchNotification[]> {
  return [];
}
export async function listUnreadCountsBySearch(): Promise<Map<string, number>> {
  return new Map();
}
export async function markNotificationRead(_id: string) {
  return unavailable();
}
export async function markAllNotificationsRead() {
  return unavailable();
}
export async function deleteNotification(_id: string) {
  return unavailable();
}
export async function listPriceDrops(_limit = 30, _offset = 0): Promise<PriceDropNotification[]> {
  return [];
}
export async function markPriceDropRead(_id: string) {
  return unavailable();
}
export async function markAllPriceDropsRead() {
  return unavailable();
}
export async function deletePriceDrop(_id: string) {
  return unavailable();
}
export async function listSoldNotifications(_limit = 30, _offset = 0): Promise<SoldNotification[]> {
  return [];
}
export async function markSoldNotificationRead(_id: string) {
  return unavailable();
}
export async function markAllSoldNotificationsRead() {
  return unavailable();
}
export async function deleteSoldNotification(_id: string) {
  return unavailable();
}
