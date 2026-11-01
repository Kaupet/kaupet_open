/** Tallstreng i norsk skrivemåte → tall: mellomrom som tusenskille
 * («150 000») fjernes og desimalkomma («12,5») blir punktum. «12,500» og
 * «150.000» kan være både desimal og tusenskille og gir null, så valideringen
 * avviser dem. Samme regel som tallryddingen i 20261013170000. */
export function parseNumericString(value: string): number | null {
  const stripped = value.replace(/[\s\u00a0\u2009\u202f]/g, "");
  if (/^-?\d{1,3}[.,]\d{3}$/.test(stripped)) return null;
  const canonical = stripped.replace(/^(-?\d+),(\d+)$/, "$1.$2");
  if (!/^-?[0-9]+(\.[0-9]+)?$/.test(canonical)) return null;
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}
