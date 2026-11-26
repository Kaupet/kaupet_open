// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ completeSetup: vi.fn(), runSetupMigrations: vi.fn() }));
vi.mock("./setup.functions", () => ({
  checkSetupConnection: async () => ({ state: "klar" }),
  completeSetup: mocks.completeSetup,
  runSetupMigrations: mocks.runSetupMigrations,
}));

const client = vi.hoisted(() => ({ supabaseConfigured: true }));
vi.mock("@/integrations/supabase/client", () => client);

import { SetupGate } from "./setup-gate";

afterEach(() => {
  cleanup();
  client.supabaseConfigured = true;
});

const next = (name = "Neste") => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function throughAdmin() {
  render(
    <SetupGate
      status={{
        reason: "mangler-admin",
        configuredUrl: "https://x.supabase.co",
        canMigrate: false,
      }}
    >
      app
    </SetupGate>,
  );
  next(); // intro
  expect(document.body.textContent).toContain("Serveren er allerede koblet til");
  next("Fortsett med denne databasen");
  type("Service role-nøkkel", "sr");
  next("Test tilkoblingen");
  await screen.findByText("Første admin-konto");
  type("Visningsnavn", "Kari");
  type("E-post", "kari@example.com");
  type("Passord", "et-langt-passord");
  next();
  next(); // layout
}

it("uten mobilapp, vilkår og e-post fullføres det vanlige weboppsettet", async () => {
  mocks.completeSetup.mockResolvedValue({ createdAdmin: true, examples: false });
  await throughAdmin();
  expect(
    (screen.getByRole("radio", { name: "Nei, bare nettleser" }) as HTMLInputElement).checked,
  ).toBe(true);
  next(); // mobilapp
  next(); // vilkår: «Nei» er standard
  next("Fullfør oppsettet"); // e-post: «Ingen» er standard

  await screen.findByText("Nesten ferdig");
  const text = document.body.textContent ?? "";
  expect(text).toContain('VITE_OPEN_LEGAL_PAGES="false"');
  expect(text).toContain('VITE_OPEN_EMAIL="false"');
  expect(text).toContain("enable_confirmations = false");
  expect(text).not.toContain("SMTP_PASS");
  expect(screen.queryByRole("heading", { name: "Bygg mobilappen" })).toBeNull();
});

it("med vilkårssider og Resend gir SMTP-oppsett og Resend-nøkkel", async () => {
  mocks.completeSetup.mockResolvedValue({ createdAdmin: true, examples: false });
  await throughAdmin();
  next(); // mobilapp
  fireEvent.click(screen.getByLabelText(/Ja, lag tomme sider/));
  next();

  fireEvent.change(screen.getByLabelText("E-posttjeneste"), { target: { value: "resend" } });
  next("Fullfør oppsettet");
  expect((await screen.findByRole("alert")).textContent).toBe("Lim inn API-nøkkelen");

  type("API-nøkkel", "re_123");
  type("Avsenderadresse", "ikkesvar@example.com");
  next("Fullfør oppsettet");

  await screen.findByText("Nesten ferdig");
  const text = document.body.textContent ?? "";
  expect(text).toContain('VITE_OPEN_LEGAL_PAGES="true"');
  expect(text).toContain('VITE_OPEN_EMAIL="true"');
  expect(text).toContain('SUPABASE_AUTH_SMTP_PASS="re_123"');
  expect(text).not.toContain("RESEND_API_KEY");
  expect(text).toContain(`VITE_SITE_URL="${window.location.origin}"`);
  expect(text).toContain('host = "smtp.resend.com"');
  expect(text).toContain('user = "resend"');
  expect(text).toContain('pass = "env(SUPABASE_AUTH_SMTP_PASS)"');
  await waitFor(() => expect(mocks.completeSetup).toHaveBeenCalled());
});

it("mobilappvalget beholdes ved tilbake og viser byggeguide for begge plattformer", async () => {
  mocks.completeSetup.mockResolvedValue({ createdAdmin: true, examples: false });
  const user = userEvent.setup();
  await throughAdmin();
  await user.click(screen.getByRole("radio", { name: "Nei, bare nettleser" }));
  await user.keyboard("{ArrowDown}");
  const yes = () =>
    screen.getByRole("radio", { name: "Ja, ta med appoppsett og byggeguide" }) as HTMLInputElement;
  expect(yes().checked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Neste" }));
  await user.click(screen.getByRole("button", { name: "Tilbake" }));
  expect(yes().checked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Neste" }));
  await user.click(screen.getByRole("button", { name: "Neste" }));
  await user.click(screen.getByRole("button", { name: "Fullfør oppsettet" }));
  await screen.findByRole("heading", { name: "Bygg mobilappen" });
  expect(screen.getByText("bun run cap add ios --packagemanager SPM")).toBeTruthy();
  expect(screen.getByText("bun run cap add android")).toBeTruthy();
  expect(screen.getByText("NSLocationWhenInUseUsageDescription")).toBeTruthy();
  expect(screen.getByText("ACCESS_FINE_LOCATION")).toBeTruthy();
  expect(screen.getByText(/CAPACITOR_APP_URL=/)).toBeTruthy();
});

it("uten servermiljø viser veiledning for valgt type instans", () => {
  render(
    <SetupGate status={{ reason: "mangler-miljo", configuredUrl: null, canMigrate: false }}>
      app
    </SetupGate>,
  );
  expect(screen.getByText("Velkommen til kaupet_open")).toBeTruthy();
  for (const doc of ["LICENSE", "NOTICE"]) {
    expect(screen.getByRole("link", { name: doc }).getAttribute("href")).toBe(
      `https://github.com/Kaupet/kaupet_open/blob/main/${doc}`,
    );
  }
  const developer = screen.getByRole("link", { name: /\/developer\/open$/ });
  expect(developer.getAttribute("href")).toBe(`https://${developer.textContent}`);
  next(); // intro
  expect(document.body.textContent).toContain("127.0.0.1:54322");
  fireEvent.click(screen.getByLabelText(/Hos Supabase/));
  expect(document.body.textContent).toContain("Session pooler");
  expect(document.body.textContent).toContain("sslmode=require");
  expect(screen.queryByLabelText("Service role-nøkkel")).toBeNull();
  expect(screen.queryByRole("button", { name: "Fortsett med denne databasen" })).toBeNull();
});

it("kjører migrasjonen fra veiviseren når databasen mangler tabellene", async () => {
  mocks.runSetupMigrations.mockResolvedValue({ state: "klar" });
  render(
    <SetupGate
      status={{
        reason: "mangler-skjema",
        configuredUrl: "http://127.0.0.1:54321",
        canMigrate: true,
      }}
    >
      app
    </SetupGate>,
  );
  next(); // intro
  expect(document.body.textContent).toContain("Serveren er allerede koblet til");
  next("Fortsett med denne databasen");
  type("Service role-nøkkel", "sr");
  next("Bygg databasen");
  await screen.findByText("Første admin-konto");
  expect(mocks.runSetupMigrations).toHaveBeenCalledWith({ data: { serviceRoleKey: "sr" } });
});

it("stopper når nettleserdelen mangler Supabase-variablene", () => {
  client.supabaseConfigured = false;
  render(
    <SetupGate
      status={{
        reason: "mangler-admin",
        configuredUrl: "http://127.0.0.1:54321",
        canMigrate: false,
      }}
    >
      app
    </SetupGate>,
  );
  next(); // intro
  expect(screen.getByRole("alert").textContent).toContain("VITE_SUPABASE_URL");
  expect(screen.queryByRole("button", { name: "Fortsett med denne databasen" })).toBeNull();
});

it("steg 1 viser hvilke servervariabler som mangler", () => {
  render(
    <SetupGate
      status={{
        reason: "mangler-miljo",
        configuredUrl: null,
        canMigrate: false,
        missing: ["SUPABASE_SERVICE_ROLE_KEY"],
      }}
    >
      app
    </SetupGate>,
  );
  next(); // intro
  expect(screen.getByRole("alert").textContent).toBe(
    "Serveren mangler SUPABASE_SERVICE_ROLE_KEY.Alle verdiene under må være satt før veiviseren kan fortsette.",
  );
});
