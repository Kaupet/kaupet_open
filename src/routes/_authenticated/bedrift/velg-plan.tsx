// kaupet_open-stub. Valg av bedriftsplan finnes ikke i kaupet_open. Ruten finnes slik at
// kjernens typede lenker hit fortsatt kompilerer, og sender videre.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/bedrift/velg-plan")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
