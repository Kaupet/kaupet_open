// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getListingDateMeta } from "./listing-date-meta";

vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ pathname: "/annonse/1", search: {} }),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/components/ui/carousel", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Carousel: Pass,
    CarouselContent: Pass,
    CarouselItem: Pass,
    CarouselPrevious: () => null,
    CarouselNext: () => null,
  };
});
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/listing-detail-map", () => ({
  ListingDetailMap: ({ lat, lng, exact }: { lat: number; lng: number; exact: boolean }) => (
    <span>{`${lat}, ${lng}, ${exact ? "eksakt" : "omtrentlig"}`}</span>
  ),
}));
vi.mock("@/components/listing-detail/map-overlay", () => ({
  MapOverlay: ({
    exactLocationLabel,
    onClose,
  }: {
    exactLocationLabel?: string | null;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Kart for annonse">
      <span>{exactLocationLabel ?? "Omtrentlig plassering"}</span>
      <button type="button" onClick={onClose}>
        Lukk kart
      </button>
    </div>
  ),
}));

import { ListingDetailView, type ListingDetailViewProps } from "./listing-detail-view";

const mapAvailability = vi.hoisted(() => ({ MAPS_AVAILABLE: true }));
vi.mock("@/lib/location-availability", () => mapAvailability);

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const baseProps: ListingDetailViewProps = {
  title: "Sykkel",
  subtitle: null,
  description: "Fin sykkel",
  priceNok: 7500,
  isFree: false,
  condition: null,
  city: null,
  postalCode: null,
  displayLat: null,
  displayLng: null,
  createdAt: "2026-09-12T00:00:00Z",
  updatedAt: null,
  publishedAt: "2026-09-12T00:00:00Z",
  knownIssues: null,
  noKnownIssues: null,
  maintenanceHistory: null,
  category: { name_nb: "Sykler", slug: "sykkel" },
  images: [],
  imgUrls: {},
  attributes: {},
  requiresDeliveryMethod: false,
  canShip: null,
};

describe("annonse-dato på detaljsiden", () => {
  it("viser opprettelsesdato for kladd, ikke publiseringsdato", () => {
    expect(
      getListingDateMeta("draft", null, "2026-09-12T00:00:00Z", "2026-09-12T00:00:00Z"),
    ).toEqual({ label: "Opprettet", dateStr: "12. september 2026" });
  });
});

describe("tilstand og kontakt på annonsedetaljen", () => {
  afterEach(cleanup);

  it("skiller solgt fra gitt bort og viser ikke statusmerke for aktiv annonse", () => {
    const { rerender } = render(<ListingDetailView {...baseProps} listingStatus="sold" />);
    expect(screen.getByText("Solgt")).toBeTruthy();

    rerender(<ListingDetailView {...baseProps} isFree listingStatus="sold" />);
    expect(screen.getByText("Gitt bort")).toBeTruthy();

    rerender(<ListingDetailView {...baseProps} listingStatus="active" />);
    expect(screen.queryByText("Solgt")).toBeNull();
    expect(screen.queryByText("Gitt bort")).toBeNull();

    rerender(<ListingDetailView {...baseProps} listingStatus="expired" />);
    expect(screen.getByText("Utløpt")).toBeTruthy();

    rerender(<ListingDetailView {...baseProps} listingStatus="archived" />);
    expect(screen.getByText("Arkivert")).toBeTruthy();
  });

  it("merker en aktiv annonse som reservert frem til fristen", () => {
    render(
      <ListingDetailView
        {...baseProps}
        listingStatus="active"
        reservedUntil={new Date(Date.now() + 60 * 60 * 1000).toISOString()}
      />,
    );
    expect(screen.getByText("Reservert")).toBeTruthy();
  });

  it("viser kontaktfeltet og annonsert besøksadresse når de er gitt", () => {
    render(
      <ListingDetailView
        {...baseProps}
        exactLocationLabel="Storgata 1"
        displayLat={59.9}
        displayLng={10.7}
        stickyContactSlot={<button type="button">Send melding</button>}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Send melding" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Besøksadresse: Storgata 1")).toBeTruthy();
  });

  it("viser leveringsvalget bare når kategorien bruker levering", () => {
    const { rerender } = render(
      <ListingDetailView {...baseProps} requiresDeliveryMethod listingStatus="active" canShip />,
    );
    expect(screen.getByText("Kan sendes")).toBeTruthy();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ListingDetailView
          {...baseProps}
          requiresDeliveryMethod
          listingStatus="active"
          canShip={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Kun henting")).toBeTruthy();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ListingDetailView {...baseProps} requiresDeliveryMethod listingStatus="active" />
      </QueryClientProvider>,
    );
    expect(screen.getAllByText("Ikke oppgitt")).toHaveLength(2);

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ListingDetailView {...baseProps} listingStatus="active" canShip />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Kan sendes")).toBeNull();
  });

  it("viser telefonforhåndsvisningens tomme plassholdere og sticky kontakt", () => {
    render(
      <ListingDetailView
        {...baseProps}
        title="Forhåndsvisning"
        description=""
        priceNok={null}
        city={null}
        postalCode={null}
        requiresDeliveryMethod
        canShip={null}
        phonePreview
        stickyContactSlot={<button type="button">Kontakt selger</button>}
      />,
    );

    expect(screen.getByText("Bilder vises her")).toBeTruthy();
    expect(
      screen.getByText("Lokasjon")?.nextElementSibling?.querySelector('[aria-hidden="true"]'),
    ).toBeTruthy();
    expect(
      screen.getByText("Levering")?.nextElementSibling?.querySelector('[aria-hidden="true"]'),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kontakt selger" })).toBeTruthy();
    expect(document.querySelector("[data-preview-sticky-bottom]")).toBeTruthy();
  });

  it("viser kategoristien med lenker og kategorien uten slug som gjeldende side", () => {
    render(
      <ListingDetailView
        {...baseProps}
        breadcrumb={[
          { name_nb: "Fritid", slug: "fritid" },
          { name_nb: "Sykler", slug: "sykkel", attrs: "type:el" },
          { name_nb: "Terrengsykler", slug: null },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Fritid" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sykler" })).toBeTruthy();
    expect(screen.getByText("Terrengsykler")).toBeTruthy();
  });

  it("åpner og lukker kartet for en annonse med eksakt adresse", async () => {
    const user = userEvent.setup();
    render(
      <ListingDetailView
        {...baseProps}
        displayLat={59.9}
        displayLng={10.7}
        exactLocationLabel="Storgata 1"
      />,
    );

    expect(screen.getByText("Besøksadresse: Storgata 1")).toBeTruthy();
    expect(screen.getByText("59.9, 10.7, eksakt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Se kart i fullskjerm" }));
    expect(await screen.findByRole("dialog", { name: "Kart for annonse" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lukk kart" }));
    expect(screen.queryByRole("dialog", { name: "Kart for annonse" })).toBeNull();
  });
});

it("viser sted uten kartlenke når kart ikke er tilgjengelig", () => {
  mapAvailability.MAPS_AVAILABLE = false;
  try {
    render(<ListingDetailView {...baseProps} city="Oslo" displayLat={59.9} displayLng={10.7} />);
    expect(screen.getByText("Oslo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Se kart i fullskjerm" })).toBeNull();
  } finally {
    mapAvailability.MAPS_AVAILABLE = true;
  }
});
