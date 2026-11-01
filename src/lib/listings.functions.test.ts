// kaupet_open: generiske kontrakter; private produktcaser er utelatt.
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  membership: null as Record<string, unknown> | null,
  location: null as Record<string, unknown> | null,
  listing: null as Record<string, unknown> | null,
  rpc: vi.fn(),
  updates: vi.fn(),
  updateResult: undefined as Record<string, unknown> | null | undefined,
  inserts: [] as Array<{
    table: string;
    value: unknown;
  }>,
  tableErrors: {} as Record<string, unknown>,
  tableData: {} as Record<string, unknown[]>,
  userClient: null as unknown,
}));
const assertUserNotRateLimited = vi.hoisted(() => vi.fn());
const requireAdminRole = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler:
      | ((input: {
          data: unknown;
          context: {
            userId: string;
            supabase: unknown;
          };
        }) => unknown)
      | undefined;
    const fn = (
      input: {
        data?: unknown;
      } = {},
    ) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({
        data: validator(input.data),
        context: { userId: "user-id", supabase: db.userClient },
      });
    };
    Object.assign(fn, {
      middleware: () => fn,
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited }));
vi.mock("@/lib/admin-auth.server", () => ({ requireAdminRole }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let inserted: unknown;
      let updating = false;
      let from = 0;
      const result = () => {
        if (db.tableErrors[table]) return { data: null, error: db.tableErrors[table] };
        if (db.tableData[table])
          return { data: db.tableData[table].slice(from, from + 1000), error: null };
        if (updating && db.updateResult !== undefined)
          return { data: db.updateResult, error: null };
        if (table === "listings" && db.listing) return { data: db.listing, error: null };
        if (table === "listings" && inserted) {
          db.inserts.push({ table, value: inserted });
          return {
            data: { id: "listing-id", kaupet_code: "KPT123", updated_at: "2026-01-01T00:00:00Z" },
            error: null,
          };
        }
        return { data: [], count: 0, error: null };
      };
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "in", "order"]) {
        query[method] = () => query;
      }
      query.range = (start: number) => {
        from = start;
        return query;
      };
      query.update = (value: unknown) => {
        updating = true;
        db.updates(value);
        return query;
      };
      query.insert = (value: unknown) => {
        inserted = value;
        return query;
      };
      query.maybeSingle = async () => result();
      query.single = async () => result();
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject);
      return query;
    },
    rpc: db.rpc,
  },
}));
vi.mock("@/lib/turnstile.server", () => ({ verifyTurnstileToken: vi.fn() }));
import {
  adminReplaceListingCategory,
  createListing,
  getListingKaupetCodeById,
  republishListing,
  saveDraftListing,
  syncDraftListingImages,
  updateListingAttributes,
  updateListingStatus,
} from "./listings.functions";
const categoryId = "00000000-0000-0000-0000-000000000013";
const listingInput = {
  title: "Gyldig annonsetittel",
  description: "Dette er en gyldig annonsebeskrivelse.",
  category_id: categoryId,
  condition: "good" as const,
  is_free: true,
  price_nok: null,
  postal_code: "0123",
  city: "Oslo",
  lat: 59.9,
  lng: 10.7,
  can_ship: false,
};
beforeEach(() => {
  db.membership = null;
  db.updateResult = undefined;
  db.location = null;
  db.listing = null;
  db.rpc.mockReset();
  db.inserts = [];
  db.updates.mockReset();
  db.tableErrors = {};
  db.tableData = {};
  assertUserNotRateLimited.mockReset().mockResolvedValue(undefined);
  requireAdminRole.mockReset().mockResolvedValue(undefined);
});
describe("updateListingStatus", () => {
  it("avviser aktiv-status som klienten forsøker å sette direkte", () => {
    expect(() =>
      updateListingStatus({
        data: { id: "00000000-0000-0000-0000-000000000001", status: "active" },
      }),
    ).toThrow();
  });
});
describe("publisering etter tapt svar", () => {
  it("bekrefter en allerede publisert annonse uten å overskrive den", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    db.listing = {
      id,
      seller_id: "user-id",
      status: "active",
      kaupet_code: "ABC123",
      updated_at: "2026-10-09T10:00:00Z",
    };
    const saved = await saveDraftListing({ data: { id, title: "Et endret utkast" } });
    expect(saved).toMatchObject({ id, kaupet_code: "ABC123", published: true });
    const published = await createListing({
      data: { ...listingInput, draftId: id },
    });
    expect(published).toEqual({ id, kaupet_code: "ABC123", already_published: true });
    expect(db.updates).not.toHaveBeenCalled();
    expect(db.inserts).toHaveLength(0);
  });
  it("melder allerede publisert når en samtidig publisering vant mellom kontroll og oppdatering", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    db.listing = {
      id,
      seller_id: "user-id",
      status: "draft",
      kaupet_code: "ABC123",
      updated_at: "2026-10-09T10:00:00Z",
    };
    db.updateResult = null;
    db.updates.mockImplementationOnce(() => {
      db.listing = { ...db.listing, status: "active" };
    });
    const published = await createListing({
      data: { ...listingInput, draftId: id },
    });
    expect(published).toEqual({ id, kaupet_code: "ABC123", already_published: true });
  });
  it("avviser bekreftelse av en annen brukers aktive annonse", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    db.listing = {
      id,
      seller_id: "other-user",
      status: "active",
      kaupet_code: "ABC123",
    };
    await expect(saveDraftListing({ data: { id, title: "Et utkast" } })).rejects.toMatchObject({
      status: 403,
    });
    await expect(createListing({ data: { ...listingInput, draftId: id } })).rejects.toMatchObject({
      status: 403,
    });
    expect(db.updates).not.toHaveBeenCalled();
  });
});
describe("atomic draft publication (CRE-30..33)", () => {
  const draftId = "00000000-0000-4000-8000-000000000021";
  const image = {
    id: "00000000-0000-4000-8000-000000000022",
    storage_path: `${draftId}/00000000-0000-4000-8000-000000000022.jpg`,
    sort_order: 0,
    caption: "Sykkel 🚲",
  };
  beforeEach(() => {
    db.listing = {
      id: draftId,
      kaupet_code: "KPT123",
      seller_id: "user-id",
      status: "draft",
    };
    db.rpc.mockResolvedValue({
      data: { id: draftId, kaupet_code: "KPT123", already_published: false },
      error: null,
    });
  });
  it("publiserer et bilde via serverrollen uten direkte tabelloppdatering", async () => {
    const result = await createListing({ data: { ...listingInput, draftId, images: [image] } });
    expect(result).toEqual({ id: draftId, kaupet_code: "KPT123", already_published: false });
    expect(db.rpc).toHaveBeenCalledWith(
      "publish_listing_draft",
      expect.objectContaining({
        _listing_id: draftId,
        _user_id: "user-id",
        _images: [image],
        _fields: expect.objectContaining({ title: listingInput.title, status: "active" }),
      }),
    );
    expect(db.updates).not.toHaveBeenCalled();
  });
  it("videresender serverens bekreftelse ved konkurrerende publisering", async () => {
    db.rpc.mockResolvedValue({
      data: { id: draftId, kaupet_code: "KPT123", already_published: true },
      error: null,
    });
    await expect(
      createListing({ data: { ...listingInput, draftId, images: [] } }),
    ).resolves.toMatchObject({ already_published: true });
    expect(db.updates).not.toHaveBeenCalled();
  });
  it.each([101, 1000])("avviser %i bilder før databasekallet", async (count) => {
    await expect(
      Promise.resolve().then(() =>
        createListing({ data: { ...listingInput, draftId, images: Array(count).fill(image) } }),
      ),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each([
    null,
    "image",
    [{ ...image, caption: "x".repeat(141) }],
    [{ ...image, sort_order: -1 }],
    [{ ...image, storage_path: "invalid" }],
  ])("avviser ugyldig bildeliste: %j", async (images) => {
    expect(() => createListing({ data: { ...listingInput, draftId, images } })).toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("krever utkast-ID når bilder sendes", async () => {
    expect(() => createListing({ data: { ...listingInput, images: [image] } })).toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("RPC-feil bruker ingen utrygg fallback", async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Missing function" },
    });
    await expect(
      createListing({ data: { ...listingInput, draftId, images: [] } }),
    ).rejects.toThrow();
    expect(db.updates).not.toHaveBeenCalled();
  });
});
describe("publiseringskontroller (B8)", () => {
  const draft = {
    id: "00000000-0000-4000-8000-000000000031",
    seller_id: "user-id",
    status: "draft",
    kaupet_code: "ABC131",
    category_id: categoryId,
    title: "Gyldig annonsetittel",
    description: "Dette er en gyldig annonsebeskrivelse.",
    postal_code: "0123",
    city: "Oslo",
    is_free: true,
    price_nok: null,
    condition: "good",
    can_ship: false,
    attributes: {},
  };
  it.each(["category_filters", "categories", "category_flows"])(
    "publiserer ikke når %s ikke kan hentes",
    async (table) => {
      db.rpc.mockResolvedValue({ data: null, error: null });
      db.tableErrors = { [table]: { message: "timeout" } };
      await expect(createListing({ data: listingInput })).rejects.toThrow();
      expect(db.inserts).toEqual([]);
      expect(db.updates).not.toHaveBeenCalled();
    },
  );
  it("legacy-lenken finner en solgt annonse som fortsatt er offentlig", async () => {
    db.listing = { kaupet_code: "SOLGT1", status: "sold", sold_at: new Date().toISOString() };
    db.rpc.mockResolvedValue({ data: true, error: null });
    expect(await getListingKaupetCodeById({ data: { listing_id: draft.id } })).toEqual({
      kaupet_code: "SOLGT1",
    });
    expect(db.rpc).toHaveBeenCalledWith("listing_is_public", {
      _status: "sold",
      _sold_at: db.listing.sold_at,
    });
  });
  it("legacy-lenken skjuler en annonse som ikke lenger er offentlig", async () => {
    db.listing = { kaupet_code: "GAMMEL", status: "sold", sold_at: "2020-01-01T00:00:00Z" };
    db.rpc.mockResolvedValue({ data: false, error: null });
    expect(await getListingKaupetCodeById({ data: { listing_id: draft.id } })).toEqual({
      kaupet_code: null,
    });
  });
});
it("avviser et ikke-numerisk tallattributt før publisering", async () => {
  db.rpc.mockResolvedValue({ data: null, error: null });
  db.tableData = {
    category_filters: [
      {
        id: "f1",
        category_id: categoryId,
        key: "horsepower",
        label_nb: "Hestekrefter",
        type: "range",
        sort_order: 0,
      },
    ],
    categories: [{ id: categoryId, parent_id: null }],
    category_flows: [],
  };
  await expect(
    createListing({ data: { ...listingInput, attributes: { horsepower: "oops" } } }),
  ).rejects.toMatchObject({ status: 400, message: "Hestekrefter må være et tall." });
  expect(db.inserts).toEqual([]);
});
it("validerer også mot kategorifiltre etter PostgRESTs radgrense", async () => {
  db.rpc.mockResolvedValue({ data: null, error: null });
  const filler = Array.from({ length: 1000 }, (_, i) => ({
    id: `f${String(i).padStart(4, "0")}`,
    category_id: "00000000-0000-0000-0000-000000000099",
    key: `annet_${i}`,
    label_nb: `Annet ${i}`,
    type: "text",
    sort_order: i,
  }));
  db.tableData = {
    category_filters: [
      ...filler,
      {
        id: "f9999",
        category_id: categoryId,
        key: "horsepower",
        label_nb: "Hestekrefter",
        type: "range",
        sort_order: 0,
      },
    ],
    categories: [{ id: categoryId, parent_id: null }],
    category_flows: [],
  };
  await expect(
    createListing({ data: { ...listingInput, attributes: { horsepower: "oops" } } }),
  ).rejects.toMatchObject({ status: 400, message: "Hestekrefter må være et tall." });
  expect(db.inserts).toEqual([]);
});
it.each(["create", "republish"])(
  "%s normaliserer eldre tallstrenger før validering og lagring",
  async (operation) => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    db.tableData = {
      category_filters: [
        {
          id: "f1",
          category_id: categoryId,
          key: "width_cm",
          label_nb: "Bredde",
          type: "number",
          sort_order: 0,
        },
      ],
      categories: [{ id: categoryId, parent_id: null }],
      category_flows: [],
    };
    const attributes = { width_cm: "40", brand: "2020" };
    if (operation === "create") {
      await createListing({ data: { ...listingInput, attributes } });
      expect(db.inserts.find((row) => row.table === "listings")?.value).toMatchObject({
        attributes: { width_cm: 40, brand: "2020" },
      });
    } else {
      db.listing = {
        ...listingInput,
        id: categoryId,
        seller_id: "user-id",
        status: "draft",
        attributes,
      };
      await republishListing({ data: { id: categoryId } });
      expect(db.updates).toHaveBeenCalledWith(
        expect.objectContaining({ attributes: { width_cm: 40, brand: "2020" }, status: "active" }),
      );
    }
  },
);
describe("syncDraftListingImages", () => {
  const draftId = "00000000-0000-4000-8000-000000000031";
  const image = {
    id: "00000000-0000-4000-8000-000000000032",
    storage_path: `${draftId}/00000000-0000-4000-8000-000000000033.webp`,
    sort_order: 0,
    caption: null,
  };
  beforeEach(() => {
    db.rpc.mockReset().mockResolvedValue({ data: { already_published: false }, error: null });
  });
  it("knytter bildene til utkastet som innlogget bruker", async () => {
    await expect(syncDraftListingImages({ data: { draftId, images: [image] } })).resolves.toEqual({
      already_published: false,
    });
    expect(db.rpc).toHaveBeenCalledWith("sync_draft_listing_images", {
      _listing_id: draftId,
      _user_id: "user-id",
      _images: [image],
    });
  });
  it("avviser en annen aktør enn den innloggede", async () => {
    await expect(
      syncDraftListingImages({
        data: { expected_user_id: "00000000-0000-4000-8000-000000000034", draftId, images: [] },
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("avviser bildestier utenfor tillatt format", async () => {
    await expect(async () =>
      syncDraftListingImages({
        data: { draftId, images: [{ ...image, storage_path: "../annen/fil.webp" }] },
      }),
    ).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
describe("updateListingAttributes", () => {
  const listingId = "00000000-0000-0000-0000-000000000021";
  beforeEach(() => {
    db.listing = {
      id: listingId,
      seller_id: "user-id",
      status: "draft",
      kaupet_code: "KPT123",
      title: "Utkast",
      description: "",
      category_id: categoryId,
      attributes: { color: "red", lookup_snapshot: "{}" },
      condition: null,
      can_ship: null,
      is_free: false,
      price_nok: null,
      postal_code: null,
      city: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    db.tableData = {
      category_filters: [
        { id: "f1", category_id: categoryId, key: "seats", label_nb: "Seter", type: "number" },
        {
          id: "f2",
          category_id: categoryId,
          key: "next_eu_control",
          label_nb: "Neste EU-kontroll",
          type: "date",
        },
      ],
      categories: [{ id: categoryId, parent_id: null }],
    };
  });
  it.each([
    [{ seats: "mange" }, "Seter må være et tall."],
    [{ next_eu_control: "31.12.2027" }, "Neste EU-kontroll må være en gyldig dato."],
    [{ next_eu_control: "2027-02-30" }, "Neste EU-kontroll må være en gyldig dato."],
  ])("avviser ugyldig format %j ved redigering", async (attributes, message) => {
    await expect(
      updateListingAttributes({ data: { id: listingId, attributes } }),
    ).rejects.toMatchObject({ status: 400, message });
    expect(db.updates).not.toHaveBeenCalled();
  });
  it("fletter med lagrede attributter, fjerner tømte og normaliserer tall", async () => {
    await updateListingAttributes({
      data: {
        id: listingId,
        attributes: { seats: "7", next_eu_control: "2027-05-31" },
        removedKeys: ["color"],
      },
    });
    expect(db.updates).toHaveBeenCalledWith({
      attributes: { seats: 7, next_eu_control: "2027-05-31", lookup_snapshot: "{}" },
    });
  });
  it("erstatter attributtene ved kategoribytte", async () => {
    await updateListingAttributes({
      data: { id: listingId, attributes: {}, category_id: categoryId },
    });
    expect(db.updates).toHaveBeenCalledWith({ attributes: {}, category_id: categoryId });
  });

  it("avviser en fremmed eier før den skriver attributter", async () => {
    db.listing = { ...db.listing, seller_id: "annen-bruker" };
    await expect(
      updateListingAttributes({ data: { id: listingId, attributes: { seats: 7 } } }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.updates).not.toHaveBeenCalled();
  });

  it("lar ufullstendige utkast mangle kategorikrav", async () => {
    db.tableData.category_filters = [
      { id: "f1", category_id: categoryId, key: "seats", label_nb: "Seter", type: "number" },
    ];
    await expect(
      updateListingAttributes({ data: { id: listingId, attributes: {} } }),
    ).resolves.toBeUndefined();
    expect(db.updates).toHaveBeenCalled();
  });

  it("avviser kategoribytte som mangler obligatoriske felt på aktiv annonse", async () => {
    db.listing = {
      ...db.listing,
      status: "active",
      title: "Gyldig annonsetittel",
      description: "Dette er en gyldig annonsebeskrivelse.",
      condition: "good",
      can_ship: false,
      is_free: true,
      postal_code: "0123",
      city: "Oslo",
    };
    db.tableData.category_filters = [
      { id: "f1", category_id: categoryId, key: "seats", label_nb: "Seter", type: "number" },
    ];
    await expect(
      updateListingAttributes({ data: { id: listingId, category_id: categoryId, attributes: {} } }),
    ).rejects.toThrow("Fyll inn: Seter");
    expect(db.updates).not.toHaveBeenCalled();
  });

  it("blokkerer eier fra å endre moderator-deaktivert annonse", async () => {
    db.listing = { ...db.listing, status: "disabled" };
    await expect(
      updateListingAttributes({ data: { id: listingId, attributes: { seats: 7 } } }),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.updates).not.toHaveBeenCalled();
  });

  it("avviser lagring dersom annonsen endres etter valideringen", async () => {
    db.updateResult = null;
    await expect(
      updateListingAttributes({ data: { id: listingId, attributes: { seats: 7 } } }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("adminReplaceListingCategory", () => {
  const sourceCategory = "00000000-0000-0000-0000-000000000051";
  const targetCategory = "00000000-0000-0000-0000-000000000052";
  const listing = {
    id: "00000000-0000-0000-0000-000000000053",
    kaupet_code: "KPT123",
    seller_id: "seller-id",
    status: "active",
    title: "Gyldig annonsetittel",
    description: "Dette er en gyldig annonsebeskrivelse.",
    condition: "good",
    can_ship: false,
    postal_code: "0123",
    city: "Oslo",
    is_free: true,
    price_nok: null,
    category_id: sourceCategory,
    attributes: {},
    updated_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    db.tableData = {
      listings: [listing],
      category_filters: [],
      categories: [{ id: sourceCategory, parent_id: null }],
      category_flows: [],
    };
    db.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it("validerer annonsebatchen og ber RPC flytte den versjonslåst", async () => {
    await adminReplaceListingCategory({
      data: { category_id: sourceCategory, replacement_category_id: targetCategory },
    });
    expect(requireAdminRole).toHaveBeenCalledWith(null, "user-id");
    expect(db.rpc).toHaveBeenCalledWith("admin_replace_listing_category", {
      _category_id: sourceCategory,
      _replacement_category_id: targetCategory,
      _expected_rows: [
        {
          id: listing.id,
          status: "active",
          updated_at: listing.updated_at,
          attributes: {},
        },
      ],
    });
  });

  it("viser konflikt hvis annonseversjonen er endret", async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    await expect(
      adminReplaceListingCategory({
        data: { category_id: sourceCategory, replacement_category_id: targetCategory },
      }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("endret samtidig") });
  });

  it("stopper før annonseoppslag når brukeren mangler administratorrett", async () => {
    requireAdminRole.mockRejectedValueOnce(new Error("Ikke autorisert"));
    await expect(
      adminReplaceListingCategory({
        data: { category_id: sourceCategory, replacement_category_id: targetCategory },
      }),
    ).rejects.toThrow("Ikke autorisert");
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.tableData.listings).toHaveLength(1);
  });
});
