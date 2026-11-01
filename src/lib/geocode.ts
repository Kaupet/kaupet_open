// kaupet_open: ingen eksterne stedsoppslag. Sted og postnummer fylles ut manuelt.
export type PlaceSearchResult = { id: string; label: string; lat: number; lng: number };
export async function searchPlaces(_query: string, _limit = 6): Promise<PlaceSearchResult[]> {
  return [];
}
export async function lookupPostalCode(
  _postal: string,
): Promise<{ city: string; lat: number; lng: number } | null> {
  return null;
}
export async function geocodeNorwayAddress(_input: {
  postal_code?: string | null;
  city?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  return null;
}
export async function geocodeStreetAddress(_input: {
  address_line: string;
  postal_code: string;
}): Promise<{ lat: number; lng: number } | null> {
  return null;
}
export async function reverseGeocodeAddress(_input: {
  lat: number;
  lng: number;
}): Promise<{ city: string | null; postal_code: string | null }> {
  return { city: null, postal_code: null };
}
export async function reverseGeocode(_input: { lat: number; lng: number }): Promise<string | null> {
  return null;
}
