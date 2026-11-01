// kaupet_open-stub. Betalingsbekreftelse for fremheving finnes ikke i kaupet_open. Ruten finnes slik at
// kjernens typede lenker hit fortsatt kompilerer, og sender videre.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/bekrefter/$promoId")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
