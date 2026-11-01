// kaupet_open: annonser eies bare av privatpersoner.
import type { ListingCardData } from "@/lib/listing-card-data";

/** Ingen bedriftskolonne på annonser. */
export const LISTING_ORGANIZATION_COLUMN = "";

export function listingOrganizationId(_listing: object | null | undefined): string | null {
  return null;
}

export async function organizationOtherListings(
  _organizationId: string,
  _excludeListingId: string,
): Promise<ListingCardData[]> {
  return [];
}
export type BusinessContactResponse = {
  visiting_address: {
    address_line: string;
    postal_code: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  contacts: { id: string; name: string; phone: string; avatar_path: string | null }[];
};

export type ListingBusinessData = {
  organization: {
    id: string;
    display_name: string;
    organization_number: string;
    created_at: string;
    website_url: string | null;
    logo_path: string | null;
    brand_palette: string | null;
    listing_concept: string | null;
    listing_font: string | null;
    listing_overtitle: string | null;
    has_active_proff: boolean | null;
  };
  contact: BusinessContactResponse | null;
};

export async function listingBusinessData(
  _listingId: string,
  _organizationId: string | null,
): Promise<ListingBusinessData | null> {
  return null;
}
