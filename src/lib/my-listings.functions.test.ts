import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: {} as unknown, getClient: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({ server: (fn: unknown) => ({ client: () => fn }) }),
  createServerFn: () => {
    let handler: () => unknown;
    const fn = () => handler();
    return Object.assign(fn, {
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
  },
}));
vi.mock("@/integrations/supabase/session.server", () => ({
  getSupabaseServerClient: state.getClient,
}));

import { getMyListingRows } from "./my-listings.functions";

const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("annonser på Min side", () => {
  it("returnerer tom liste uten bruker og gjør ingen annonseoppslag", async () => {
    const from = vi.fn();
    state.getClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from,
    });

    await expect(getMyListingRows()).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("beholder kun brukerens spørring og legger sammen sortert forsidebilde, statistikk og kategori", async () => {
    const row = {
      id: "listing-id",
      kaupet_code: "AB1234",
      title: "Sykkel",
      description: "God stand",
      category_id: "category-id",
      status: "active",
      price_nok: 7500,
      is_free: false,
      attributes: { color: "blå" },
      city: "Bergen",
      created_at: "2026-10-01T00:00:00Z",
      expires_at: null,
      listing_images: [
        { storage_path: "bilder/andre.jpg", sort_order: 2 },
        { storage_path: "bilder/forside.jpg", sort_order: 0 },
      ],
      categories: [{ slug: "sykkel" }],
    };
    const eq = vi.fn().mockReturnValue({
      order: async () => ({ data: [row], error: null }),
    });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ listing_id: row.id, view_count: "12", favorite_count: null }],
      error: null,
    });
    state.getClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
      from,
      rpc,
    });

    await expect(getMyListingRows()).resolves.toEqual([
      {
        id: row.id,
        kaupet_code: row.kaupet_code,
        title: row.title,
        status: row.status,
        price_nok: row.price_nok,
        is_free: false,
        city: row.city,
        category_id: row.category_id,
        category_slug: "sykkel",
        attributes: row.attributes,
        description: row.description,
        view_count: 12,
        favorite_count: 0,
        created_at: row.created_at,
        expires_at: null,
        cover_path: "bilder/forside.jpg",
      },
    ]);
    expect(eq).toHaveBeenCalledWith("seller_id", userId);
    expect(rpc).toHaveBeenCalledWith("my_listing_counts");
  });

  it("viser annonser selv om en statistikkrad mangler og bevarer tomt resultat", async () => {
    const eq = vi.fn().mockReturnValue({ order: async () => ({ data: [], error: null }) });
    state.getClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
      from: () => ({ select: () => ({ eq }) }),
      rpc: async () => ({ data: null, error: null }),
    });
    await expect(getMyListingRows()).resolves.toEqual([]);
  });

  it("avviser når annonse- eller statistikklesingen feiler", async () => {
    state.getClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({ order: async () => ({ data: null, error: new Error("lesefeil") }) }),
        }),
      }),
      rpc: vi.fn(),
    });
    await expect(getMyListingRows()).rejects.toThrow();

    state.getClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
      }),
      rpc: async () => ({ data: null, error: new Error("statistikkfeil") }),
    });
    await expect(getMyListingRows()).rejects.toThrow();
  });
});
