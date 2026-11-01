// kaupet_open-stub. Admin-hendelser hører til statistikken, som ikke finnes i kaupet_open.
import type { QueryClient } from "@tanstack/react-query";

export const ADMIN_EVENTS_COUNT_KEY = ["admin-events-open-count"] as const;

export function useAdminOpenEventsCount(): number {
  return 0;
}

export function invalidateAdminEvents(_qc: QueryClient) {}
