// kaupet_open-stub. «Ønskes kjøpt» finnes ikke i kaupet_open. Ruten finnes slik at
// kjernens typede lenker hit fortsatt kompilerer, og sender videre.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ny-ok-annonse")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
