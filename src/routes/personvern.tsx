// kaupet_open: tom side for personvernerklæringen når oppstartsveiviseren har
// slått den på (VITE_OPEN_LEGAL_PAGES). Teksten legges i
// components/legal/personvern-content.tsx. Ellers sendes besøkende til forsiden.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { PersonvernContent } from "@/components/legal/personvern-content";
import { NativePageHeader } from "@/components/native-page-header";
import { LEGAL_PAGES, SITE_NAME } from "@/lib/site";

export const Route = createFileRoute("/personvern")({
  beforeLoad: () => {
    if (!LEGAL_PAGES) throw redirect({ to: "/", replace: true });
  },
  head: () => ({ meta: [{ title: `Personvernerklæring — ${SITE_NAME}` }] }),
  component: () => (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <NativePageHeader title="Personvern" />
      <h1 className="mb-10 font-display text-4xl tracking-tight">Personvernerklæring</h1>
      <PersonvernContent />
    </article>
  ),
});
