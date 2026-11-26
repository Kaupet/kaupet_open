// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ListingRow, type Row } from "./listing-row";

import { EDITION } from "@/lib/edition";
import { registerVertical } from "@/lib/verticals";

// Stub for vertikalens 360°-launcher slik at testen ser når autoStart
// monterer den uten knappetrykk (registerVertical er testens eget
// registreringspunkt — ingen kjøretøymodul importeres her).
registerVertical({
  Spin360CaptureLauncher: ({ autoStart }: { autoStart?: boolean }) =>
    autoStart ? <div data-testid="spin360-launcher" /> : null,
  Spin360QrPanel: () => <div data-testid="spin360-qr-panel" />,
});

const layout = vi.hoisted(() => ({ native: false, narrow: false, desktop: false }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => layout.native }));
vi.mock("@/hooks/use-form-factor", () => ({
  useIsNarrow: () => layout.narrow,
  useFormFactor: () => (layout.desktop ? "desktop" : "web"),
}));
vi.mock("@/hooks/use-native-promotion-allowed", () => ({ useNativePromotionAllowed: () => true }));
beforeEach(() => {
  layout.native = false;
  layout.narrow = false;
  layout.desktop = false;
});
afterEach(cleanup);

vi.mock("@/lib/storage", () => ({
  signListingImageUrls: vi.fn().mockResolvedValue({}),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const row: Row = {
  id: "1",
  kaupet_code: "ABC123",
  title: "Test-annonse",
  status: "active",
  price_nok: 100,
  is_free: false,
  city: "Oslo",
  category_id: null,
  category_slug: null,
  attributes: null,
  description: null,
  view_count: 0,
  favorite_count: 0,
  created_at: new Date().toISOString(),
  expires_at: null,
  cover_path: null,
};

const noop = () => {};

// Typekontrakt (kjøres av tsc): uten editOnly er radhandlingene påkrevd, så
// en glemt onDelete ikke gir en sletteknapp som ikke gjør noe.
export function _listingRowRequiresActions() {
  // @ts-expect-error onPromote … onDelete mangler
  return <ListingRow row={row} spin360={false} activePromotion={null} busy={false} />;
}

describe("ListingRow", () => {
  it.skipIf(EDITION === "open")(
    "shows the promote action for every user, not just demo/admin roles",
    () => {
      const { getAllByText } = renderWithClient(
        <ListingRow
          row={row}
          spin360={false}
          activePromotion={null}
          onPromote={noop}
          onMarkSold={noop}
          onReactivate={noop}
          onRepublish={noop}
          onPublishDraft={noop}
          onDelete={noop}
          busy={false}
        />,
      );

      expect(getAllByText("Fremhev annonse").length).toBeGreaterThan(0);
    },
  );

  it("viser bare Rediger i editOnly, uten døde status- og slettehandlinger", () => {
    const { getByText, queryByText, queryByLabelText } = renderWithClient(
      <ListingRow
        row={{ ...row, status: "draft" }}
        spin360={false}
        activePromotion={null}
        busy={false}
        editOnly
      />,
    );
    expect(getByText("Rediger")).toBeTruthy();
    expect(queryByText("Publiser")).toBeNull();
    expect(queryByText("Marker som solgt")).toBeNull();
    expect(queryByLabelText("Slett")).toBeNull();
  });
});

const actions = {
  onPromote: noop,
  onMarkSold: noop,
  onReactivate: noop,
  onRepublish: noop,
  onPublishDraft: noop,
  onDelete: noop,
};

describe.skipIf(EDITION === "open")("moderator-deaktivert annonse", () => {
  it.each([
    { name: "desktop", native: false, narrow: false },
    { name: "mobilnettleser", native: false, narrow: true },
    { name: "native telefon", native: true, narrow: true },
  ])("viser forklaring og svarmulighet på $name uten døde handlinger", async (mode) => {
    layout.native = mode.native;
    layout.narrow = mode.narrow;
    const user = userEvent.setup();
    const reactivate = vi.fn();
    renderWithClient(
      <ListingRow
        row={{ ...row, status: "disabled" }}
        spin360={false}
        activePromotion={null}
        busy={false}
        {...actions}
        onReactivate={reactivate}
      />,
    );
    expect(screen.getByText("Deaktivert av moderator")).toBeTruthy();
    if (mode.native) {
      await user.click(screen.getByRole("button", { name: "Flere valg" }));
      expect(screen.queryByRole("menuitem", { name: /Reaktiver|Rediger|Slett/ })).toBeNull();
      await user.keyboard("{Escape}");
    }
    expect(screen.queryByRole("button", { name: /Reaktiver|Slett/ })).toBeNull();
    expect(screen.queryByText("Rediger")).toBeNull();
    const info = screen.getByRole("button", {
      name: "Deaktivert av moderator: Test-annonse. Mer informasjon",
    });
    info.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Deaktivert av moderator" });
    expect(dialog.textContent).toContain("ikke synlig for andre brukere");
    expect(dialog.textContent).toContain("Svar i samtalen");
    expect(dialog.textContent).toContain(
      "En moderator eller administrator må aktivere annonsen igjen",
    );
    expect(within(dialog).getByRole("link", { name: "Åpne meldinger" }).getAttribute("href")).toBe(
      "/meldinger",
    );
    expect(
      within(dialog).getByRole("link", { name: "Hjelp og kontakt" }).getAttribute("href"),
    ).toBe("/hjelp");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(reactivate).not.toHaveBeenCalled();
  });

  it.each([
    ["sold", "Reaktiver"],
    ["archived", "Reaktiver"],
    ["expired", "Publiser på nytt"],
    ["draft", "Publiser"],
  ] as const)("beholder riktig handling for %s", (status, label) => {
    renderWithClient(
      <ListingRow
        row={{ ...row, status }}
        spin360={false}
        activePromotion={null}
        busy={false}
        {...actions}
      />,
    );
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Deaktivert av moderator:/ })).toBeNull();
  });
});

describe.skipIf(EDITION === "open")(
  "360°-opptak som eget steg fra overflow-menyen (native)",
  () => {
    it("viser menyvalget for spin360-kjøretøy og starter opptaket ved klikk, uten 360-ikon på raden", async () => {
      layout.native = true;
      const user = userEvent.setup();
      renderWithClient(
        <ListingRow row={row} spin360 activePromotion={null} busy={false} {...actions} />,
      );
      // Ingen 360-knapp/merke direkte på raden — kun i menyen.
      expect(screen.queryByRole("button", { name: /360/ })).toBeNull();
      expect(screen.queryByTestId("spin360-launcher")).toBeNull();
      await user.click(screen.getByRole("button", { name: "Flere valg" }));
      const item = await screen.findByRole("menuitem", { name: "Legg til 360°-opptak" });
      await user.click(item);
      expect(await screen.findByTestId("spin360-launcher")).toBeTruthy();
    });

    it("viser ikke 360°-valget for solgte annonser", async () => {
      layout.native = true;
      const user = userEvent.setup();
      renderWithClient(
        <ListingRow
          row={{ ...row, status: "sold" }}
          spin360
          activePromotion={null}
          busy={false}
          {...actions}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Flere valg" }));
      expect(screen.queryByRole("menuitem", { name: /360/ })).toBeNull();
    });

    it.each([
      { name: "desktop", narrow: false },
      { name: "mobilnettleser", narrow: true },
    ])("viser ikke 360°-valget i nettleser ($name) — der går opptaket via QR-koden", (mode) => {
      layout.narrow = mode.narrow;
      renderWithClient(
        <ListingRow row={row} spin360 activePromotion={null} busy={false} {...actions} />,
      );
      // Web-raden har ingen overflow-meny og ingen 360°-inngang.
      expect(screen.queryByRole("button", { name: "Flere valg" })).toBeNull();
      expect(screen.queryByText(/360/)).toBeNull();
      expect(screen.queryByTestId("spin360-launcher")).toBeNull();
    });

    it("viser ikke 360°-valget når kategorien ikke er spin360-kompatibel", async () => {
      layout.native = true;
      const user = userEvent.setup();
      renderWithClient(
        <ListingRow row={row} spin360={false} activePromotion={null} busy={false} {...actions} />,
      );
      await user.click(screen.getByRole("button", { name: "Flere valg" }));
      expect(screen.queryByRole("menuitem", { name: /360/ })).toBeNull();
    });
  },
);

describe("360°-knapp i bedriftens annonseliste (editOnly)", () => {
  const spinListing = { ...row, status: "active" as const };

  it("starter opptaket i appen", async () => {
    layout.native = true;
    renderWithClient(
      <ListingRow row={spinListing} spin360 activePromotion={null} busy={false} editOnly />,
    );
    expect(screen.queryByTestId("spin360-launcher")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Legg til 360°-opptak" }));
    expect(screen.getByTestId("spin360-launcher")).toBeTruthy();
  });

  it("viser QR-koden i desktop-nettleser", async () => {
    layout.desktop = true;
    renderWithClient(
      <ListingRow row={spinListing} spin360 activePromotion={null} busy={false} editOnly />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Legg til 360°-opptak" }));
    expect(await screen.findByTestId("spin360-qr-panel")).toBeTruthy();
  });

  it.each([
    ["uten endringsrett", { readOnly: true }, spinListing, true],
    ["for solgte annonser", {}, { ...row, status: "sold" as const }, true],
    ["for kategorier uten 360°", {}, spinListing, false],
  ])("vises ikke %s", (_name, extra, listing, spin360) => {
    layout.native = true;
    renderWithClient(
      <ListingRow
        row={listing}
        spin360={spin360}
        activePromotion={null}
        busy={false}
        editOnly
        {...extra}
      />,
    );
    expect(screen.queryByRole("button", { name: "Legg til 360°-opptak" })).toBeNull();
  });
});
