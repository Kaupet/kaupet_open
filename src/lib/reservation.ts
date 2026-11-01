/** En annonse er reservert så lenge reserved_until ligger fram i tid; statusen endres aldri. */
export function isReservedNow(reservedUntil: string | null | undefined, now = Date.now()) {
  return !!reservedUntil && new Date(reservedUntil).getTime() > now;
}
