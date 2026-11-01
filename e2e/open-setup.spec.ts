import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";

test("ny installasjon oppretter første admin gjennom oppstartsveiviseren", async ({ page }) => {
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { count, error } = await admin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  expect(error).toBeNull();
  expect(count).toBe(0);
  await page.goto("/");
  // Appens vanlige hydreringmarkør monteres først etter at oppsettet er ferdig.
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Oppstartsveiviser", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Velkommen til kaupet_open" })).toBeVisible();
  await page.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Koble til Supabase" })).toBeVisible();
  await page.getByRole("button", { name: "Fortsett med denne databasen" }).click();
  await expect(page.getByLabel("Prosjekt-URL")).toHaveCount(0);
  await expect(page.getByLabel("Publishable key (anon)")).toHaveCount(0);
  await page.getByLabel("Service role-nøkkel").fill(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await page.getByRole("button", { name: "Test tilkoblingen" }).click();
  await expect(page.getByRole("heading", { name: "Første admin-konto" })).toBeVisible();
  await page.getByLabel("Visningsnavn").fill("Første administrator");
  await page.getByLabel("E-post", { exact: true }).fill("first-admin@example.com");
  await page.getByLabel("Passord", { exact: true }).fill("open-test-password-12345");
  await page.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Layout", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vilkår og personvern" })).toBeVisible();
  await page.getByRole("button", { name: "Neste", exact: true }).click();
  await page.getByRole("button", { name: "Fullfør oppsettet" }).click();
  await expect(page.getByRole("heading", { name: "Nesten ferdig" })).toBeVisible();
  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  expect(roleError).toBeNull();
  expect(roles).toHaveLength(1);
  await page.goto("/");
  await expect(page.getByRole("searchbox", { name: "Søk i annonser" })).toBeVisible();
  await expect(page.getByText("Oppstartsveiviser", { exact: true })).toHaveCount(0);
});
