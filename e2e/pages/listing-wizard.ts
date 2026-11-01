import { expect, type Page } from "@playwright/test";

export async function hydrated(page: Page) {
  await page.locator("html[data-kaupet-hydrated='true']").waitFor();
}

export async function login(page: Page, email: string, password: string, returnTo = "/") {
  await page.goto(`/auth?mode=signin&returnTo=${encodeURIComponent(returnTo)}`);
  await hydrated(page);
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Passord", { exact: true }).fill(password);
  await page.getByRole("main").getByRole("button", { name: "Logg inn" }).click();
  await page.waitForURL(new URL(returnTo, page.url()).href);
}

export function wizardStep(page: Page, key: string) {
  return page.getByTestId(`wizard-step-${key}`);
}

export async function chooseCategory(page: Page, name: string) {
  await page.getByTestId("category-search-input").fill(name);
  const tile = page.locator(`[data-category-name="${name}"]`);
  await tile.click();
  await expect(tile).toHaveCount(0);
}

export async function next(page: Page, key: string) {
  await page.getByTestId("wizard-next-button").click();
  await expect(wizardStep(page, key)).toBeVisible();
}

export async function logout(page: Page) {
  await page.goto("/meg");
  await page.getByRole("button", { name: "Logg ut", exact: true }).click();
  await page.waitForURL(/\/(?:\?.*)?$/);
  await expect(page.getByRole("link", { name: "Logg inn", exact: true })).toBeVisible();
}
