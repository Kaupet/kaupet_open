import { describe, expect, it } from "vitest";

import {
  toListingCardData,
  toPopularListingCardData,
  type PopularListingRow,
} from "./listing-card-data";

describe("toPopularListingCardData", () => {
  it("konverterer RPC-tall og bevarer attributtene", () => {
    const row = {
      listing_id: "listing-1",
      kaupet_code: "ABC123",
      title: "Volvo",
      subtitle: null,
      price_nok: 100,
      is_free: false,
      city: "Oslo",
      created_at: "2026-01-01T00:00:00Z",
      cover_path: null,
      total_views: null,
      views_last_week: "7",
      category_slug: "car",
      attributes: { fuel: "diesel" },
    } as unknown as PopularListingRow;

    expect(toPopularListingCardData(row)).toMatchObject({
      total_views: 0,
      views_last_week: 7,
      attributes: { fuel: "diesel" },
    });
  });
});

// Bruksmålet (Verticals.cardUsageKeys) leses fra attributtene på kortet, så
// adapterne sender dem uendret videre.
it("kortadapterne sender attributtene uendret videre", () => {
  const attributes = { distance: 123, hours: "12" };
  const raw = {
    id: "listing",
    kaupet_code: "ABC",
    title: "Ting",
    subtitle: null,
    price_nok: 10,
    is_free: false,
    city: null,
    created_at: "",
    listing_images: [],
    attributes,
    categories: null,
  };
  expect(toListingCardData(raw).attributes).toBe(attributes);
  expect(
    toPopularListingCardData({
      ...raw,
      listing_id: "listing",
      category_slug: null,
      total_views: 0,
      views_last_week: 0,
      cover_path: null,
    } as unknown as PopularListingRow).attributes,
  ).toBe(attributes);
});
