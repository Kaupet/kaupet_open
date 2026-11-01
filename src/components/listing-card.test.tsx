// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ListingCard } from "./listing-card";
import { PART_FITMENT_MODEL_IDS_KEY } from "@/lib/category-filters";
import type { ListingCardData } from "@/lib/listing-card-data";
import "@/lib/vehicle/register";
import { EDITION } from "@/lib/edition";
import { ListingCardExpanded } from "./listing-card-expanded";
import { ListingCardImages } from "./listing-card-images";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/favorite-button", () => ({ FavoriteButton: () => null }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-listing-gallery-images", () => ({
  useListingGalleryImages: () => ({ images: [], imgUrls: {}, isLoading: false }),
}));

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
afterAll(() => vi.unstubAllGlobals());

const listing: ListingCardData = {
  id: "listing-1",
  kaupet_code: "ABC123",
  title: "Volvo V90",
  subtitle: "D4 AWD",
  price_nok: 250_000,
  is_free: false,
  city: "Oslo",
  created_at: "2026-08-23T00:00:00Z",
  cover_path: null,
  total_views: 9_876,
  views_last_week: 123,
  mileage_km: 85_000,
};

describe("offentlige annonsekort", () => {
  it("bevarer annonsemetadata uten å vise selgerens visningstall", () => {
    render(
      <>
        <ListingCard listing={listing} />
        <ListingCardExpanded listing={listing} />
      </>,
    );

    expect(screen.getAllByText("Volvo V90")).toHaveLength(2);
    expect(screen.getAllByText("250 000 kr")).toHaveLength(2);
    expect(screen.getAllByText("Oslo")).toHaveLength(2);
    expect(screen.getAllByText("85 000 km")).toHaveLength(2);
    expect(screen.queryByText("9 876")).toBeNull();
    expect(screen.queryByText(/siste syv dager/)).toBeNull();
  });

  it("viser at selgeroppgitt bildelkompatibilitet", () => {
    render(
      <ListingCard
        listing={{
          ...listing,
          attributes: {
            part_fitment_scope: "specific",
            [PART_FITMENT_MODEL_IDS_KEY]: ["model-1"],
          },
        }}
      />,
    );

    expect(screen.getByText("Selger oppgir 1 kompatibel bilmodell")).toBeTruthy();
  });

  it("viser Solgt-merke og Solgt som pris for nylig solgte annonser", () => {
    const sold = { ...listing, sold_at: "2026-10-01T12:00:00Z" };
    render(
      <>
        <ListingCard listing={sold} />
        <ListingCard listing={sold} compact />
        <ListingCardExpanded listing={sold} />
        <ListingCardImages listing={sold} />
      </>,
    );

    // Båndet og prisen: «Solgt» i DOM-en, store bokstaver bare via CSS.
    expect(screen.getAllByText("Solgt")).toHaveLength(8);
    expect(screen.queryByText("SOLGT")).toBeNull();
    expect(screen.queryByText("250 000 kr")).toBeNull();
  });
});

// Kjøretøy finnes ikke i kaupet_open.
it.skipIf(EDITION === "open")("utvidet kort viser manuelt oppgitte kjøretøyfakta", async () => {
  render(
    <ListingCardExpanded
      listing={{
        ...listing,
        category_slug: "bil",
        attributes: {
          fuel_type: "bensin",
          transmission: "manuell",
          power_hk: 99,
          seats: 5,
          color: "red",
        },
      }}
    />,
  );
  for (const value of ["Bensin", "Manuell", "99 hk", "5 seter", "Rød"]) {
    expect(await screen.findByText(value)).toBeTruthy();
  }
});

it.each([false, true])(
  "tilstandsovergang: reservasjon utløper på åpent kort (kompakt: %s)",
  async (compact) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const view = render(
      <ListingCard
        compact={compact}
        listing={{ ...listing, reserved_until: "2026-10-23T12:00:01Z" }}
      />,
    );
    expect(screen.getByText("Reservert")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.queryByText("Reservert")).toBeNull();
    // En forlengelse starter en ny frist, og solgt overstyrer reservasjonen.
    view.rerender(
      <ListingCard
        compact={compact}
        listing={{ ...listing, reserved_until: "2026-10-23T12:00:03Z" }}
      />,
    );
    expect(screen.getByText("Reservert")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.queryByText("Reservert")).toBeNull();
    view.rerender(
      <ListingCard
        compact={compact}
        listing={{
          ...listing,
          sold_at: "2026-10-23T12:00:02Z",
          reserved_until: "2026-10-23T13:00:00Z",
        }}
      />,
    );
    expect(screen.queryByText("Reservert")).toBeNull();
  },
);
