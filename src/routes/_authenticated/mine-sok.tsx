// kaupet_open-stub. Lagrede søk finnes ikke i kaupet_open. Ruten finnes slik at
// kjernens typede lenker hit fortsatt kompilerer, og sender videre.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mine-sok")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
