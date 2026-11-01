import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/inbox-page";
import { SITE_NAME } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/meldinger/")({
  // Ikke gjennomgått for SSR ennå. Forelderen (_authenticated) har SSR på
  // for /mine-annonser; denne ruten beholder klientrendring inntil den er
  // verifisert server-side.
  ssr: false,
  head: () => ({
    meta: [
      { title: `Meldinger — ${SITE_NAME}` },
      { name: "description", content: "Dine samtaler med kjøpere og selgere." },
    ],
  }),
  component: InboxPage,
});
