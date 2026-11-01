// kaupet_open: oppstartsveiviseren. Rotruten viser den i stedet for appen når
// Supabase ikke er konfigurert eller databasen mangler admin. Er konfigurasjonen
// komplett, vises appen som vanlig.
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";

import { BrandWordmark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseConfigured } from "@/integrations/supabase/client";
import { emailSchema, passwordSchema } from "@/lib/auth-schemas";
import { formatErrorMessage } from "@/lib/errors";

import { LAYOUTS, type LayoutId } from "./layouts";
import {
  checkSetupConnection,
  completeSetup,
  runSetupMigrations,
  type SetupStatus,
} from "./setup.functions";

export function SetupGate({ status, children }: { status: SetupStatus; children: ReactNode }) {
  return status ? <SetupWizard status={status} /> : children;
}

type Step = "intro" | "manuelt" | "supabase" | "admin" | "layout" | "vilkar" | "epost" | "ferdig";
const STEPS = 7;

// Hvor Supabase-instansen kjører. Valget styrer bare veiledningen: målet er
// alltid miljøvariablene på serveren, aldri en adresse fra nettleseren.
type HostId = "lokal" | "supabase" | "server";
const HOSTS: { id: HostId; title: string; description: string; steps: ReactNode[]; env: string }[] =
  [
    {
      id: "lokal",
      title: "Lokalt på denne maskinen",
      description: "Supabase CLI og Docker. Raskest for å prøve kaupet_open.",
      steps: [
        <>
          Installer Docker og kjør <code>bunx supabase start</code> i prosjektmappen. Den starter
          Supabase og kjører migrasjonene.
        </>,
        <>
          <code>bunx supabase status -o env</code> viser adressen (<code>API_URL</code>) og nøklene
          (<code>ANON_KEY</code> og <code>SERVICE_ROLE_KEY</code>).
        </>,
      ],
      env: [
        'SUPABASE_URL="http://127.0.0.1:54321"',
        'SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>"',
        'VITE_SUPABASE_URL="http://127.0.0.1:54321"',
        'VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>"',
        'SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"',
        'SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
      ].join("\n"),
    },
    {
      id: "supabase",
      title: "Hos Supabase",
      description: "Et prosjekt på supabase.com. Supabase drifter databasen for deg.",
      steps: [
        <>
          Lag et prosjekt på <code>supabase.com/dashboard</code>. Velg en region nær brukerne, og ta
          vare på databasepassordet.
        </>,
        <>
          Under <strong>Project Settings → API Keys</strong> finner du publishable key og secret key
          (service role). Prosjektadressen står under <strong>Data API</strong>.
        </>,
        <>
          Under <strong>Connect → Session pooler</strong> kopierer du tilkoblingsstrengen til{" "}
          <code>SUPABASE_DB_URL</code> og setter inn databasepassordet.
        </>,
      ],
      env: [
        'SUPABASE_URL="https://<prosjekt-ref>.supabase.co"',
        'SUPABASE_PUBLISHABLE_KEY="<publishable key>"',
        'VITE_SUPABASE_URL="https://<prosjekt-ref>.supabase.co"',
        'VITE_SUPABASE_PUBLISHABLE_KEY="<publishable key>"',
        'SUPABASE_SERVICE_ROLE_KEY="<secret key>"',
        'SUPABASE_DB_URL="postgresql://postgres.<prosjekt-ref>:<databasepassord>@<pooler-vert>:5432/postgres?sslmode=require"',
      ].join("\n"),
    },
    {
      id: "server",
      title: "På egen server",
      description: "Selvdriftet Supabase med Docker på en server du administrerer.",
      steps: [
        <>
          Følg Supabase sin veiledning for selvdrift med Docker (
          <code>supabase.com/docs/guides/self-hosting/docker</code>), og bytt ut alle
          eksempelhemmelighetene. Databasen trenger <code>pg_cron</code> og <code>pg_net</code>.
        </>,
        <>
          Adressen til API-gatewayen (Kong) er <code>SUPABASE_URL</code>. Nøklene er{" "}
          <code>ANON_KEY</code> og <code>SERVICE_ROLE_KEY</code> fra Supabase sin <code>.env</code>.
        </>,
        <>
          <code>SUPABASE_DB_URL</code> er Postgres-tilkoblingen med brukeren <code>postgres</code>{" "}
          og <code>POSTGRES_PASSWORD</code>.
        </>,
      ],
      env: [
        'SUPABASE_URL="https://<din-supabase-adresse>"',
        'SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>"',
        'VITE_SUPABASE_URL="https://<din-supabase-adresse>"',
        'VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>"',
        'SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"',
        'SUPABASE_DB_URL="postgresql://postgres:<POSTGRES_PASSWORD>@<databasevert>:5432/postgres"',
      ].join("\n"),
    },
  ];

const LEGAL_OPTIONS = [
  {
    value: false,
    title: "Nei, ikke nå",
    description: "Registreringen viser ingen avkrysning for vilkår.",
  },
  {
    value: true,
    title: "Ja, lag tomme sider",
    description: "/vilkar og /personvern, med avkrysning ved registrering.",
  },
];

// Supabase Auth sender e-post over SMTP. Tjenestene med API-nøkkel bruker den
// som SMTP-passord; de andre har egne SMTP-innlogginger.
type EmailProvider = { id: string; name: string; host: string; port: string } & (
  { kind: "none" } | { kind: "api-key"; user: string | null } | { kind: "smtp" }
);
const EMAIL_PROVIDERS: EmailProvider[] = [
  { id: "ingen", name: "Ingen e-post", kind: "none", host: "", port: "" },
  {
    id: "resend",
    name: "Resend",
    kind: "api-key",
    user: "resend",
    host: "smtp.resend.com",
    port: "465",
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    kind: "api-key",
    user: "apikey",
    host: "smtp.sendgrid.net",
    port: "587",
  },
  // Postmark: server-tokenet er både brukernavn og passord.
  {
    id: "postmark",
    name: "Postmark",
    kind: "api-key",
    user: null,
    host: "smtp.postmarkapp.com",
    port: "587",
  },
  { id: "brevo", name: "Brevo", kind: "smtp", host: "smtp-relay.brevo.com", port: "587" },
  { id: "mailgun", name: "Mailgun", kind: "smtp", host: "smtp.mailgun.org", port: "587" },
  { id: "smtp", name: "Annen SMTP-server", kind: "smtp", host: "", port: "587" },
];

type EmailForm = {
  provider: string;
  apiKey: string;
  host: string;
  port: string;
  user: string;
  pass: string;
  senderEmail: string;
  senderName: string;
};

type Smtp = {
  host: string;
  port: number;
  user: string;
  pass: string;
  senderEmail: string;
  senderName: string;
};

/** SMTP-oppsettet for Supabase Auth, null uten e-post, eller en feilmelding. */
function resolveSmtp(form: EmailForm): Smtp | null | string {
  const provider = EMAIL_PROVIDERS.find((p) => p.id === form.provider)!;
  if (provider.kind === "none") return null;
  const smtp =
    provider.kind === "api-key"
      ? {
          host: provider.host,
          port: provider.port,
          user: provider.user ?? form.apiKey,
          pass: form.apiKey,
        }
      : { host: form.host, port: form.port, user: form.user, pass: form.pass };
  if (provider.kind === "api-key" && !form.apiKey.trim()) return "Lim inn API-nøkkelen";
  if (!smtp.host.trim() || !smtp.user.trim() || !smtp.pass) return "Fyll inn alle SMTP-feltene";
  const port = Number(smtp.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "Porten må være et tall";
  const sender = emailSchema.safeParse(form.senderEmail);
  if (!sender.success) return "Skriv inn en gyldig avsenderadresse";
  return {
    host: smtp.host.trim(),
    port,
    user: smtp.user.trim(),
    pass: smtp.pass.trim(),
    senderEmail: sender.data,
    senderName: form.senderName.trim() || "kaupet_open",
  };
}

const adminSchema = z.object({
  displayName: z.string().trim().min(1, "Skriv inn et visningsnavn").max(80),
  email: emailSchema,
  password: passwordSchema.max(72, "Maks 72 tegn"),
});

function SetupWizard({ status }: { status: NonNullable<SetupStatus> }) {
  const envMissing = status.reason === "mangler-miljo";
  const [step, setStep] = useState<Step>("intro");
  const [host, setHost] = useState<HostId>("lokal");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [admin, setAdmin] = useState({ displayName: "", email: "", password: "" });
  const [layout, setLayout] = useState<LayoutId>("hvit");
  const [legalPages, setLegalPages] = useState(false);
  const [email, setEmail] = useState<EmailForm>({
    provider: "ingen",
    apiKey: "",
    host: "",
    port: "",
    user: "",
    pass: "",
    senderEmail: "",
    senderName: "kaupet_open",
  });
  const [smtp, setSmtp] = useState<Smtp | null>(null);
  const [hasAdmin, setHasAdmin] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(status.reason === "mangler-skjema");
  const [examplesFailed, setExamplesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const credentials = { serviceRoleKey };

  async function run(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(formatErrorMessage(err, "Noe gikk galt. Prøv igjen."));
    } finally {
      setPending(false);
    }
  }

  const onTestConnection = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { state } =
        schemaMissing && status.canMigrate
          ? await runSetupMigrations({ data: credentials })
          : await checkSetupConnection({ data: credentials });
      setSchemaMissing(state === "mangler-skjema");
      if (state === "mangler-skjema") return;
      setHasAdmin(state === "har-admin");
      setStep(state === "har-admin" ? "layout" : "admin");
    });
  };

  const onAdmin = (e: FormEvent) => {
    e.preventDefault();
    const parsed = adminSchema.safeParse(admin);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Sjekk feltene");
      return;
    }
    setError(null);
    setStep("layout");
  };

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    const resolved = resolveSmtp(email);
    if (typeof resolved === "string") {
      setError(resolved);
      return;
    }
    setSmtp(resolved);
    if (hasAdmin) {
      setStep("ferdig");
      return;
    }
    void run(async () => {
      const result = await completeSetup({ data: { ...credentials, ...admin, layout } });
      setExamplesFailed(LAYOUTS.find((l) => l.id === layout)!.examples && !result.examples);
      setStep("ferdig");
    });
  };

  const back = (to: Step) => () => {
    setError(null);
    setStep(to);
  };
  const next = (to: Step) => (e: FormEvent) => {
    e.preventDefault();
    back(to)();
  };
  const choices = { layout, legalPages, smtp };

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-10 sm:items-center">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2">
          <BrandWordmark size="2xl" />
          <p className="text-sm text-muted-foreground">Oppstartsveiviser</p>
        </header>

        <section className="space-y-5 rounded-lg border border-border bg-card p-5 sm:p-6">
          {step === "intro" && (
            <form onSubmit={next("manuelt")} className="space-y-5">
              <StepHeading title="Velkommen til kaupet_open">
                kaupet_open består av all kjernefunksjonalitet fra kaupet.no, slik at du enkelt kan
                bygge din egen markedsplass, eller utforske kjernekomponentene som driver kaupet.no.
                kaupet_open er til for et fritt og åpent internett. Fordi alle tjenester blir bedre
                når flere kan se hvordan det virker, foreslå forbedringer og lage sin egen variant.
              </StepHeading>
              <div className="space-y-1 rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-medium">kaupet_open er lisensiert under AGPL-3.0.</p>
                <p className="text-muted-foreground">
                  Vilkårene står i LICENSE og NOTICE i kildekoden.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Veiviseren kobler kaupet_open til Supabase, bygger databasen og lager den første
                admin-kontoen. Deretter velger du layout, vilkårssider og e-post. Det tar noen
                minutter.
              </p>
              <Nav submit="Neste" />
            </form>
          )}

          {step === "manuelt" && (
            <>
              <StepHeading title="Koble til Supabase" step={1}>
                kaupet_open lagrer alt i en Supabase-database du eier. Hvor skal den kjøre?
              </StepHeading>
              {!envMissing && !supabaseConfigured && (
                <div
                  role="alert"
                  className="space-y-2 rounded-md border border-destructive p-3 text-sm"
                >
                  <p className="font-medium">
                    Serveren er koblet til <code>{status.configuredUrl}</code>, men nettleserdelen
                    mangler Supabase-adressen.
                  </p>
                  <p className="text-muted-foreground">
                    Sett <code>VITE_SUPABASE_URL</code> og{" "}
                    <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> til de samme verdiene som{" "}
                    <code>SUPABASE_URL</code> og <code>SUPABASE_PUBLISHABLE_KEY</code>, og start
                    serveren på nytt. Uten dem kan ingen logge inn etter oppsettet.
                  </p>
                </div>
              )}
              {!envMissing && supabaseConfigured && (
                <div className="space-y-3 rounded-md border border-border bg-muted p-3 text-sm">
                  <p>
                    Serveren er allerede koblet til <code>{status.configuredUrl}</code>. Fortsett
                    med den, eller velg under for å sette opp en annen.
                  </p>
                  <Button type="button" onClick={back("supabase")}>
                    Fortsett med denne databasen
                  </Button>
                </div>
              )}
              <fieldset className="grid gap-3">
                <legend className="sr-only">Supabase-instans</legend>
                {HOSTS.map((option) => (
                  <label
                    key={option.id}
                    className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      type="radio"
                      name="host"
                      checked={host === option.id}
                      onChange={() => setHost(option.id)}
                      className="row-span-2 mt-1 size-4 accent-primary"
                    />
                    <span className="font-medium">{option.title}</span>
                    <span className="text-sm text-muted-foreground">{option.description}</span>
                  </label>
                ))}
              </fieldset>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {HOSTS.find((h) => h.id === host)!.steps.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
                <li>
                  Legg verdiene i <code>.env</code> eller som miljøvariabler hos verten, og start
                  serveren på nytt.
                </li>
              </ol>
              <EnvBlock text={HOSTS.find((h) => h.id === host)!.env} />
              <p className="text-sm text-muted-foreground">
                <code>VITE_*</code>-verdiene er offentlige og bygges inn i appen, så hos en vert må
                du bygge på nytt når de endres. <code>SUPABASE_DB_URL</code> er valgfri. Med den kan
                veiviseren bygge databasen for deg. Den brukes bare under oppsettet, og du kan
                fjerne den etterpå. Nettleseren kan ikke endre hvilken database serveren bruker.
                Resten av variablene (bildelagring, e-post osv.) står i <code>.env.example</code> og{" "}
                <code>docs/SELVDRIFT.md</code>.
              </p>
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="ghost" onClick={back("intro")}>
                  Tilbake
                </Button>
                <Button
                  type="button"
                  variant={envMissing ? "default" : "outline"}
                  onClick={() => window.location.reload()}
                >
                  Jeg har startet serveren på nytt
                </Button>
              </div>
            </>
          )}

          {step === "supabase" && (
            <form onSubmit={onTestConnection} className="space-y-5" noValidate>
              <StepHeading title="Bekreft tilgang" step={2}>
                {`kaupet_open er koblet til ${status.configuredUrl}. Lim inn service role-nøkkelen for å bekrefte at du eier databasen.`}
              </StepHeading>
              <Field
                id="setup-service"
                label="Service role-nøkkel"
                type="password"
                hint="Brukes bare til oppsettet her og lagres ikke."
                value={serviceRoleKey}
                onChange={setServiceRoleKey}
              />
              {schemaMissing && status.canMigrate && (
                <div className="space-y-2 rounded-md border border-border bg-muted p-3 text-sm">
                  <p className="font-medium">Databasen mangler tabellene.</p>
                  <p className="text-muted-foreground">
                    Veiviseren kan bygge databasen for deg: tabeller, tilgangsregler og planlagte
                    jobber fra <code>supabase/migrations/</code>, i databasen i{" "}
                    <code>SUPABASE_DB_URL</code>. Alt gjøres i én transaksjon, så en feil endrer
                    ingenting. Det kan ta et halvt minutt.
                  </p>
                </div>
              )}
              {schemaMissing && !status.canMigrate && (
                <div className="space-y-2 rounded-md border border-border bg-muted p-3 text-sm">
                  <p className="font-medium">Databasen mangler tabellene.</p>
                  <p className="text-muted-foreground">
                    Kjør migrasjonene i <code>supabase/migrations/</code> mot prosjektet, og test på
                    nytt:
                  </p>
                  <pre className="overflow-x-auto text-xs">
                    supabase link --project-ref &lt;ref&gt;{"\n"}supabase db push
                  </pre>
                  <p className="text-muted-foreground">
                    Lokalt holder det med <code>supabase db reset</code>. Du kan også sette{" "}
                    <code>SUPABASE_DB_URL</code> på serveren og starte den på nytt, så kjører
                    veiviseren migrasjonene for deg.
                  </p>
                </div>
              )}
              <ErrorText error={error} />
              <Nav
                onBack={back("manuelt")}
                submit={
                  schemaMissing
                    ? status.canMigrate
                      ? "Bygg databasen"
                      : "Test på nytt"
                    : "Test tilkoblingen"
                }
                pending={pending}
              />
            </form>
          )}

          {step === "admin" && (
            <form onSubmit={onAdmin} className="space-y-5" noValidate>
              <StepHeading title="Første admin-konto" step={3}>
                Kontoen får admin-rollen og kan logge inn med en gang. Flere admins legger du til
                under Admin → Roller.
              </StepHeading>
              <Field
                id="setup-name"
                label="Visningsnavn"
                value={admin.displayName}
                onChange={(displayName) => setAdmin({ ...admin, displayName })}
                autoComplete="name"
              />
              <Field
                id="setup-email"
                label="E-post"
                type="email"
                value={admin.email}
                onChange={(email) => setAdmin({ ...admin, email })}
                autoComplete="email"
              />
              <Field
                id="setup-password"
                label="Passord"
                type="password"
                hint="Minst 10 tegn."
                value={admin.password}
                onChange={(password) => setAdmin({ ...admin, password })}
                autoComplete="new-password"
              />
              <ErrorText error={error} />
              <Nav onBack={back("supabase")} submit="Neste" />
            </form>
          )}

          {step === "layout" && (
            <form onSubmit={next("vilkar")} className="space-y-5">
              <StepHeading title="Layout" step={4}>
                Velg et utgangspunkt. Stilene ligger i <code>src/brand.css</code>, så du kan bygge
                videre på det du velger.
                {hasAdmin && " Databasen har allerede en admin, så ingen data endres."}
              </StepHeading>
              <fieldset className="grid gap-3">
                <legend className="sr-only">Layout</legend>
                {LAYOUTS.map((option) => (
                  <label
                    key={option.id}
                    className="grid cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:grid-cols-[1fr_12rem]"
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="layout"
                        value={option.id}
                        checked={layout === option.id}
                        onChange={() => setLayout(option.id)}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span className="space-y-1">
                        <span className="block font-medium">{option.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </span>
                    <LayoutPreview id={option.id} examples={option.examples} />
                  </label>
                ))}
              </fieldset>
              <Nav onBack={back(hasAdmin ? "supabase" : "admin")} submit="Neste" />
            </form>
          )}

          {step === "vilkar" && (
            <form onSubmit={next("epost")} className="space-y-5">
              <StepHeading title="Vilkår og personvern" step={5}>
                Skal tjenesten ha sider for brukervilkår og personvernerklæring? Sidene lages tomme,
                og teksten legger du selv inn i <code>src/components/legal/</code>. Med sidene må
                nye brukere godta vilkårene og personvernerklæringen for å registrere seg.
              </StepHeading>
              <fieldset className="grid gap-3">
                <legend className="sr-only">Vilkår og personvern</legend>
                {LEGAL_OPTIONS.map((option) => (
                  <label
                    key={option.title}
                    className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      type="radio"
                      name="legal"
                      checked={legalPages === option.value}
                      onChange={() => setLegalPages(option.value)}
                      className="row-span-2 mt-1 size-4 accent-primary"
                    />
                    <span className="font-medium">{option.title}</span>
                    <span className="text-sm text-muted-foreground">{option.description}</span>
                  </label>
                ))}
              </fieldset>
              <Nav onBack={back("layout")} submit="Neste" />
            </form>
          )}

          {step === "epost" && (
            <form onSubmit={onEmail} className="space-y-5" noValidate>
              <StepHeading title="E-post" step={6}>
                Supabase Auth bruker e-post til å bekrefte nye kontoer og tilbakestille passord. Det
                er frivillig: uten e-post slipper brukerne inn uten bekreftelse, og «Glemt passord?»
                vises ikke.
              </StepHeading>
              <div className="space-y-1.5">
                <Label htmlFor="setup-email-provider">E-posttjeneste</Label>
                <select
                  id="setup-email-provider"
                  value={email.provider}
                  onChange={(e) => {
                    const p = EMAIL_PROVIDERS.find((x) => x.id === e.target.value)!;
                    setEmail({ ...email, provider: p.id, host: p.host, port: p.port });
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {EMAIL_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {emailProvider(email).kind === "api-key" && (
                <Field
                  id="setup-email-key"
                  label="API-nøkkel"
                  type="password"
                  hint="Brukes som SMTP-passord i Supabase Auth."
                  value={email.apiKey}
                  onChange={(apiKey) => setEmail({ ...email, apiKey })}
                />
              )}
              {emailProvider(email).kind === "smtp" && (
                <>
                  <div className="grid gap-5 sm:grid-cols-[1fr_6rem]">
                    <Field
                      id="setup-smtp-host"
                      label="SMTP-server"
                      value={email.host}
                      onChange={(host) => setEmail({ ...email, host })}
                    />
                    <Field
                      id="setup-smtp-port"
                      label="Port"
                      value={email.port}
                      onChange={(port) => setEmail({ ...email, port })}
                    />
                  </div>
                  <Field
                    id="setup-smtp-user"
                    label="Brukernavn"
                    value={email.user}
                    onChange={(user) => setEmail({ ...email, user })}
                  />
                  <Field
                    id="setup-smtp-pass"
                    label="Passord"
                    type="password"
                    value={email.pass}
                    onChange={(pass) => setEmail({ ...email, pass })}
                  />
                </>
              )}
              {emailProvider(email).kind !== "none" && (
                <>
                  <Field
                    id="setup-sender-email"
                    label="Avsenderadresse"
                    type="email"
                    hint="Domenet må være verifisert hos e-posttjenesten."
                    value={email.senderEmail}
                    onChange={(senderEmail) => setEmail({ ...email, senderEmail })}
                  />
                  <Field
                    id="setup-sender-name"
                    label="Avsendernavn"
                    value={email.senderName}
                    onChange={(senderName) => setEmail({ ...email, senderName })}
                  />
                </>
              )}
              <ErrorText error={error} />
              <Nav
                onBack={back("vilkar")}
                submit={hasAdmin ? "Neste" : "Fullfør oppsettet"}
                pending={pending}
              />
            </form>
          )}

          {step === "ferdig" && (
            <>
              <StepHeading title="Nesten ferdig" step={7}>
                {hasAdmin ? "Databasen var allerede satt opp." : "Admin-kontoen er opprettet."} Legg
                til linjene i .env og bygg på nytt for å ta i bruk valgene.
              </StepHeading>
              <EnvBlock text={envFile(choices)} />
              {smtp && (
                <p className="text-sm text-muted-foreground">
                  Filen inneholder hemmelige nøkler. Ikke del den, og ikke sjekk den inn i git.
                </p>
              )}
              <div className="space-y-2">
                <h2 className="font-medium">E-post i Supabase Auth</h2>
                <p className="text-sm text-muted-foreground">
                  {smtp
                    ? "Veiviseren kan ikke endre Supabase-innstillingene selv. På Supabase Cloud legger du SMTP-verdiene inn under Authentication i dashbordet og slår på «Confirm email». Lokalt og ved selvdrift legger du blokken under inn i supabase/config.toml; passordet leses fra SUPABASE_AUTH_SMTP_PASS i miljøet."
                    : "Uten e-post må bekreftelse av nye kontoer være slått av. På Supabase Cloud slår du av «Confirm email» under Authentication i dashbordet. Lokalt og ved selvdrift gjelder blokken under i supabase/config.toml."}
                </p>
                <EnvBlock text={authConfig(smtp)} filename="config.toml" />
              </div>
              {examplesFailed && (
                <p role="alert" className="text-sm text-destructive">
                  Eksempelinnholdet kunne ikke legges inn. Kategorier lager du under Admin →
                  Kategorier.
                </p>
              )}
              <Button onClick={() => window.location.assign("/auth")}>Logg inn</Button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function emailProvider(form: EmailForm) {
  return EMAIL_PROVIDERS.find((p) => p.id === form.provider)!;
}

function envFile(v: { layout: LayoutId; legalPages: boolean; smtp: Smtp | null }) {
  return [
    // Adressen veiviseren kjører på; brukes i lenker, metadata og e-post.
    `VITE_SITE_URL="${window.location.origin}"`,
    `VITE_OPEN_LAYOUT="${v.layout}"`,
    `VITE_OPEN_LEGAL_PAGES="${v.legalPages}"`,
    `VITE_OPEN_EMAIL="${!!v.smtp}"`,
    ...(v.smtp ? [`SUPABASE_AUTH_SMTP_PASS="${v.smtp.pass}"`] : []),
    "",
  ].join("\n");
}

/** Blokken for supabase/config.toml. Passordet hentes fra miljøet, ikke fila. */
function authConfig(smtp: Smtp | null) {
  if (!smtp) return "[auth.email]\nenable_confirmations = false\n";
  return [
    "[auth.email]",
    "enable_confirmations = true",
    "",
    "[auth.email.smtp]",
    "enabled = true",
    `host = ${JSON.stringify(smtp.host)}`,
    `port = ${smtp.port}`,
    `user = ${JSON.stringify(smtp.user)}`,
    'pass = "env(SUPABASE_AUTH_SMTP_PASS)"',
    `admin_email = ${JSON.stringify(smtp.senderEmail)}`,
    `sender_name = ${JSON.stringify(smtp.senderName)}`,
    "",
  ].join("\n");
}

function StepHeading({
  title,
  step,
  children,
}: {
  title: string;
  step?: number;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      {step && (
        <p className="text-xs text-muted-foreground">
          Steg {step} av {STEPS}
        </p>
      )}
      <h1 className="text-xl">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  type = "text",
  value,
  onChange,
  autoComplete = "off",
}: {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

function Nav({
  onBack,
  submit,
  pending = false,
}: {
  onBack?: () => void;
  submit?: string;
  pending?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          Tilbake
        </Button>
      ) : (
        <span />
      )}
      {submit && (
        <Button type="submit" disabled={pending}>
          {pending ? "Jobber …" : submit}
        </Button>
      )}
    </div>
  );
}

function EnvBlock({ text, filename = "kaupet-open.env" }: { text: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? "Kopiert" : "Kopier"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          Last ned
        </Button>
      </div>
    </div>
  );
}

/** Miniatyr av forsiden i layoutens egne tokens (data-layout på en div). */
function LayoutPreview({ id, examples }: { id: LayoutId; examples: boolean }) {
  return (
    <div
      aria-hidden
      data-layout={id}
      data-preview
      className="space-y-2 rounded-lg border border-border bg-background p-2.5 text-foreground"
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-xs font-semibold">
          kaupet<span className="text-brand">_</span>open
        </span>
        <span className="size-3 rounded-full bg-brand" />
      </div>
      <div className="flex gap-1">
        <div className="h-5 flex-1 rounded-md border border-input bg-card" />
        <div className="h-5 w-8 rounded-md bg-primary" />
      </div>
      {examples ? (
        <div className="grid grid-cols-2 gap-1">
          {["Elektronikk", "Møbler", "Sport", "Klær"].map((name) => (
            <span
              key={name}
              className="truncate rounded-md border border-border bg-surface px-1.5 py-0.5 text-[0.625rem]"
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <div className="h-9 rounded-md border border-dashed border-border" />
      )}
    </div>
  );
}
