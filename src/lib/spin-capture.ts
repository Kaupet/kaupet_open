/**
 * Hvilke annonsestatuser som kan få et nytt 360°-opptak. Delt mellom
 * «Mine annonser» (overflow-menyen) og eier-panelet på annonsevisningen, slik
 * at de to inngangene til 360°-steget gater likt. Solgte, utløpte og
 * moderator-deaktiverte annonser skal ikke tilby opptak (og ikke lage
 * opptaksøkter). Vertikal-agnostisk: om kategorien støtter 360° avgjøres av
 * `CategoryBehavior.spin360`.
 */
export function canAddSpin360Capture(status: string | null | undefined): boolean {
  return status === "draft" || status === "active";
}

/**
 * Hvilken variant av 360°-steget eier-panelet på annonsevisningen skal vise:
 * kamera-opptak i appen (native), QR-kode til appen (desktop-nettleser) eller
 * ingenting. QR-koden vises ikke i smale nettlesere — der er brukeren som
 * regel på telefonen som skulle skannet koden.
 */
export function spin360OwnerVariant({
  spin360,
  status,
  listingId,
  isNative,
  isDesktop,
}: {
  spin360: boolean;
  status: string | null | undefined;
  listingId: string | null | undefined;
  isNative: boolean;
  isDesktop: boolean;
}): "native-capture" | "qr" | null {
  if (!spin360 || !listingId || !canAddSpin360Capture(status)) return null;
  if (isNative) return "native-capture";
  return isDesktop ? "qr" : null;
}
