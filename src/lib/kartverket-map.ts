export type MapCoordinate = { lat: number; lng: number };

// kaupet_open: ingen ekstern kartleverandør.
export const KARTVERKET_TILE_LAYER = { attribution: "", url: "" } as const;

export function isValidMapCoordinate(
  coordinate: Partial<MapCoordinate> | null | undefined,
): coordinate is MapCoordinate {
  const lat = coordinate?.lat;
  const lng = coordinate?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
