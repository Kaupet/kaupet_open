import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = "supabase/migrations";
export function activePublicTables(migrations) {
  const tables = new Set();
  for (const sql of migrations) {
    for (const [, operation, quoted, unquoted] of sql.matchAll(
      /^\s*(CREATE|DROP)\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+(?:"public"|public)\s*\.\s*(?:"([a-z][a-z0-9_]*)"|([a-z][a-z0-9_]*))/gim,
    )) {
      const name = (quoted ?? unquoted).toLowerCase();
      if (operation.toUpperCase() === "CREATE") tables.add(name);
      else tables.delete(name);
    }
  }
  return tables;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tables = activePublicTables(
    readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(join(migrationDir, file), "utf8")),
  );
  if (!tables.size)
    throw new Error("Fant ingen public-tabeller; RLS-inventaret kan ikke godkjennes.");

  const rlsDir = "src/lib/rls";
  const rlsTests = readdirSync(rlsDir)
    .filter((name) => name.endsWith(".integration.test.ts"))
    .map((name) => readFileSync(join(rlsDir, name), "utf8"))
    .join("\n");
  const referenced = new Set(
    [...rlsTests.matchAll(/\.from\(\s*["']([a-z][a-z0-9_]*)["']\s*\)/g)].map((match) => match[1]),
  );
  // Existing gaps stay visible. New tables must get an RLS case before CI passes.
  const knownGaps = new Set();
  const missing = [...tables].filter((name) => !referenced.has(name)).sort();
  const newGaps = missing.filter((name) => !knownGaps.has(name));
  const staleGaps = [...knownGaps].filter((name) => !missing.includes(name));

  console.log(
    `RLS-inventar: ${tables.size} aktive public-tabeller, ${missing.length} uten testreferanse.`,
  );
  if (missing.length) console.log(`Kjente gap: ${missing.join(", ")}`);
  if (newGaps.length) console.error(`Nye tabeller uten RLS-test: ${newGaps.join(", ")}`);
  if (staleGaps.length) console.error(`Fjern løste gap fra sjekken: ${staleGaps.join(", ")}`);
  if (newGaps.length || staleGaps.length) process.exitCode = 1;
}
