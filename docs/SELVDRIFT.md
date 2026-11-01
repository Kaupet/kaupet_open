# Drifte kaupet_open selv

Du trenger dine egne Supabase-, lagrings- og driftsressurser. Ingen kontoer,
ressurs-ID-er, domenekoblinger eller produksjonsnøkler følger med. Hold
service-role, lagringsnøkler og andre serverhemmeligheter borte fra `VITE_*`.

## Lokal oppstart

Installer Bun-versjonen i `package.json`, Supabase CLI og Docker. Fra en ny
klon, med Docker startet:

```bash
bun install --frozen-lockfile
bunx supabase start
bun run dev
```

Uten Supabase-variabler på serveren viser oppstartsveiviseren hvilke verdier
som trengs for en lokal stack, et prosjekt hos Supabase eller selvdriftet
Supabase, også `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` som
nettleseren bruker. Lokalt står de i `bunx supabase status -o env`. Legg dem i `.env` og
start dev-serveren på nytt. Veiviseren ber deretter om service-role-nøkkelen og
oppretter første admin bare når databasen ennå ikke har en admin.
`supabase start` bruker migrasjonene og eksempelkategoriene. `supabase db reset`
sletter lokale data og skal bare brukes når du vil starte helt på nytt.

Supabase sin lokale innboks viser e-post fra Auth. Adressen står i
`supabase status`. Sett egne vilkår og personverntekst i
`src/components/legal/` før du aktiverer `VITE_OPEN_LEGAL_PAGES`.

## Database og innlogging hos en vert

Bruk et eget Supabase-prosjekt med Postgres, Auth, Realtime, `pg_cron`
og `pg_net`. Installer migrasjonene fra `supabase/migrations/`
i rekkefølge mot dette prosjektet, med `supabase db push` eller fra
oppstartsveiviseren. Veiviseren trenger da `SUPABASE_DB_URL`, en
Postgres-tilkobling som `postgres`-brukeren (hos Supabase: «Session pooler»
under «Connect»). Den kjører bare i en database uten tabellene, alt i én
transaksjon, og registrerer migrasjonene slik Supabase CLI gjør. Fjern
variabelen når oppsettet er ferdig; senere migrasjoner kjøres med CLI-en. Ikke koble installasjonen til et annet
prosjekt eller ta med andre prosjekters `.temp/project-ref`.
Basismigrasjonen gjelder nye installasjoner; senere migrasjoner oppgraderer
installasjoner som allerede finnes. Eksempelkategoriene står i
`supabase/seed.sql`; kjør dem bare når du ønsker disse startkategoriene.

Sett Supabase Auth sin Site URL og redirect-liste til ditt eget domene,
inkludert `/auth` og `/tilbakestill-passord`. Konfigurer egen SMTP-leverandør,
avsender og e-postmaler. Sett `VITE_OPEN_EMAIL` slik at det samsvarer med
kravet om e-postbekreftelse. Lokale e-postinnstillinger er ikke et
produksjonsoppsett. Uten en fungerende e-postkanal får brukerne ikke bekreftet
kontoer eller tilbakestilt passord.

Kopier egne prosjektverdier til `SUPABASE_*` og `VITE_SUPABASE_*` som beskrevet
i `.env.example`. Service-role brukes bare på serveren; nettleseren bruker
publishable key, brukersesjon og RLS. Ikke gjør tabeller eller RPC-er åpne
for å løse en oppsettsfeil.

## Bilder og meldingsvedlegg

Opprett to egne buckets på Cloudflare R2 eller annen S3-kompatibel lagring:

- `R2_BILDER_BUCKET`: offentlige annonsebilder og avatarer, lest via
  `R2_PUBLIC_BASE_URL` / `VITE_R2_PUBLIC_BASE_URL`.
- `R2_VEDLEGG_BUCKET`: private meldingsvedlegg; bare autoriserte deltakere
  får tidsbegrensede signerte lenker.

Sett `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` og enten `R2_ACCOUNT_ID`
(for R2) eller `R2_ENDPOINT` og `R2_REGION` (for annen S3-lagring). Endepunktet
bruker path-style-adresser: `<endpoint>/<bucket>/<objektnøkkel>`. Bruk en
HTTPS-adresse som nettleseren kan nå. Tillat bare din egen nettadresse i
lagringens CORS-regler. Test at bildene er offentlige, og at vedleggsbucketen
ikke tillater anonym lesing eller listing.

Lagringsendepunkt og offentlig bildedomene må være satt både ved bygg og ved
kjøring, fordi de inngår i CSP. Opplastingskontrollene håndhever innlogging,
eierskap, signatur, størrelse og kvote før filene sendes til lagringen.

## Server, domene og misbruksvern

Cloudflare Workers er standard. `wrangler.jsonc` har et generisk navn og
ingen ressursbindinger. Velg eget `CLOUDFLARE_WORKER_NAME`, egen konto og eget
domene før en eventuell `bun run deploy`. Deploy kjøres aldri av workflowen.
Sett serverhemmeligheter hos verten og offentlige `VITE_*`-verdier ved bygg.

Andre Nitro-verter velges ved bygg, for eksempel:

```bash
NITRO_PRESET=node-server bun run build
PORT=3000 node dist/server/index.mjs
```

Bak annen proxy enn Cloudflare må `CLIENT_IP_HEADER` være en header proxyen
alltid setter og overskriver. Ikke stol på en vilkårlig header fra klienten.
Sett en egen tilfeldig `RATE_LIMIT_HMAC_SECRET`. Open bruker ikke Turnstile
eller andre eksterne CAPTCHA-tjenester. Deaktiver også CAPTCHA i Supabase
Auth hvis prosjektet tidligere var konfigurert med dette. Behold RLS,
servervalidering, CSRF-beskyttelse og rategrenser.

## Planlagte jobber og personvern

Basisskjemaet har jobber for annonseutløp, kontosletting etter angrefrist,
personvernopprydding, rate-limit-retensjon og opprydding av lagringsobjekter.
SQL-jobbene kjører i din database. Opprydding av lagringsobjekter bruker
`/api/public/r2/cleanup` på din server og trenger to innstillinger i
`public.app_settings`:

- `r2_cleanup_url`: din komplette HTTPS-adresse til endepunktet.
- `r2_cleanup_secret`: samme tilfeldige hemmelighet som serverens
  `R2_CLEANUP_SECRET`.

Sett dem privat i ditt eget miljø; ingen verdier følger med. Uten disse
innstillingene gjør jobben ingen eksterne kall, og urefererte filer blir ikke
ryddet. Overvåk cron-feil og lagringskøen uten å logge nøkler eller innhold fra
brukerne. Behold kontosletting, dataeksport og retention-jobber når du endrer
installasjonen. Ta sikkerhetskopier og prøv gjenoppretting.

## E-post og kontroller

Applikasjonen sender ingen egne e-postvarsler. All e-post (bekreftelse,
innlogging og tilbakestilling av passord) sendes av Supabase Auth via SMTP-en
du setter opp der.

Kjør `bun run build`, `bun run typecheck`, `bun run lint:ci`,
`bun run test:coverage`, `bun run test:rls`, `bunx supabase test db` og
`bun run test:e2e` mot dine lokale testressurser før utrulling. GitHub-workflowen
kjører bygg, formatering, typesjekk, lint, tester og avhengighetskontroll med
bare leserettighet til kode. Den har ingen deploy-jobb eller hemmeligheter.
Database- og nettlesertestene kjøres separat lokalt.

`test:database` kjører pgTAP, migrasjonskontroll og RLS mot en egen
midlertidig Supabase-stack. `test:e2e` kjører de samme databasekontrollene
før nettlesertestene. Begge bruker en lokal
S3-protokollfixture, med testbrukere og syntetiske bilder. Den erstatter
Supabase- og lagringsvariablene med lokale testverdier og rydder stacken etter
kjøring. Testene dekker førstegangsadmin og kjernereisen på desktop og mobil.
Lagringsfixturen erstatter ikke en kontroll av IAM og CORS hos din faktiske
lagringsleverandør; prøv også anonym tilgang til vedleggsbucketen før utrulling.

## Sted uten eksterne tjenester

Open bruker ikke Kartverket, kartfliser eller eksterne stedsoppslag.
Postnummer og sted fylles ut manuelt ved oppretting og redigering av annonser.
Kartvalg er skjult. Avstandsfilteret kan fortsatt bruke nettleserens posisjon,
men annonser uten koordinater inngår ikke i avstandssøk.
