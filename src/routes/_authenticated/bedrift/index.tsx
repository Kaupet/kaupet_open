// kaupet_open-stub. Bedriftskonsollen finnes ikke i kaupet_open. Ruten finnes slik at
// kjernens typede lenker hit fortsatt kompilerer, og sender videre.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/bedrift/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; location?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    location: typeof search.location === "string" ? search.location : undefined,
  }),
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
