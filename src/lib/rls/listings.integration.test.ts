// kaupet_open: bare kjernecasene; private produktgrener eksporteres ikke.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createTestCategory,
  createRlsUser,
  signInWithRetry,
  registerCategoryCleanup,
} from "../rls-test-helpers";
describe.skipIf(!canRun)("RLS: listings — draft visibility and owner-only writes", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-listing-seller-${suffix}@example.com`,
    other: `rls-listing-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  const listingIds: string[] = [];
  let sellerId: string;
  let draftListingId: string;
  let activeListingId: string;
  let disabledListingId: string;
  async function signIn(email: string) {
    return signInWithRetry(email);
  }
  beforeAll(async () => {
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    sellerId = await mkUser(emails.seller);
    await mkUser(emails.other);
    const mkListing = async (status: "draft" | "active" | "disabled") => {
      const { data, error } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: `RLS ${status} listing`,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          price_nok: 100,
          status,
        })
        .select("id")
        .single();
      if (error) throw error;
      listingIds.push(data.id);
      return data.id;
    };
    draftListingId = await mkListing("draft");
    activeListingId = await mkListing("active");
    disabledListingId = await mkListing("disabled");
  });
  afterAll(async () => {
    if (!canRun) return;
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });
  it("lets the owner see their own draft and disabled listings", async () => {
    const seller = await signIn(emails.seller);
    const { data } = await seller
      .from("listings")
      .select("id")
      .in("id", [draftListingId, activeListingId, disabledListingId]);
    expect(new Set(data?.map((l) => l.id))).toEqual(
      new Set([draftListingId, activeListingId, disabledListingId]),
    );
  });
  it("hides drafts and shows only active listings to other users", async () => {
    const other = await signIn(emails.other);
    const { data } = await other
      .from("listings")
      .select("id")
      .in("id", [draftListingId, activeListingId, disabledListingId]);
    expect(data?.map((l) => l.id)).toEqual([activeListingId]);
  });
  it("hides drafts and disabled listings from anonymous visitors", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data } = await anon
      .from("listings")
      .select("id")
      .in("id", [draftListingId, activeListingId, disabledListingId]);
    expect(data?.map((l) => l.id)).toEqual([activeListingId]);
  });
  it("blocks a non-owner from updating someone else's listing", async () => {
    const other = await signIn(emails.other);
    const { error, count } = await other
      .from("listings")
      .update({ title: "Hijacked title" }, { count: "exact" })
      .eq("id", activeListingId);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
  it("blocks the owner from re-activating an admin-disabled listing", async () => {
    const seller = await signIn(emails.seller);
    const { error } = await seller
      .from("listings")
      .update({ status: "active" }, { count: "exact" })
      .eq("id", disabledListingId);
    expect(error).not.toBeNull();
    const { data: check } = await admin
      .from("listings")
      .select("status")
      .eq("id", disabledListingId)
      .single();
    expect(check?.status).toBe("disabled");
  });
});
describe.skipIf(!canRun)("RLS: presise annonsekoordinater skjules for uvedkommende", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-location-seller-${suffix}@example.com`,
    other: `rls-location-other-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let listingId: string;
  let categoryId: string;

  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, emails.seller, userIds);
    await createRlsUser(admin, emails.other, userIds);
    categoryId = await createTestCategory(admin, `location-${suffix}`);
    const { data, error } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        category_id: categoryId,
        title: "RLS precise location listing",
        description: "Gyldig beskrivelse for presis posisjonsgrense.",
        price_nok: 100,
        status: "sold",
        lat: 59.9139,
        lng: 10.7522,
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().eq("id", listingId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  beforeEach(async () => {
    if (!listingId) return;
    const { error } = await admin
      .from("listings")
      .update({ lat: 59.9139, lng: 10.7522 })
      .eq("id", listingId);
    if (error) throw error;
  });

  it.each([
    ["anon", "active"],
    ["other", "active"],
    ["anon", "sold"],
    ["other", "sold"],
  ] as const)("skjuler rå koordinater for %s på %s annonse", async (role, status) => {
    const { error: statusError } = await admin
      .from("listings")
      .update({ status })
      .eq("id", listingId);
    expect(statusError).toBeNull();
    const client =
      role === "anon" ? createClient(URL!, ANON_KEY!) : await signInWithRetry(emails.other);
    const visible = await client.from("listings").select("id,status").eq("id", listingId).single();
    expect(visible.data).toMatchObject({ id: listingId, status });

    const rawRead = await client.from("listings").select("lat,lng").eq("id", listingId);
    expect(rawRead.error).not.toBeNull();
  });

  it.each([
    ["anon", "active"],
    ["other", "active"],
    ["anon", "sold"],
    ["other", "sold"],
  ] as const)("hindrer %s i å filtrere på rå koordinater for %s annonse", async (role, status) => {
    const { error: statusError } = await admin
      .from("listings")
      .update({ status })
      .eq("id", listingId);
    expect(statusError).toBeNull();
    const client =
      role === "anon" ? createClient(URL!, ANON_KEY!) : await signInWithRetry(emails.other);
    const rawFilter = await client
      .from("listings")
      .select("id")
      .eq("id", listingId)
      .eq("lat", 59.9139)
      .eq("lng", 10.7522);
    expect(rawFilter.error).not.toBeNull();
  });

  it("lar bare eieren hente presise koordinater gjennom den autoriserte funksjonen", async () => {
    const seller = await signInWithRetry(emails.seller);
    const other = await signInWithRetry(emails.other);
    const { error, count } = await seller
      .from("listings")
      .update({ lat: 60.39299, lng: 5.32415 }, { count: "exact" })
      .eq("id", listingId);
    expect(error).toBeNull();
    expect(count).toBe(1);
    const { data, error: readError } = await seller.rpc("listing_precise_location", {
      _listing_id: listingId,
    });
    expect(readError).toBeNull();
    expect(data).toEqual([{ lat: 60.39299, lng: 5.32415 }]);

    const denied = await other.rpc("listing_precise_location", { _listing_id: listingId });
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);

    const anonymous = await createClient(URL!, ANON_KEY!).rpc("listing_precise_location", {
      _listing_id: listingId,
    });
    expect(anonymous.error).not.toBeNull();
  });

  it("viser stabil offentlig grid og radiusresultat ved grensen for koordinater i samme celle", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const { data: beforeRow, error: beforeError } = await admin
      .from("listings")
      .select("display_lat,display_lng")
      .eq("id", listingId)
      .single();
    expect(beforeError).toBeNull();

    const search = async () => {
      const { data, error } = await anon.rpc("search_listings_page", {
        _category_ids: [categoryId],
        _center_lat: beforeRow!.display_lat,
        // Just west of the cell: the display point is within the minimum 1 km radius, while
        // the precise point is outside. This catches raw-coordinate filtering.
        _center_lng: beforeRow!.display_lng - 0.0176,
        _radius_km: 1,
        _include_recently_sold: true,
      });
      expect(error).toBeNull();
      return data?.find((row: { id: string }) => row.id === listingId);
    };

    const beforeResult = await search();
    expect(beforeResult).toMatchObject({
      display_lat: beforeRow!.display_lat,
      display_lng: beforeRow!.display_lng,
    });

    const { error: updateError } = await admin
      .from("listings")
      .update({ lat: 59.9145, lng: 10.753 })
      .eq("id", listingId);
    expect(updateError).toBeNull();

    const { data: afterRow, error: afterError } = await admin
      .from("listings")
      .select("display_lat,display_lng")
      .eq("id", listingId)
      .single();
    expect(afterError).toBeNull();
    expect(afterRow).toEqual(beforeRow);
    expect(await search()).toEqual(beforeResult);
  });
});

describe.skipIf(!canRun)("RLS: direkte annonseendringer bevarer publiseringskrav", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const email = `rls-invalid-edit-${suffix}@example.com`;
  const userIds: string[] = [];
  let listingId: string;
  let categoryId: string;
  let incompatibleCategoryId: string;

  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, email, userIds);
    categoryId = await createTestCategory(admin, `valid-edit-${suffix}`);
    incompatibleCategoryId = await createTestCategory(admin, `incompatible-edit-${suffix}`);
    const { error: filterError } = await admin.from("category_filters").insert({
      category_id: incompatibleCategoryId,
      key: "audit_numeric_value",
      label_nb: "Audit tallverdi",
      type: "number",
    });
    if (filterError) throw filterError;
    const { data, error } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        category_id: categoryId,
        title: "Gyldig annonsetittel",
        description: "Beskrivelse som skal bevares.",
        price_nok: 100,
        status: "active",
        attributes: { audit_numeric_value: "ikke et tall" },
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = data.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().eq("id", listingId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  beforeEach(async () => {
    if (!listingId) return;
    const { error } = await admin
      .from("listings")
      .update({
        title: "Gyldig annonsetittel",
        description: "Beskrivelse som skal bevares.",
        price_nok: 100,
        category_id: categoryId,
        status: "active",
        attributes: { audit_numeric_value: "ikke et tall" },
      })
      .eq("id", listingId);
    if (error) throw error;
  });

  it.each([
    { label: "tom tittel", patch: { title: "" } },
    { label: "tittel med bare mellomrom", patch: { title: "     " } },
    { label: "tittel med tabulator og linjeskift", patch: { title: "\t\n\t\n\t" } },
    { label: "tittel med bare hardt mellomrom", patch: { title: "\u00a0".repeat(5) } },
    { label: "for kort tittel", patch: { title: "Kort" } },
    { label: "for lang tittel", patch: { title: "x".repeat(121) } },
    { label: "for kort beskrivelse", patch: { description: "For kort tekst" } },
    { label: "for lang beskrivelse", patch: { description: "x".repeat(4001) } },
    { label: "manglende beskrivelse", patch: { description: null } },
    { label: "for lang undertittel", patch: { subtitle: "x".repeat(81) } },
    { label: "for lang feilbeskrivelse", patch: { known_issues: "x".repeat(2001) } },
    { label: "for lang vedlikeholdshistorikk", patch: { maintenance_history: "x".repeat(2001) } },
    { label: "negativ pris", patch: { price_nok: -1 } },
    { label: "manglende pris på betalingsannonse", patch: { price_nok: null } },
    { label: "pris over øvre grense", patch: { price_nok: 10_000_001 } },
  ])("avviser direkte oppdatering med $label på aktiv annonse", async ({ patch }) => {
    const seller = await signInWithRetry(email);
    const { error } = await seller.from("listings").update(patch).eq("id", listingId);
    expect(error).not.toBeNull();

    const { data, error: readError } = await admin
      .from("listings")
      .select("title,description,price_nok")
      .eq("id", listingId)
      .single();
    expect(readError).toBeNull();
    expect(data).toMatchObject({
      title: "Gyldig annonsetittel",
      description: "Beskrivelse som skal bevares.",
      price_nok: 100,
    });
  });

  it("godtar eksakte tekst- og prisgrenser og gratispris null", async () => {
    const seller = await signInWithRetry(email);
    for (const patch of [
      { title: "vvvvv", description: "x".repeat(20), price_nok: 0 },
      { title: "x".repeat(120), description: "x".repeat(4000), price_nok: 10_000_000 },
      { is_free: true, price_nok: null },
    ]) {
      const { error } = await seller.from("listings").update(patch).eq("id", listingId);
      expect(error).toBeNull();
    }
  });

  it("lar utkast beholde ufullstendige verdier", async () => {
    const sellerId = userIds[0];
    const { data: draft, error: insertError } = await admin
      .from("listings")
      .insert({ seller_id: sellerId, title: "", description: "", price_nok: null, status: "draft" })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    const seller = await signInWithRetry(email);
    const { error } = await seller
      .from("listings")
      .update({ title: "", description: "" })
      .eq("id", draft!.id);
    expect(error).toBeNull();
    await admin.from("listings").delete().eq("id", draft!.id);
  });

  it("blokkerer direkte API-endringer av kategoriavhengige felt", async () => {
    const seller = await signInWithRetry(email);
    for (const patch of [
      { category_id: incompatibleCategoryId },
      { attributes: { forged: "verdi" } },
      { condition: null },
      { can_ship: null },
    ]) {
      const { error } = await seller.from("listings").update(patch).eq("id", listingId);
      expect(error?.code).toBe("42501");
    }
    const { data } = await admin
      .from("listings")
      .select("category_id,attributes")
      .eq("id", listingId)
      .single();
    expect(data).toMatchObject({
      category_id: categoryId,
      attributes: { audit_numeric_value: "ikke et tall" },
    });
  });

  it("avviser kategoribytte som gjør et eksisterende attributt ugyldig", async () => {
    const seller = await signInWithRetry(email);
    const { error } = await seller
      .from("listings")
      .update({ category_id: incompatibleCategoryId })
      .eq("id", listingId);
    expect(error).not.toBeNull();
    const { data, error: readError } = await admin
      .from("listings")
      .select("category_id,attributes")
      .eq("id", listingId)
      .single();
    expect(readError).toBeNull();
    expect(data).toMatchObject({
      category_id: categoryId,
      attributes: { audit_numeric_value: "ikke et tall" },
    });
  });
});

describe.skipIf(!canRun)(
  "RLS: owner can delete their own active, categorized listing (regression for 20260622120000/20260624120000 stats triggers)",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = { seller: `rls-listing-delete-seller-${suffix}@example.com` };
    const userIds: string[] = [];
    let sellerId: string;
    let listingId: string;
    let categoryId: string;
    async function signIn(email: string) {
      return signInWithRetry(email);
    }
    beforeAll(async () => {
      const { data: userData, error: userErr } = await admin.auth.admin.createUser({
        email: emails.seller,
        password: PASSWORD,
        email_confirm: true,
      });
      if (userErr) throw userErr;
      sellerId = userData.user!.id;
      userIds.push(sellerId);
      categoryId = await createTestCategory(admin, `delete-${suffix}`);
      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS delete-regression annonse med ord",
          price_nok: 100,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
          category_id: categoryId,
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      listingId = listing.id;
    });
    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      await admin.from("categories").delete().eq("id", categoryId);
    });
    it("lets the owner delete their own active, categorized listing without a trigger permission/RLS error", async () => {
      const seller = await signIn(emails.seller);
      const { error, count } = await seller
        .from("listings")
        .delete({ count: "exact" })
        .eq("id", listingId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  },
);
describe.skipIf(!canRun)(
  "RLS: listing_images follow their parent listing's active-or-owner visibility",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      seller: `rls-img-seller-${suffix}@example.com`,
      other: `rls-img-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let sellerId: string;
    let draftListingId: string;
    let imagePath: string;
    let draftImageId: string;
    async function signIn(email: string) {
      return signInWithRetry(email);
    }
    beforeAll(async () => {
      const mkUser = async (email: string) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) throw error;
        userIds.push(data.user!.id);
        return data.user!.id;
      };
      sellerId = await mkUser(emails.seller);
      await mkUser(emails.other);
      const { data: listing, error: listingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS image test draft listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (listingErr) throw listingErr;
      draftListingId = listing.id;
      const seller = await signIn(emails.seller);
      imagePath = `${draftListingId}/${crypto.randomUUID()}.jpg`;
      const { data: image, error: imageErr } = await seller
        .from("listing_images")
        .insert({ listing_id: draftListingId, storage_path: imagePath })
        .select("id")
        .single();
      if (imageErr) throw imageErr;
      draftImageId = image.id;
    });
    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });
    it("lets the owner see images on their own draft listing", async () => {
      const seller = await signIn(emails.seller);
      const { data, error } = await seller
        .from("listing_images")
        .select("id")
        .eq("id", draftImageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
    it("hides images on a draft listing from other users and anon", async () => {
      const other = await signIn(emails.other);
      const { data, error } = await other
        .from("listing_images")
        .select("id")
        .eq("id", draftImageId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
      const anon = createClient(URL!, ANON_KEY!);
      const { data: anonData, error: anonErr } = await anon
        .from("listing_images")
        .select("id")
        .eq("id", draftImageId);
      expect(anonErr).toBeNull();
      expect(anonData).toHaveLength(0);
    });
    it("blocks a non-owner from adding images to someone else's listing", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.jpg`,
      });
      expect(error).not.toBeNull();
    });
    it("accepts the new {listingId}/{uuid}.ext path but rejects malformed or mismatched ones", async () => {
      const seller = await signIn(emails.seller);
      const { error: okError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.jpg`,
      });
      expect(okError).toBeNull();
      const { error: oldFormatError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${sellerId}/${draftListingId}/${crypto.randomUUID()}.jpg`,
      });
      expect(oldFormatError).not.toBeNull();
      const { error: wrongListingError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`,
      });
      expect(wrongListingError).not.toBeNull();
      const { error: notUuidError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/not-a-uuid.jpg`,
      });
      expect(notUuidError).not.toBeNull();
      const { error: badExtError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.svg`,
      });
      expect(badExtError).not.toBeNull();
      const { error: extraSegmentError } = await seller.from("listing_images").insert({
        listing_id: draftListingId,
        storage_path: `${draftListingId}/${crypto.randomUUID()}.jpg/noe`,
      });
      expect(extraSegmentError).not.toBeNull();
    });
    it("allows 100 images per listing and rejects image 101", async () => {
      const owner = await signIn(emails.seller);
      const { data: capListing, error: capListingErr } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS image cap test listing",
          price_nok: 100,
          status: "draft",
        })
        .select("id")
        .single();
      if (capListingErr) throw capListingErr;
      for (let i = 0; i < 100; i++) {
        const { error } = await owner.from("listing_images").insert({
          listing_id: capListing.id,
          storage_path: `${capListing.id}/${crypto.randomUUID()}.jpg`,
        });
        expect(error).toBeNull();
      }
      const { error: overCapError } = await owner.from("listing_images").insert({
        listing_id: capListing.id,
        storage_path: `${capListing.id}/${crypto.randomUUID()}.jpg`,
      });
      expect(overCapError).not.toBeNull();
      await admin.from("listings").delete().eq("id", capListing.id);
    });
  },
);
describe.skipIf(!canRun)("RLS: aktive salgsannonser krever pris", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const email = `rls-price-${Date.now()}@example.com`;
  let sellerId: string;
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    sellerId = data.user!.id;
  });
  afterAll(async () => {
    if (sellerId) await admin.auth.admin.deleteUser(sellerId);
  });
  it("avviser aktiv ikke-gratis annonse uten pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS annonse uten pris",
      is_free: false,
      description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
      status: "active",
    });
    expect(error).not.toBeNull();
  });
  it("tillater aktiv gratisannonse uten pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS gratisannonse",
      is_free: true,
      description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
      status: "active",
    });
    expect(error).toBeNull();
  });
  it("tillater utkast uten pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS utkast uten pris",
      is_free: false,
      status: "draft",
    });
    expect(error).toBeNull();
  });
  it("tillater aktiv ikke-gratis annonse med pris", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: sellerId,
      title: "RLS annonse med pris",
      is_free: false,
      price_nok: 100,
      description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
      status: "active",
    });
    expect(error).toBeNull();
  });
});
describe.skipIf(!canRun)("RLS: listing-image upload authorization", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    seller: `rls-storage-seller-${suffix}@example.com`,
    outsider: `rls-storage-outsider-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let sellerId: string;
  let activeListingId: string;
  let draftListingId: string;
  async function signIn(email: string) {
    return signInWithRetry(email);
  }
  beforeAll(async () => {
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    sellerId = await mkUser(emails.seller);
    await mkUser(emails.outsider);
    const { data: active, error: activeErr } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS storage active listing",
        price_nok: 100,
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        status: "active",
      })
      .select("id")
      .single();
    if (activeErr) throw activeErr;
    activeListingId = active.id;
    const { data: draft, error: draftErr } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "RLS storage draft listing",
        price_nok: 100,
        status: "draft",
      })
      .select("id")
      .single();
    if (draftErr) throw draftErr;
    draftListingId = draft.id;
  });
  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", [activeListingId, draftListingId]);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });
  it("lets only the seller (not an outsider) upload/delete images for their listing", async () => {
    const seller = await signIn(emails.seller);
    const outsider = await signIn(emails.outsider);
    const canUpload = async (client: SupabaseClient, listingId: string) => {
      const { data, error } = await client.rpc("can_upload_listing_image", {
        _listing_id: listingId,
      });
      expect(error).toBeNull();
      return data;
    };
    expect(await canUpload(seller, activeListingId)).toBe(true);
    expect(await canUpload(outsider, activeListingId)).toBe(false);
    expect(await canUpload(seller, draftListingId)).toBe(true);
    expect(await canUpload(outsider, draftListingId)).toBe(false);
  });
});
describe.skipIf(!canRun)("RLS: solgte annonser — 30 dager via lenke, 2 dager i søket", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = `sold-${Date.now()}`;
  const sellerEmail = `rls-sold-seller-${suffix}@example.com`;
  const userIds: string[] = [];
  let categoryId: string;
  let activeId: string;
  let soldNowId: string;
  let sold3dId: string;
  let sold31dId: string;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, sellerEmail, userIds);
    categoryId = await createTestCategory(admin, suffix);
    const mk = async (status: "active" | "sold", soldAt?: string) => {
      const { data, error } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          category_id: categoryId,
          title: `RLS solgt ${status}`,
          price_nok: 100,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status,
          ...(soldAt ? { sold_at: soldAt } : {}),
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: imageError } = await admin
        .from("listing_images")
        .insert({ listing_id: data.id, storage_path: `${data.id}/${crypto.randomUUID()}.webp` });
      if (imageError) throw imageError;
      return data.id as string;
    };
    activeId = await mk("active");
    soldNowId = await mk("sold");
    sold3dId = await mk("sold", daysAgo(3));
    sold31dId = await mk("sold", daysAgo(31));
  });
  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", [activeId, soldNowId, sold3dId, sold31dId]);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });
  it("viser solgte annonser og bildene deres via lenke i 30 dager, også for anonyme", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const ids = [activeId, soldNowId, sold3dId, sold31dId];
    const { data: listings } = await anon.from("listings").select("id").in("id", ids);
    expect(new Set(listings?.map((l) => l.id))).toEqual(new Set([activeId, soldNowId, sold3dId]));
    const { data: images } = await anon
      .from("listing_images")
      .select("listing_id")
      .in("listing_id", ids);
    expect(new Set(images?.map((i) => i.listing_id))).toEqual(
      new Set([activeId, soldNowId, sold3dId]),
    );
  });
  it("tar med solgte annonser i søket bare de to første dagene, og bare på forespørsel", async () => {
    const anon = createClient(URL!, ANON_KEY!);
    const search = (includeSold?: boolean) =>
      anon.rpc("search_listings_page", {
        _category_ids: [categoryId],
        _limit: 10,
        ...(includeSold === undefined ? {} : { _include_recently_sold: includeSold }),
      });
    const withSold = await search(true);
    expect(withSold.error).toBeNull();
    const rows = withSold.data as {
      id: string;
      sold_at: string | null;
      total_count: number;
    }[];
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([activeId, soldNowId]));
    expect(rows.find((r) => r.id === soldNowId)?.sold_at).not.toBeNull();
    expect(rows.find((r) => r.id === activeId)?.sold_at).toBeNull();
    expect(rows[0].total_count).toBe(2);
    const withoutSold = await search();
    expect(withoutSold.error).toBeNull();
    expect(
      (
        withoutSold.data as {
          id: string;
        }[]
      ).map((r) => r.id),
    ).toEqual([activeId]);
  });
  it("lar ikke selgeren flytte salgstidspunktet for å holde annonsen synlig", async () => {
    const seller = await signInWithRetry(sellerEmail);
    await seller.from("listings").update({ sold_at: new Date().toISOString() }).eq("id", sold31dId);
    const { data } = await admin.from("listings").select("sold_at").eq("id", sold31dId).single();
    expect(new Date(data!.sold_at).getTime()).toBeLessThan(Date.now() - 30 * 86400000);
  });
  it("setter salgstidspunktet når annonsen blir solgt og fjerner det ved ny publisering", async () => {
    const { error: soldError } = await admin
      .from("listings")
      .update({ status: "sold" })
      .eq("id", activeId);
    expect(soldError).toBeNull();
    const { data: sold } = await admin
      .from("listings")
      .select("sold_at")
      .eq("id", activeId)
      .single();
    expect(Date.now() - new Date(sold!.sold_at).getTime()).toBeLessThan(60000);
    const { error: activeError } = await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", activeId);
    expect(activeError).toBeNull();
    const { data: active } = await admin
      .from("listings")
      .select("sold_at")
      .eq("id", activeId)
      .single();
    expect(active!.sold_at).toBeNull();
  });
});

describe.skipIf(!canRun)("RLS: adminflytting av kategori er autorisert og atomisk", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const email = `rls-category-move-${suffix}@example.com`;
  const userIds: string[] = [];
  const listingIds: string[] = [];
  let sourceCategory: string;
  let targetCategory: string;

  beforeAll(async () => {
    const sellerId = await createRlsUser(admin, email, userIds);
    sourceCategory = await createTestCategory(admin, `category-move-source-${suffix}`);
    targetCategory = await createTestCategory(admin, `category-move-target-${suffix}`);
    for (const title of ["Utkast én", "Utkast to"]) {
      const { data, error } = await admin
        .from("listings")
        .insert({ seller_id: sellerId, category_id: sourceCategory, title, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      listingIds.push(data.id);
    }
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("listings").delete().in("id", listingIds);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("avviser delvis og ikke-admin flytting før en hel versjonssjekket batch", async () => {
    const { data: rows, error: readError } = await admin
      .from("listings")
      .select("id,status,updated_at")
      .in("id", listingIds)
      .order("id");
    expect(readError).toBeNull();
    const expectedRows = rows!.map((row) => ({
      id: row.id,
      status: row.status,
      updated_at: row.updated_at,
    }));

    const owner = await signInWithRetry(email);
    const denied = await owner.rpc("admin_replace_listing_category", {
      _category_id: sourceCategory,
      _replacement_category_id: targetCategory,
      _expected_rows: expectedRows,
    });
    expect(denied.error).not.toBeNull();

    const staleRows = expectedRows.map((row, index) =>
      index === 1 ? { ...row, updated_at: "2000-01-01T00:00:00Z" } : row,
    );
    const stale = await admin.rpc("admin_replace_listing_category", {
      _category_id: sourceCategory,
      _replacement_category_id: targetCategory,
      _expected_rows: staleRows,
    });
    expect(stale.error?.code).toBe("PT409");
    const { data: unchanged } = await admin
      .from("listings")
      .select("category_id")
      .in("id", listingIds);
    expect(unchanged?.every((row) => row.category_id === sourceCategory)).toBe(true);

    const moved = await admin.rpc("admin_replace_listing_category", {
      _category_id: sourceCategory,
      _replacement_category_id: targetCategory,
      _expected_rows: expectedRows,
    });
    expect(moved.error).toBeNull();
    const { data: result } = await admin
      .from("listings")
      .select("category_id")
      .in("id", listingIds);
    expect(result?.every((row) => row.category_id === targetCategory)).toBe(true);
  });
});

registerCategoryCleanup();
