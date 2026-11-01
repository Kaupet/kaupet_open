import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { chooseCategory, hydrated, login, logout, next, wizardStep } from "./pages/listing-wizard";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const password = "open-test-password-12345";

// En liten syntetisk PNG, uten kameraopplysninger eller eksterne ressurslenker.
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2kAAAAASUVORK5CYII=",
  "base64",
);

test("registrerer seg, publiserer med bilde, søker, sender melding, rapporterer og sletter konto", async ({
  page,
}, testInfo) => {
  const unique = `${Date.now()}${testInfo.project.name.replace(/\W/g, "")}`;
  const sellerEmail = `seller-${unique}@example.com`;
  const buyerEmail = `buyer-${unique}@example.com`;
  const title = `Open teststol ${unique}`;
  const userIds: string[] = [];
  let listingId: string | undefined;
  try {
    await page.goto("/auth?mode=signup");
    await hydrated(page);
    await page.getByLabel("Visningsnavn").fill("Open testselger");
    await page.getByLabel("E-post").fill(sellerEmail);
    await page.getByLabel("Passord", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Opprett konto", exact: true }).click();
    await page.waitForURL(/\/(?:\?.*)?$/);
    const { data: created, error: usersError } = await admin.auth.admin.listUsers();
    expect(usersError).toBeNull();
    const sellerId = created.users.find((user) => user.email === sellerEmail)?.id;
    expect(sellerId).toBeTruthy();
    userIds.push(sellerId!);

    await page.goto("/ny-annonse?type=sell");
    await hydrated(page);
    await chooseCategory(page, "E2E-test gjest (ikke bruk)");
    await expect(wizardStep(page, "photos")).toBeVisible();
    await page.getByTestId("listing-title-input").fill(title);
    await page.getByLabel("Velg bilder", { exact: true }).setInputFiles({
      name: "testbilde.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect(wizardStep(page, "photos").locator("img").first()).toBeVisible();
    await page.getByTestId("wizard-next-button").click();
    await expect(page.getByTestId("listing-description-textarea")).toBeVisible();
    await page
      .getByTestId("listing-description-textarea")
      .fill("Syntetisk testannonse med bilde. En stol i god stand.");
    await next(page, "condition");
    await page.getByRole("checkbox", { name: "Gis bort gratis" }).click();
    await page.getByRole("radio", { name: /Må hentes/ }).click();
    await page.getByLabel("Postnummer", { exact: true }).fill("0152");
    await page.getByLabel("Sted", { exact: true }).fill("Oslo");
    await next(page, "review-publish");
    await page.getByTestId("publish-listing-button").click();
    await expect(page.getByRole("heading", { name: "Annonsen er nå publisert" })).toBeVisible();
    await page.getByRole("button", { name: "Se annonsen", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const listingUrl = page.url();
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id, status, postal_code, city, lat, lng")
      .eq("seller_id", sellerId!)
      .eq("title", title)
      .single();
    expect(listingError).toBeNull();
    expect(listing?.status).toBe("active");
    expect(listing?.postal_code).toBe("0152");
    expect(listing?.city).toBe("Oslo");
    expect(listing?.lat).toBeNull();
    expect(listing?.lng).toBeNull();
    listingId = listing!.id;
    const { data: images, error: imageError } = await admin
      .from("listing_images")
      .select("storage_path")
      .eq("listing_id", listingId);
    expect(imageError).toBeNull();
    expect(images).toHaveLength(1);
    const displayedImage = page.getByRole("img", { name: title, exact: true }).first();
    await expect(displayedImage).toBeVisible();
    await expect
      .poll(() => displayedImage.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    await logout(page);
    const { data: buyerData, error: buyerError } = await admin.auth.admin.createUser({
      email: buyerEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Open testkjøper" },
    });
    expect(buyerError).toBeNull();
    const buyerId = buyerData.user!.id;
    userIds.push(buyerId);
    await login(page, buyerEmail, password);
    await page.getByRole("searchbox", { name: "Søk i annonser", exact: true }).fill(title);
    await page.getByRole("button", { name: "Søk", exact: true }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await page.getByText(title, { exact: true }).first().click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: /^Send melding(?: til selger)?$/ })
      .first()
      .click();
    await expect(page.getByRole("textbox", { name: "Melding", exact: true })).toBeVisible();
    const body = `Er stolen fortsatt ledig? ${unique}`;
    await page.getByRole("textbox", { name: "Melding", exact: true }).fill(body);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    // Meldingsboblen vises optimistisk; vent på den faktiske lagringen før opprydding.
    await expect
      .poll(async () => {
        const { data: messages, error: messageError } = await admin
          .from("messages")
          .select("body")
          .eq("sender_id", buyerId)
          .eq("body", body);
        expect(messageError).toBeNull();
        return messages;
      })
      .toHaveLength(1);

    await page.goto(listingUrl);
    await page.getByRole("button", { name: "Flere valg", exact: true }).click();
    await page.getByRole("menuitem", { name: "Rapporter annonse", exact: true }).click();
    const report = page.getByRole("dialog", { name: "Rapporter annonse" });
    await report.getByLabel("Grunn", { exact: true }).click();
    await page.getByRole("option", { name: "Annet", exact: true }).click();
    await report.getByLabel("Kommentar (valgfri)").fill("Syntetisk test av rapportering.");
    await report.getByRole("button", { name: "Send inn rapport" }).click();
    await expect(report).toBeHidden();
    const { data: reports, error: reportError } = await admin
      .from("reports")
      .select("reason")
      .eq("listing_id", listingId)
      .eq("reporter_id", buyerId);
    expect(reportError).toBeNull();
    expect(reports).toEqual([{ reason: "Annet" }]);

    await logout(page);
    await login(page, sellerEmail, password, "/profil?tab=konto");
    await page.getByRole("button", { name: "Slett konto", exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.getByLabel("Bekreft e-post").fill(sellerEmail);
    await confirmation.getByRole("button", { name: "Slett kontoen min", exact: true }).click();
    await page.waitForURL(/\/(?:\?.*)?$/);
    const { data: deletion, error: deletionError } = await admin
      .from("account_deletions")
      .select("user_id")
      .eq("user_id", sellerId!)
      .single();
    expect(deletionError).toBeNull();
    expect(deletion?.user_id).toBe(sellerId);
    const { data: archived } = await admin
      .from("listings")
      .select("status")
      .eq("id", listingId)
      .single();
    expect(archived?.status).toBe("archived");
  } finally {
    if (listingId) {
      for (const table of ["reports", "conversations", "listing_images"]) {
        const { error } = await admin.from(table).delete().eq("listing_id", listingId);
        expect(error, `Opprydding av ${table}`).toBeNull();
      }
      expect((await admin.from("listings").delete().eq("id", listingId)).error).toBeNull();
    }
    for (const userId of userIds) {
      expect(
        (await admin.from("account_deletions").delete().eq("user_id", userId)).error,
      ).toBeNull();
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  }
});
