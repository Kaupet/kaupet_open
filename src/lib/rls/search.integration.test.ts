// kaupet_open: bare kjernecasene; private produktgrener eksporteres ikke.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createRlsUser,
  grantAdmin,
  createTestCategory,
  signInWithRetry,
  registerCategoryCleanup,
} from "../rls-test-helpers";
describe.skipIf(!canRun)("Search RPC: filters and paginates in the database", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const listingIds: string[] = [];
  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `rls-search-page-${suffix}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userIds.push(user.user!.id);
    categoryId = await createTestCategory(admin, `search-page-${suffix}`);
    const { data, error } = await admin
      .from("listings")
      .insert([
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Volvo rimelig testbil",
          is_free: false,
          price_nok: 100000,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          lat: 59.91,
          lng: 10.75,
          attributes: { horsepower: 120 },
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Volvo kraftig testbil",
          is_free: false,
          price_nok: 200000,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          lat: 59.92,
          lng: 10.76,
          attributes: { horsepower: 220 },
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Toyota utenfor søket",
          is_free: false,
          price_nok: 50000,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          lat: 59.91,
          lng: 10.75,
          attributes: { horsepower: 90 },
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Testsykkel 26 tommer",
          price_nok: 1500,
          is_free: false,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Fin terrengsykkel til salgs",
          price_nok: 2500,
          is_free: false,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Erfaren sykepleier søker hybel",
          price_nok: 0,
          is_free: true,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          attributes: {},
        },
      ])
      .select("id");
    if (error) throw error;
    listingIds.push(...data.map((listing) => listing.id));
  });
  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await admin.from("categories").delete().eq("id", categoryId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });
  it("returns bounded pages with the total count after text, category and radius filtering", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const args = {
      _include_groups: [{ mode: "all", terms: ["Volvo"] }],
      _category_ids: [categoryId],
      _conditions: ["good" as const],
      _include_free: false,
      _attribute_filters: {},
      _center_lat: 59.91,
      _center_lng: 10.75,
      _radius_km: 10,
      _sort: "price_asc",
      _limit: 1,
    };
    const first = await anon.rpc("search_listings_page", { ...args, _offset: 0 });
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);
    expect(first.data?.[0]?.price_nok).toBe(100000);
    expect(first.data?.[0]?.total_count).toBe(2);
    const second = await anon.rpc("search_listings_page", { ...args, _offset: 1 });
    expect(second.error).toBeNull();
    expect(second.data).toHaveLength(1);
    expect(second.data?.[0]?.price_nok).toBe(200000);
  });
  it("finner sammensatte ord der søkeordet er siste ledd i tittelen (F1)", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _include_groups: [{ mode: "any", terms: ["sykkel"] }],
      _category_ids: [categoryId],
      _sort: "new",
    });
    expect(error).toBeNull();
    const titles = data?.map((listing: { title: string }) => listing.title).sort();
    expect(titles).toEqual(["Fin terrengsykkel til salgs", "Testsykkel 26 tommer"]);
    expect(titles).not.toContain("Erfaren sykepleier søker hybel");
  });
  it("applies numeric JSON attribute ranges before pagination", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _include_groups: [{ mode: "all", terms: ["Volvo"] }],
      _category_ids: [categoryId],
      _attribute_filters: { horsepower: { kind: "range", min: 200 } },
      _sort: "new",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.price_nok).toBe(200000);
  });
});
describe.skipIf(!canRun)("Search RPC: radiusgrensen etter bounding box-forfilteret", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const listingIds: string[] = [];
  const CENTER_LAT = 59.91;
  const CENTER_LNG = 10.75;
  const KM_PER_DEGREE_LAT = 111.1949;
  const latAtDistance = (km: number) => CENTER_LAT + km / KM_PER_DEGREE_LAT;
  beforeAll(async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `rls-search-radius-${suffix}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    userIds.push(user.user!.id);
    categoryId = await createTestCategory(admin, `search-radius-${suffix}`);
    const { data, error } = await admin
      .from("listings")
      .insert([
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Radiustest innenfor",
          is_free: false,
          price_nok: 1000,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          lat: latAtDistance(9.5),
          lng: CENTER_LNG,
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Radiustest utenfor",
          is_free: false,
          price_nok: 2000,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          lat: latAtDistance(10.5),
          lng: CENTER_LNG,
          attributes: {},
        },
        {
          seller_id: user.user!.id,
          category_id: categoryId,
          title: "Radiustest naer sentrum",
          is_free: false,
          price_nok: 3000,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          condition: "good",
          lat: latAtDistance(0.8),
          lng: CENTER_LNG,
          attributes: {},
        },
      ])
      .select("id");
    if (error) throw error;
    listingIds.push(...data.map((listing) => listing.id));
  });
  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await admin.from("categories").delete().eq("id", categoryId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });
  const titlesWithinRadius = async (radiusKm: number) => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _category_ids: [categoryId],
      _center_lat: CENTER_LAT,
      _center_lng: CENTER_LNG,
      _radius_km: radiusKm,
      _sort: "new",
    });
    expect(error).toBeNull();
    return (data ?? []).map((listing: { title: string }) => listing.title).sort();
  };
  it("beholder en annonse rett innenfor radiusen, og utelater en rett utenfor", async () => {
    expect(await titlesWithinRadius(10)).toEqual([
      "Radiustest innenfor",
      "Radiustest naer sentrum",
    ]);
  });
  it("klamper radiusen likt i boksen og i sirkelen", async () => {
    expect(await titlesWithinRadius(0.5)).toEqual(["Radiustest naer sentrum"]);
  });
});
// Tilgangskontrakten for search_listings_page gjelder begge utgaver: hvilke
// annonser som er synlige, og at kun visningspunktet (aldri lat/lng) returneres.
// Delene merket «Open» tester den enklere rangeringen og tekstmatchingen i
// basismigrasjonens søkefunksjoner.
describe.skipIf(!canRun)("Search RPC: synlighet, posisjonsdata og stabil paginering", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  let sellerId: string;
  const listingIds: string[] = [];
  const word = `vistest${suffix}`;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  type Row = {
    id: string;
    title: string;
    price_nok: number | null;
    total_count: number;
    relevance: number;
    display_lat: number | null;
    display_lng: number | null;
    sold_at: string | null;
  } & Record<string, unknown>;

  async function insertListing(fields: Record<string, unknown>) {
    const { data, error } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        category_id: categoryId,
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        is_free: false,
        price_nok: 1_000,
        status: "active",
        condition: "good",
        attributes: {},
        ...fields,
      })
      .select("id")
      .single();
    if (error) throw error;
    listingIds.push(data.id);
    return data.id as string;
  }

  async function search(args: Record<string, unknown>, client = createClient(URL!, ANON_KEY!)) {
    const { data, error } = await client.rpc("search_listings_page", {
      _category_ids: [categoryId],
      ...args,
    } as never);
    expect(error).toBeNull();
    return (data ?? []) as Row[];
  }
  const titles = (rows: Row[]) => rows.map((row) => row.title).sort();

  beforeAll(async () => {
    sellerId = await createRlsUser(admin, `rls-search-visibility-${suffix}@example.com`, userIds);
    categoryId = await createTestCategory(admin, `search-visibility-${suffix}`);
    await insertListing({ title: `${word} aktiv`, lat: 59.91, lng: 10.75 });
    for (const status of ["draft", "archived", "expired", "disabled"]) {
      await insertListing({ title: `${word} ${status}`, status });
    }
    await insertListing({ title: `${word} solgt nylig`, status: "sold", sold_at: daysAgo(1) });
    await insertListing({
      title: `${word} solgt for lenge siden`,
      status: "sold",
      sold_at: daysAgo(5),
    });
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("returnerer bare aktive annonser, og nylig solgte (to dager) bare på forespørsel", async () => {
    const terms = { _include_groups: [{ mode: "all", terms: [word] }] };
    expect(titles(await search(terms))).toEqual([`${word} aktiv`]);
    expect(titles(await search({ ...terms, _include_recently_sold: true }))).toEqual([
      `${word} aktiv`,
      `${word} solgt nylig`,
    ]);
  });

  it("viser heller ikke eierens egne utkast og skjulte annonser i søket", async () => {
    const owner = await signInWithRetry(`rls-search-visibility-${suffix}@example.com`);
    const rows = await search({ _include_groups: [{ mode: "all", terms: [word] }] }, owner);
    expect(titles(rows)).toEqual([`${word} aktiv`]);
  });

  it("viser ikke annonsene til en utestengt selger", async () => {
    const terms = { _include_groups: [{ mode: "all", terms: [word] }] };
    const bannedId = await createRlsUser(admin, `rls-search-banned-${suffix}@example.com`, userIds);
    const adminEmail = `rls-search-admin-${suffix}@example.com`;
    await grantAdmin(admin, await createRlsUser(admin, adminEmail, userIds));
    await insertListing({ seller_id: bannedId, title: `${word} utestengt selger` });
    expect(titles(await search(terms))).toContain(`${word} utestengt selger`);

    const adminClient = await signInWithRetry(adminEmail);
    const { error } = await adminClient.rpc("admin_ban_user", {
      _user_id: bannedId,
      _reason: "Søketest",
    });
    expect(error).toBeNull();
    expect(titles(await search(terms))).toEqual([`${word} aktiv`]);
  });

  it("returnerer bare det avrundede visningspunktet, ikke de nøyaktige koordinatene", async () => {
    const rows = await search({ _include_groups: [{ mode: "all", terms: [word] }] });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!)).not.toContain("lat");
    expect(Object.keys(rows[0]!)).not.toContain("lng");
    expect(rows[0]!.display_lat).not.toBeNull();
    expect(rows[0]!.display_lat).not.toBe(59.91);
    expect(Math.abs(rows[0]!.display_lat! - 59.91)).toBeLessThan(0.01);

    const anon = createClient(URL!, ANON_KEY!);
    const { error } = await anon.from("listings").select("lat, lng").eq("id", listingIds[0]!);
    expect(error).not.toBeNull();
  });

  it("gir tom liste for et søk uten treff", async () => {
    expect(await search({ _include_groups: [{ mode: "all", terms: ["qzxwvk"] }] })).toEqual([]);
  });

  describe("paginering med like sorteringsverdier", () => {
    const pageWord = `sidetest${suffix}`;
    const sameTime = new Date(Date.now() - 3_600_000).toISOString();
    // Egen kategori: den andre utgavens likhetsmatching kan ellers dra inn
    // annonsene fra de andre testene (felles sifre i tidsstempelet).
    let pageCategoryId: string;

    beforeAll(async () => {
      pageCategoryId = await createTestCategory(admin, `search-pagination-${suffix}`);
      for (let index = 0; index < 7; index += 1) {
        await insertListing({
          category_id: pageCategoryId,
          title: `${pageWord} nr ${index}`,
          price_nok: 500,
          created_at: sameTime,
        });
      }
    });

    for (const sort of ["new", "price_asc", "price_desc", "relevance"]) {
      it(`gir hver annonse nøyaktig én gang på tvers av sider (${sort})`, async () => {
        const seen: string[] = [];
        for (let offset = 0; offset < 8; offset += 3) {
          const rows = await search({
            _category_ids: [pageCategoryId],
            _include_groups: [{ mode: "all", terms: [pageWord] }],
            _sort: sort,
            _limit: 3,
            _offset: offset,
          });
          if (offset < 7) expect(rows[0]?.total_count).toBe(7);
          seen.push(...rows.map((row) => row.id));
        }
        expect(seen).toHaveLength(7);
        expect(new Set(seen).size).toBe(7);
        // Alt er likt unntatt id, så rekkefølgen er id stigende.
        expect(seen).toEqual([...seen].sort());
        const again = await search({
          _category_ids: [pageCategoryId],
          _include_groups: [{ mode: "all", terms: [pageWord] }],
          _sort: sort,
          _limit: 100,
        });
        expect(again.map((row) => row.id)).toEqual(seen);
      });
    }

    it("begrenser antall rader til 1-100 og behandler ukjent sortering som «new»", async () => {
      const terms = {
        _category_ids: [pageCategoryId],
        _include_groups: [{ mode: "all", terms: [pageWord] }],
      };
      expect(await search({ ...terms, _limit: 0 })).toHaveLength(1);
      expect(await search({ ...terms, _limit: 3, _offset: -5 })).toHaveLength(3);
      const unknown = await search({ ...terms, _sort: "finnes-ikke" });
      const sorted = await search({ ...terms, _sort: "new" });
      expect(unknown.map((row) => row.id)).toEqual(sorted.map((row) => row.id));
    });
  });
});

// Filterkombinasjoner mot den samme kontrakten i begge utgaver.
describe.skipIf(!canRun)("Search RPC: kombinerte filtre og utelukking", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const listingIds: string[] = [];
  const base = `kombitest${suffix}`;

  async function search(args: Record<string, unknown>) {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _category_ids: [categoryId],
      ...args,
    } as never);
    expect(error).toBeNull();
    return ((data ?? []) as { title: string; total_count: number }[])
      .map((row) => row.title)
      .sort();
  }

  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, `rls-search-combo-${suffix}@example.com`, userIds);
    categoryId = await createTestCategory(admin, `search-combo-${suffix}`);
    const rows = [
      {
        title: `${base} rød sykkel`,
        price_nok: 1_000,
        condition: "good",
        attributes: { farge: "rod" },
      },
      {
        title: `${base} blå sykkel`,
        price_nok: 3_000,
        condition: "new",
        attributes: { farge: "bla" },
      },
      {
        title: `${base} rød lampe`,
        price_nok: 200,
        condition: "good",
        attributes: { farge: "rod" },
      },
      {
        title: `${base} gratis stol`,
        price_nok: 0,
        is_free: true,
        condition: "acceptable",
        attributes: {},
      },
    ];
    const { data, error } = await admin
      .from("listings")
      .insert(
        rows.map((row) => ({
          seller_id: sellerId,
          category_id: categoryId,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          is_free: false,
          status: "active",
          ...row,
        })),
      )
      .select("id");
    if (error) throw error;
    listingIds.push(...data.map((listing) => listing.id));
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  const all = { mode: "all", terms: [base] };

  it("kombinerer ord, pris, tilstand og attributter", async () => {
    expect(
      await search({
        _include_groups: [all, { mode: "any", terms: ["sykkel", "lampe"] }],
        _min_price: 500,
        _max_price: 2_000,
        _conditions: ["good"],
        _attribute_filters: { farge: { kind: "select", value: "rod" } },
      }),
    ).toEqual([`${base} rød sykkel`]);
  });

  it("tar med gratisannonser uavhengig av prisgrensene, med mindre de er avslått", async () => {
    const priced = { _include_groups: [all], _min_price: 500, _max_price: 2_000 };
    expect(await search(priced)).toEqual([`${base} gratis stol`, `${base} rød sykkel`]);
    expect(await search({ ...priced, _include_free: false })).toEqual([`${base} rød sykkel`]);
  });

  it("«alle ord» krever alle ordene, «minst ett» holder med ett", async () => {
    expect(
      await search({ _include_groups: [{ mode: "all", terms: [base, "sykkel", "rød"] }] }),
    ).toEqual([`${base} rød sykkel`]);
    expect(await search({ _include_groups: [{ mode: "any", terms: ["lampe", "stol"] }] })).toEqual([
      `${base} gratis stol`,
      `${base} rød lampe`,
    ]);
  });

  it("utelukker annonser med ett av ordene, eller med hele gruppen", async () => {
    expect(
      await search({ _include_groups: [all], _exclude_any_terms: ["sykkel", "lampe"] }),
    ).toEqual([`${base} gratis stol`]);
    // Gruppen ["rød", "sykkel"] skjuler bare annonsen som har begge ordene.
    expect(
      await search({ _include_groups: [all], _exclude_all_groups: [["rød", "sykkel"]] }),
    ).toEqual([`${base} blå sykkel`, `${base} gratis stol`, `${base} rød lampe`]);
  });

  it("bruker ikke geografisk filter når bare det ene koordinatet er satt", async () => {
    const withoutGeo = await search({ _include_groups: [all] });
    expect(await search({ _include_groups: [all], _center_lat: 59.91 })).toEqual(withoutGeo);
    expect(await search({ _include_groups: [all], _center_lng: 10.75 })).toEqual(withoutGeo);
  });
});

// Open bruker en enklere tekstmatching enn den andre utgaven: fulltekst på norsk eller
// delstreng i tittelen, uten likhetsterskler. Forventningene under er derfor
// bare for Open; den andre utgavens atferd dekkes av listing-search-semantics.
describe.skipIf(!canRun)("Open search: enklere tekstsøk og rangering", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let categoryId: string;
  const listingIds: string[] = [];
  const key = `opentest${suffix}`;

  async function search(args: Record<string, unknown>) {
    const anon = createClient(URL!, ANON_KEY!);
    const { data, error } = await anon.rpc("search_listings_page", {
      _category_ids: [categoryId],
      ...args,
    } as never);
    expect(error).toBeNull();
    return (data ?? []) as { id: string; title: string; relevance: number }[];
  }
  const titles = (rows: { title: string }[]) => rows.map((row) => row.title).sort();
  const include = (...terms: string[]) => [{ mode: "all", terms }];

  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, `rls-open-search-${suffix}@example.com`, userIds);
    categoryId = await createTestCategory(admin, `open-search-${suffix}`);
    const description = "Gyldig syntetisk beskrivelse for integrasjonstest.";
    const { data, error } = await admin
      .from("listings")
      .insert(
        [
          { title: `${key} terrengsykkel`, description },
          { title: `${key} rabatt 100% ekte`, description },
          { title: `${key} rabatt 100 prosent`, description },
          { title: `${key} snake_case ting`, description },
          { title: `${key} snakeXcase ting`, description },
          { title: `Telefon til salgs ${key}`, description },
          { title: `${key} dyrebil`, description: `${description} Bilen er en gammel gradvogn.` },
          { title: `${key} gradvogn`, description },
        ].map((row) => ({
          seller_id: sellerId,
          category_id: categoryId,
          is_free: false,
          price_nok: 1_000,
          status: "active",
          condition: "good",
          attributes: {},
          ...row,
        })),
      )
      .select("id");
    if (error) throw error;
    listingIds.push(...data.map((listing) => listing.id));
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("finner delstrenger inne i sammensatte ord", async () => {
    expect(titles(await search({ _include_groups: include("rengsyk") }))).toEqual([
      `${key} terrengsykkel`,
    ]);
  });

  it("gjør ikke uklar (likhets)matching: skrivefeil og nesten-treff gir ingen treff", async () => {
    expect(await search({ _include_groups: include("terrengsykel") })).toEqual([]);
    expect(await search({ _include_groups: include("hodetelefon") })).toEqual([]);
  });

  it("behandler % og _ i søkeord som vanlige tegn, ikke som jokertegn", async () => {
    // «%» og «_» gir ingen fulltekst-leksemer, så bare delstrengen i tittelen
    // kan treffe, og da som bokstavelig tegn (ikke «alt» eller «ett tegn»).
    expect(titles(await search({ _include_groups: include("%") }))).toEqual([
      `${key} rabatt 100% ekte`,
    ]);
    expect(titles(await search({ _include_groups: include("_") }))).toEqual([
      `${key} snake_case ting`,
    ]);
  });

  it("ignorerer blanke ord og tomme grupper, og avviser aldri hele søket", async () => {
    const everything = await search({ _include_groups: include(key) });
    expect(everything).toHaveLength(8);
    expect(
      await search({
        _include_groups: [
          ...include(key),
          { mode: "any", terms: ["  ", ""] },
          { mode: "all", terms: [] },
        ],
      }),
    ).toHaveLength(8);
    expect(
      await search({ _include_groups: include(key), _exclude_any_terms: ["", "  "] }),
    ).toHaveLength(8);
    expect(
      await search({ _include_groups: include(key), _exclude_all_groups: [[], [" "]] }),
    ).toHaveLength(8);
  });

  describe("grense på antall søkeord (maks 20, inkludering og ekskludering samlet)", () => {
    const words = (n: number, prefix = "ord") =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`);
    const call = (args: Record<string, unknown>) =>
      createClient(URL!, ANON_KEY!).rpc("search_listings_page", {
        _category_ids: [categoryId],
        ...args,
      } as never);

    it("avvises for anon med kode 22023 ved 21 ord", async () => {
      const { error } = await call({ _include_groups: include(...words(21)) });
      expect(error?.code).toBe("22023");
    });

    it("fungerer med nøyaktig 20 ord", async () => {
      const { data, error } = await call({
        _include_groups: [{ mode: "any", terms: [key, ...words(19)] }],
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(8);
    });

    it("teller ikke blanke ord", async () => {
      const { data, error } = await call({
        _include_groups: [{ mode: "any", terms: [key, ...words(19), "", "  "] }],
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(8);
    });

    it("teller ekskluderingsord med, også på tvers av grupper", async () => {
      const { error } = await call({
        _include_groups: [{ mode: "any", terms: [key, ...words(9)] }],
        _exclude_any_terms: words(6, "ut"),
        _exclude_all_groups: [words(3, "gr"), words(3, "hp")],
      });
      expect(error?.code).toBe("22023");
      const ok = await call({
        _include_groups: [{ mode: "any", terms: [key, ...words(9)] }],
        _exclude_any_terms: words(6, "ut"),
        _exclude_all_groups: [words(2, "gr"), words(2, "hp")],
      });
      expect(ok.error).toBeNull();
    });
  });

  it("rangerer treff i tittelen foran treff bare i beskrivelsen ved sortering på relevans", async () => {
    const rows = await search({ _include_groups: include("gradvogn"), _sort: "relevance" });
    expect(rows.map((row) => row.title)).toEqual([`${key} gradvogn`, `${key} dyrebil`]);
    expect(rows[0]!.relevance).toBeGreaterThan(rows[1]!.relevance);
  });

  it("gir relevans 0 uten søkeord, og sorterer da på nyeste først", async () => {
    const rows = await search({ _sort: "relevance" });
    expect(rows.every((row) => row.relevance === 0)).toBe(true);
    expect(rows.length).toBe(8);
  });
});

registerCategoryCleanup();
