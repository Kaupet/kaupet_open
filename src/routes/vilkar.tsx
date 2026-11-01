// kaupet_open: tom side for brukervilkårene når oppstartsveiviseren har slått
// dem på (VITE_OPEN_LEGAL_PAGES). Teksten legges i
// components/legal/vilkar-content.tsx. Ellers sendes besøkende til forsiden.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { VilkarContent } from "@/components/legal/vilkar-content";
import { NativePageHeader } from "@/components/native-page-header";
import { LEGAL_PAGES, SITE_NAME } from "@/lib/site";

export const Route = createFileRoute("/vilkar")({
  beforeLoad: () => {
    if (!LEGAL_PAGES) throw redirect({ to: "/", replace: true });
  },
  head: () => ({ meta: [{ title: `Brukervilkår — ${SITE_NAME}` }] }),
  component: () => (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <NativePageHeader title="Vilkår" />
      <h1 className="mb-10 font-display text-4xl tracking-tight">Brukervilkår</h1>
      <VilkarContent />
    </article>
  ),
});
