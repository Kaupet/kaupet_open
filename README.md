# kaupet_open

En markedsplass for kjøp og salg av brukte ting, på åpen kildekode
(AGPL-3.0). Konto og innlogging, annonser med kategorimotor, søk, meldinger,
favoritter og grunnleggende moderering.

Stack: TanStack Start (Vite + React), Supabase (Postgres, RLS og Auth) og
Cloudflare Workers eller en annen vert.

## Kom i gang

```bash
bun install
bunx supabase start
bun run dev
```

Du trenger Bun, Supabase CLI og Docker. Første gang må du sette
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` og
`SUPABASE_SERVICE_ROLE_KEY` i serverens `.env` (eller hos verten), og de samme
offentlige verdiene som `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY`
for nettleseren. Deretter må du kjøre
migrasjonene og starte serveren på nytt. Oppstartsveiviseren viser hvordan for
en lokal stack, et prosjekt hos Supabase eller selvdriftet Supabase, uten å
kontakte noen adresse som kommer fra nettleseren. Med `SUPABASE_DB_URL` satt
på serveren kan veiviseren også kjøre migrasjonene i en tom database. Når serveren er
konfigurert og databasen mangler en admin, kan veiviseren opprette den første
admin-kontoen og velge layout, vilkårssider og e-posttjeneste. Alle variablene
står i `.env.example`. Se [selvdriftsguiden](docs/SELVDRIFT.md) for egen
lagring, SMTP, domene og sikre driftsinnstillinger før tjenesten åpnes for
brukere.

## Dokumentasjon

- [Drifte selv](docs/SELVDRIFT.md): verter, Supabase og planlagte jobber
- [Bidra](CONTRIBUTING.md) og [sikkerhet](SECURITY.md)

## Lisens

AGPL-3.0, se [LICENSE](LICENSE) og [NOTICE](NOTICE). Kjører du en endret
utgave som nettverkstjeneste, må kildekoden være tilgjengelig for brukerne.
Tilleggsvilkårene i `NOTICE` krever at bunnteksten «Bygd på kaupet_open» står,
og at du gir tjenesten ditt eget navn; se [TRADEMARKS.md](TRADEMARKS.md).
