// kaupet_open: annonser eies alltid av privatpersonen, så veiviseren sender ingen eierfelt.
export function ownerPayload(
  _organizationId: string | null,
  _locationId: string | null | undefined,
): Record<never, never> {
  return {};
}
