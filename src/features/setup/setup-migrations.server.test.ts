import { expect, it } from "vitest";

import { bundledMigrations } from "./setup-migrations.server";

it("følger med migrasjonene i versjonsrekkefølge", () => {
  expect(
    bundledMigrations({
      "/supabase/migrations/20261101000000_neste.sql": "b",
      "/supabase/migrations/20261025000000_kaupet_open_baseline.sql": "a",
    }),
  ).toEqual([
    { version: "20261025000000", name: "kaupet_open_baseline", sql: "a" },
    { version: "20261101000000", name: "neste", sql: "b" },
  ]);
  expect(() => bundledMigrations({ "/supabase/migrations/uten-versjon.sql": "" })).toThrow();
  // Bygget tar med prosjektets egne migrasjoner, med basismigrasjonen først.
  expect(bundledMigrations()[0]?.name).toBe("kaupet_open_baseline");
});
