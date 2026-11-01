// kaupet_open: serverdelen av oppstartsveiviseren. Funksjonene er offentlige,
// men virker bare mens oppsettet mangler, og bare med service role-nøkkelen
// til databasen det gjelder. Med miljøvariabler satt brukes alltid den
// konfigurerte databasen, så veiviseren kan ikke rettes mot en annen vert.
import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { emailSchema, passwordSchema } from "@/lib/auth-schemas";
import { ClientError } from "@/lib/to-client-error";

import { LAYOUTS, type LayoutId } from "./layouts";

export type SetupStatus = {
  reason: "mangler-miljo" | "mangler-skjema" | "mangler-admin";
  /** Satt når miljøvariablene finnes; veiviseren spør da bare etter nøkkelen. */
  configuredUrl: string | null;
  /** SUPABASE_DB_URL er satt, så veiviseren kan kjøre migrasjonene selv. */
  canMigrate: boolean;
} | null;

type Env = Partial<Record<string, string>>;
const SETUP_REQUEST_TIMEOUT_MS = 10_000;

function setupFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS) });
}

function adminClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { fetch: setupFetch },
  });
}
type AdminClient = ReturnType<typeof adminClient>;

/** Tabellene fra basismigrasjonen finnes, og om det finnes en admin. */
async function probeDatabase(admin: AdminClient): Promise<"mangler-skjema" | "har-admin" | "klar"> {
  const { data, error, status } = await admin
    .from("user_roles")
    .select("id")
    .eq("role", "admin")
    .limit(1);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || status === 404) {
      return "mangler-skjema";
    }
    throw new ClientError("Fikk ikke lest databasen. Sjekk at Supabase kjører.", 502);
  }
  return data.length > 0 ? "har-admin" : "klar";
}

// Når en admin finnes, er oppsettet ferdig for godt i denne prosessen; slik
// koster sjekken ett databasekall per isolat, ikke ett per sidevisning.
let complete = false;

async function readStatus(env: Env = process.env): Promise<SetupStatus> {
  if (complete) return null;
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { reason: "mangler-miljo", configuredUrl: null, canMigrate: false };
  }
  try {
    const state = await probeDatabase(adminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));
    if (state === "har-admin") {
      complete = true;
      return null;
    }
    return {
      reason: state === "klar" ? "mangler-admin" : state,
      configuredUrl: SUPABASE_URL,
      canMigrate: !!env.SUPABASE_DB_URL,
    };
  } catch {
    // Midlertidig nede er ikke det samme som «ikke satt opp»: vis appen, ikke
    // veiviseren, til besøkende.
    return null;
  }
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(() => readStatus());

const credentialsSchema = z
  .object({
    serviceRoleKey: z.string().trim().min(1, "Lim inn service role-nøkkelen").max(2000),
  })
  .strict();
export type SetupCredentials = z.input<typeof credentialsSchema>;

async function connect(input: z.output<typeof credentialsSchema>) {
  const status = await readStatus();
  if (!status) throw new ClientError("Oppsettet er allerede fullført.", 409);
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (status.reason === "mangler-miljo" || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ClientError(
      "Konfigurer SUPABASE_URL og Supabase-nøklene på serveren, start den på nytt og prøv igjen.",
    );
  }
  const admin = adminClient(SUPABASE_URL, input.serviceRoleKey);

  // Bare service role-nøkkelen slipper inn i auth-admin-API-et; en publishable
  // key i feil felt ville ellers sett ut som en tom database (RLS).
  const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    throw new ClientError(
      error.status === 401 || error.status === 403
        ? "Supabase godtok ikke service role-nøkkelen."
        : "Fikk ikke kontakt med Supabase på den adressen.",
    );
  }
  return { admin, state: await probeDatabase(admin) };
}

export const checkSetupConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => credentialsSchema.parse(input))
  .handler(async ({ data }) => ({ state: (await connect(data)).state }));

export const runSetupMigrations = createServerFn({ method: "POST" })
  .validator((input: unknown) => credentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const dbUrl = process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
      throw new ClientError(
        "Sett SUPABASE_DB_URL på serveren og start den på nytt for å kjøre migrasjonene herfra.",
      );
    }
    const { admin, state } = await connect(data);
    // Bare førstegangsinstallasjon: oppgraderinger kjøres med Supabase CLI.
    if (state !== "mangler-skjema") {
      throw new ClientError("Databasen har allerede tabellene.", 409);
    }
    const { applyMigrations } = await import("./setup-migrations.server");
    try {
      await applyMigrations(dbUrl);
    } catch (error) {
      // Kalleren har vist service role-nøkkelen, så Postgres-feilen kan vises.
      const reason = error instanceof Error ? error.message.slice(0, 300) : "ukjent feil";
      throw new ClientError(`Migrasjonen feilet og ble rullet tilbake: ${reason}`, 502);
    }
    // PostgREST laster skjemaet på nytt asynkront etter NOTIFY.
    for (let attempt = 0; attempt < 5; attempt++) {
      const after = await probeDatabase(admin);
      if (after !== "mangler-skjema") return { state: after };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return { state: "mangler-skjema" as const };
  });

const completeSchema = credentialsSchema
  .extend({
    email: emailSchema.toLowerCase().max(255),
    password: passwordSchema.max(72, "Maks 72 tegn"),
    displayName: z.string().trim().min(1, "Skriv inn et visningsnavn").max(80),
    layout: z.enum(["hvit", "lavendel", "signal"] satisfies LayoutId[]),
  })
  .strict();

export const completeSetup = createServerFn({ method: "POST" })
  .validator((input: unknown) => completeSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, state } = await connect(data);
    if (state === "mangler-skjema") {
      throw new ClientError("Databasen mangler tabellene. Kjør migrasjonene først.", 409);
    }
    // Databasen er alt satt opp (f.eks. ny vert mot en eksisterende database):
    // veiviseren lager da bare .env og rører ikke dataene.
    if (state === "har-admin") return { createdAdmin: false, examples: false };

    // ponytail: to samtidige fullføringer kan gi to admins. Begge holder
    // service role-nøkkelen, så det er ikke en tilgangsfeil.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (createErr || !created.user) {
      if (/already.*registered|exists/i.test(createErr?.message ?? "")) {
        throw new ClientError("E-postadressen er allerede i bruk.", 409);
      }
      throw new ClientError("Kunne ikke opprette brukeren.", 502);
    }
    const userId = created.user.id;

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleErr) {
      await admin.auth.admin.deleteUser(userId);
      throw new ClientError("Kunne ikke gi brukeren admin-rollen.", 502);
    }

    const layout = LAYOUTS.find((l) => l.id === data.layout)!;
    if (!layout.examples) return { createdAdmin: true, examples: false };
    // Admin finnes nå; feiler eksemplene, er oppsettet likevel brukbart.
    try {
      await insertExamples(admin, userId);
      return { createdAdmin: true, examples: true };
    } catch {
      return { createdAdmin: true, examples: false };
    }
  });

async function insertExamples(admin: AdminClient, sellerId: string) {
  const roots = await admin
    .from("categories")
    .upsert(EXAMPLE_ROOT_CATEGORIES, { onConflict: "slug", ignoreDuplicates: true });
  if (roots.error) throw roots.error;
  const parents = await categoryIds(
    admin,
    EXAMPLE_ROOT_CATEGORIES.map((c) => c.slug),
  );

  const children = await admin.from("categories").upsert(
    EXAMPLE_CHILD_CATEGORIES.map(({ parent, ...c }) => ({ ...c, parent_id: parents.get(parent) })),
    { onConflict: "slug", ignoreDuplicates: true },
  );
  if (children.error) throw children.error;
  const leaves = await categoryIds(
    admin,
    EXAMPLE_CHILD_CATEGORIES.map((c) => c.slug),
  );

  const listings = await admin.from("listings").insert(
    EXAMPLE_LISTINGS.map(({ category, ...l }) => ({
      ...l,
      seller_id: sellerId,
      category_id: leaves.get(category),
      status: "active" as const,
    })),
  );
  if (listings.error) throw listings.error;
}

async function categoryIds(admin: AdminClient, slugs: string[]) {
  const { data, error } = await admin.from("categories").select("id, slug").in("slug", slugs);
  if (error) throw error;
  return new Map(data.map((c) => [c.slug, c.id]));
}

// Samme kategorier som supabase/seed.sql, som bare kjøres lokalt; på en
// hostet database finnes de ikke før veiviseren legger dem inn.
const EXAMPLE_ROOT_CATEGORIES = [
  {
    slug: "elektronikk",
    name_nb: "Elektronikk",
    sort_order: 10,
    icon: "Laptop",
    color: "oklch(0.55 0.12 250)",
  },
  {
    slug: "mobler-og-interior",
    name_nb: "Møbler og interiør",
    sort_order: 20,
    icon: "Sofa",
    color: "oklch(0.55 0.10 60)",
  },
  {
    slug: "sport-og-friluft",
    name_nb: "Sport og friluft",
    sort_order: 30,
    icon: "Mountain",
    color: "oklch(0.50 0.10 150)",
  },
  {
    slug: "klaer-og-tilbehor",
    name_nb: "Klær og tilbehør",
    sort_order: 40,
    icon: "Shirt",
    color: "oklch(0.58 0.13 15)",
  },
];

const EXAMPLE_CHILD_CATEGORIES = [
  {
    slug: "mobiltelefoner",
    name_nb: "Mobiltelefoner",
    sort_order: 10,
    parent: "elektronikk",
    icon: "Smartphone",
  },
  { slug: "tv-og-lyd", name_nb: "TV og lyd", sort_order: 20, parent: "elektronikk", icon: "Tv" },
  { slug: "sofaer", name_nb: "Sofaer", sort_order: 10, parent: "mobler-og-interior", icon: "Sofa" },
  { slug: "sykler", name_nb: "Sykler", sort_order: 10, parent: "sport-og-friluft", icon: "Bike" },
  {
    slug: "telt-og-camping",
    name_nb: "Telt og camping",
    sort_order: 20,
    parent: "sport-og-friluft",
    icon: "Tent",
  },
];

const EXAMPLE_LISTINGS = [
  {
    title: "Eksempel: Mobiltelefon, 128 GB",
    description: "Eksempelannonse fra oppstartsveiviseren. Slett den når du er klar.",
    price_nok: 2500,
    category: "mobiltelefoner",
    condition: "good" as const,
    city: "Oslo",
    postal_code: "0150",
  },
  {
    title: "Eksempel: Høyttaler med Bluetooth",
    description: "Eksempelannonse fra oppstartsveiviseren. Slett den når du er klar.",
    price_nok: 600,
    category: "tv-og-lyd",
    condition: "like_new" as const,
    city: "Bergen",
    postal_code: "5003",
  },
  {
    title: "Eksempel: Tresetersofa",
    description: "Eksempelannonse fra oppstartsveiviseren. Slett den når du er klar.",
    price_nok: 3000,
    category: "sofaer",
    condition: "acceptable" as const,
    city: "Trondheim",
    postal_code: "7011",
  },
  {
    title: "Eksempel: Bysykkel",
    description: "Eksempelannonse fra oppstartsveiviseren. Slett den når du er klar.",
    price_nok: 1800,
    category: "sykler",
    condition: "good" as const,
    city: "Stavanger",
    postal_code: "4006",
  },
  {
    title: "Eksempel: Telt for to",
    description: "Eksempelannonse fra oppstartsveiviseren. Slett den når du er klar.",
    price_nok: 900,
    category: "telt-og-camping",
    condition: "like_new" as const,
    city: "Tromsø",
    postal_code: "9008",
  },
];
