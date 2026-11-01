// kaupet_open: kjører migrasjonene som følger med bygget mot SUPABASE_DB_URL.
// Brukes bare av oppstartsveiviseren, etter at service role-nøkkelen er
// kontrollert og databasen mangler tabellene. Målet er alltid serverens egen
// konfigurasjon, aldri en adresse fra nettleseren.
import postgres from "postgres";

export type Migration = { version: string; name: string; sql: string };

const FILES = import.meta.glob<string>("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export function bundledMigrations(files: Record<string, string> = FILES): Migration[] {
  return Object.entries(files)
    .map(([path, sql]) => {
      const match = /(\d+)_([^/]+)\.sql$/.exec(path);
      if (!match) throw new Error(`Ugyldig migrasjonsnavn: ${path}`);
      return { version: match[1], name: match[2], sql };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Kjører migrasjonene som mangler, i én transaksjon. Registrerer dem i samme
 * tabell som Supabase CLI, så `supabase db push` senere ser dem som kjørt.
 */
export async function applyMigrations(dbUrl: string, migrations = bundledMigrations()) {
  const sql = postgres(dbUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    // Krypter når serveren støtter det, med mindre adressen selv sier sslmode.
    ...(new URL(dbUrl).searchParams.has("sslmode") ? {} : { ssl: "prefer" as const }),
  });
  try {
    const applied: string[] = [];
    await sql.begin(async (tx) => {
      await tx.unsafe(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);
        ALTER TABLE supabase_migrations.schema_migrations
          ADD COLUMN IF NOT EXISTS statements text[],
          ADD COLUMN IF NOT EXISTS name text;
      `);
      const done = new Set(
        (await tx`SELECT version FROM supabase_migrations.schema_migrations`).map(
          (row) => row.version as string,
        ),
      );
      for (const migration of migrations) {
        if (done.has(migration.version)) continue;
        await tx.unsafe(migration.sql);
        await tx`INSERT INTO supabase_migrations.schema_migrations (version, name)
          VALUES (${migration.version}, ${migration.name})`;
        applied.push(migration.version);
      }
    });
    // PostgREST må lese skjemaet på nytt før tabellene kan brukes via API-et.
    await sql`NOTIFY pgrst, 'reload schema'`;
    return applied;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
