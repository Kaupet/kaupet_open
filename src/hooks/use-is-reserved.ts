import { useEffect, useReducer } from "react";

import { isReservedNow } from "@/lib/reservation";

/** Fjern merket ved fristen selv om annonseobjektet blir liggende i cachen. */
export function useIsReserved(reservedUntil: string | null | undefined) {
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  useEffect(() => {
    if (!reservedUntil) return;
    const delay = Date.parse(reservedUntil) - Date.now();
    if (!(delay > 0)) return;
    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [reservedUntil]);
  return isReservedNow(reservedUntil);
}
