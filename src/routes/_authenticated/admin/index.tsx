// kaupet_open-erstatning. Administrasjonen starter på moderering; en
// statistikkoversikt er ikke med.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/moderasjon", replace: true });
  },
});
