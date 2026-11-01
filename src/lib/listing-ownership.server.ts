// kaupet_open: annonser eies bare av privatpersoner.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ClientError } from "@/lib/to-client-error";

/** Ingen eierfelt i utkast-/publiseringsskjemaet. */
export const listingOwnershipInputShape = {};
export type ListingOwnershipInput = Record<never, never>;

/** Ingen eierkolonner utover seller_id. */
export const LISTING_OWNER_COLUMNS = "";
export type ListingOwnerFields = Record<never, never>;

export type ListingOwnerInsert = { seller_id: string };
export type ListingOwnerPatch = Record<never, never>;

export function assertDraftOwner(_input: ListingOwnershipInput, _row: ListingOwnerFields) {}

export async function newListingOwner(
  _supabaseAdmin: SupabaseClient,
  userId: string,
  _categoryId: string | null,
  _input: ListingOwnershipInput,
): Promise<ListingOwnerInsert> {
  return { seller_id: userId };
}

export async function draftOwnerPatch(
  _supabaseAdmin: SupabaseClient,
  _userId: string,
  _existing: ListingOwnerFields,
  _categoryId: string | null,
  _input: ListingOwnershipInput,
): Promise<ListingOwnerPatch> {
  return {};
}

export async function publishOwnerPatch(
  _supabaseAdmin: SupabaseClient,
  _userId: string,
  _existing: ListingOwnerFields,
  _categoryId: string,
  _input: ListingOwnershipInput,
): Promise<ListingOwnerPatch> {
  return {};
}

/** Bare selgeren selv kan endre en annonse. */
export async function authorizeListingOwner(
  _supabaseAdmin: SupabaseClient,
  userId: string,
  listing: { seller_id: string },
): Promise<void> {
  if (listing.seller_id !== userId) {
    throw new ClientError("Du har ikke tilgang til denne annonsen", 403);
  }
}

export async function assertDraftRepublishAllowed(
  _supabaseAdmin: SupabaseClient,
  _userId: string,
  _listing: ListingOwnerFields & { category_id: string | null },
): Promise<void> {}

export async function assertCategoryChangeAllowed(
  _supabaseAdmin: SupabaseClient,
  _userId: string,
  _listing: ListingOwnerFields & { seller_id: string; status: string; category_id: string | null },
  _newCategoryId: string,
): Promise<void> {}
