// kaupet_open: «Meg»-fanen i appen med bare kjernelenkene. Varsler, lagrede
// søk, bedrift, tema, test-modus, tilbakemelding og «Om»-siden er ikke med.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { NativePageHeader } from "@/components/native-page-header";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-user-roles";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/meg")({
  ssr: false,
  component: MegPage,
});

const LINKS = [
  { to: "/profil", label: "Min profil" },
  { to: "/mine-annonser", label: "Mine annonser" },
  { to: "/favoritter", label: "Favoritter" },
] as const;

function MegPage() {
  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();

  return (
    <>
      <NativePageHeader title="Meg" hideBack />
      <nav aria-label="Meg" className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="flex min-h-12 items-center px-4 text-sm font-medium">
                {link.label}
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li>
              <Link to="/admin" className="flex min-h-12 items-center px-4 text-sm font-medium">
                Administrasjon
              </Link>
            </li>
          )}
        </ul>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await supabase.auth.signOut();
            void navigate({ to: "/" });
          }}
        >
          Logg ut
        </Button>
      </nav>
    </>
  );
}
