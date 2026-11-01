# kaupet_open

Det meste blir bedre når flere kan se hvordan det virker, foreslå forbedringer og
lage sin egen variant. kaupet_open er en markedsplass for kjøp og salg av
brukte ting, på åpen kildekode (AGPL-3.0), og inneholder alle
kjernekomponentene fra Kaupet.no: konto og innlogging, annonser med
kategorimotor, søk, meldinger, favoritter og grunnleggende moderering.

Arkitektur, teknologi og oppsett er beskrevet på
[kaupet_open-siden på Kaupet.no](https://kaupet.no/developer/open).

Vi gleder oss til å se hva du bygger. Sammen skaper vi magi.

## Et øyeblikksbilde av Kaupet.no

Kaupet.no utvikles fortløpende i et lukket repo. Med jevne mellomrom tar vi ut
grunnfunksjonene og publiserer dem som en ny versjon av kaupet_open. Kjernen er
den samme som driver Kaupet.no. Gode bidrag tas inn i Kaupet.no og kommer med i
neste versjon.

**Med i kaupet_open**

- Konto, innlogging og profil
- Opprette, redigere, avslutte og slette annonser med bilder
- Kategorimotor med felt og filtre
- Fritekstsøk med filtre og enkel relevanssortering
- Meldinger og reaksjoner
- Favoritter, rapportering og grunnleggende moderering
- Autorisasjon, validering og grunnleggende misbruksvern
- Kontosletting og datatilgang
- Databaseskjema med RLS og tester
- Eksempeltaksonomi med noen få kategorier
- Oppstartsveiviser med tre startlayouter

## Teknologi

| Lag                    | Teknologi                                                      |
| ---------------------- | -------------------------------------------------------------- |
| Rammeverk              | TanStack Start og TanStack Router, med React og Vite           |
| Kjøremiljø             | Cloudflare Workers som standard; Nitro kan bygge for Node m.m. |
| Database og innlogging | Supabase: Postgres med RLS, Auth, Realtime og `pg_cron`        |
| Fillagring             | Cloudflare R2 eller annen S3-kompatibel lagring, f.eks. MinIO  |
| Grensesnitt            | Tailwind CSS, shadcn/ui og Radix                               |
| Test                   | Vitest, Playwright og RLS-tester mot lokal Supabase            |

## Kom i gang

**Du trenger**

- Bun, Supabase CLI og Docker (for lokal Supabase)
- Supabase i skyen eller på egen server når du skal i drift
- En vert for appen, for eksempel Cloudflare Workers eller Node
- S3-kompatibel fillagring, for eksempel R2 eller MinIO
- Et eget navn og en egen logo
- Valgfritt: en e-postleverandør med SMTP, for eksempel Resend

**Slik gjør du**

1. Installer og start lokal Supabase og appen:

   ```bash
   bun install
   bunx supabase start
   bun run dev
   ```

2. Sett `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` og
   `SUPABASE_SERVICE_ROLE_KEY` i serverens `.env` (eller hos verten), og de
   samme offentlige verdiene som `VITE_SUPABASE_URL` og
   `VITE_SUPABASE_PUBLISHABLE_KEY` for nettleseren. Alle variablene står i
   `.env.example`. Service-role-nøkkelen skal bare ligge på serveren.
3. Kjør migrasjonene og start serveren på nytt. Oppstartsveiviseren viser
   hvordan for en lokal stack, et prosjekt hos Supabase eller selvdriftet
   Supabase. Med `SUPABASE_DB_URL` satt på serveren kan veiviseren kjøre
   migrasjonene i en tom database selv.
4. Opprett den første admin-kontoen i veiviseren, og velg layout, vilkårssider
   og e-posttjeneste.
5. Før tjenesten åpnes for brukere: følg [selvdriftsguiden](docs/SELVDRIFT.md)
   for egen lagring, SMTP, domene, planlagte jobber og sikre
   driftsinnstillinger, og gi tjenesten ditt eget navn.

## Bygg videre

Kjernen er laget for å kunne utvides uten å behøve modifisering.

- **Egne kategorier og felt:** kategorier, felt og filtre ligger i databasen
  (`supabase/migrations/`).
- **Egen atferd for en bransje:** utvid `CategoryBehavior`
  (`src/lib/category-behavior.ts`), slik kjøretøy er bygd på Kaupet.no.
- **Nye funksjoner:** hver brukerflyt får sin egen mappe i
  `src/features/<navn>/`. Serverkode ligger i `*.server.ts` og
  `*.functions.ts` og importeres aldri fra klienten.
- **Tilgang og sikkerhet:** nye tabeller får RLS-policyer i en ny migrasjon,
  og policyene testes med `bun run test:rls`.

## Vi vil gjerne høre fra deg

Tilbakemeldinger, spørsmål og feilrapporter er like verdifulle som kode. Les
[CONTRIBUTING.md](CONTRIBUTING.md) før du bidrar, og [SECURITY.md](SECURITY.md)
for å melde sårbarheter.

## Lisens

AGPL-3.0, se [LICENSE](LICENSE) og [NOTICE](NOTICE).

- **Du kan** kjøre, endre og dele koden, også kommersielt.
- **Du må** dele kildekoden til endringene dine med brukerne hvis du kjører en
  endret versjon på nett, og la bunnteksten «Bygd på kaupet_open» stå.
- **Du kan ikke** bruke navnet Kaupet eller logoen. De er varemerker og følger
  ikke med lisensen; se [TRADEMARKS.md](TRADEMARKS.md).
