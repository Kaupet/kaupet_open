// kaupet_open: bare kjernecasene; private produktgrener eksporteres ikke.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { URL, SERVICE_ROLE_KEY, canRun, createRlsUser, signInWithRetry } from "../rls-test-helpers";
describe.skipIf(!canRun)("cancel_account_deletion restores original states", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const email = `rls-restore-${Date.now()}@example.com`;
  const users: string[] = [];
  let userId: string;
  beforeAll(async () => {
    userId = await createRlsUser(admin, email, users);
  });
  afterAll(async () => {
    await admin.from("account_deletions").delete().eq("user_id", userId);
    await admin.from("listings").delete().eq("seller_id", userId);
    await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
  });
  it("preserves draft, active, archived, sold time and fulfilled wishes across repeated requests", async () => {
    const soldAt = new Date(Date.now() - 5 * 864e5).toISOString();
    const states = ["draft", "active", "sold", "archived"];
    const { data: listings, error } = await admin
      .from("listings")
      .insert(
        states.map((status) => ({
          seller_id: userId,
          title: `Restore ${status}`,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status,
          price_nok: 100,
          expires_at: new Date(Date.now() + 864e5).toISOString(),
          ...(status === "sold" ? { sold_at: soldAt } : {}),
        })),
      )
      .select("id, status, sold_at");
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    const archived = await admin.from("listings").select("status").eq("seller_id", userId);
    expect(archived.data?.every((row) => row.status === "archived")).toBe(true);
    const cancelled = await owner.rpc("cancel_account_deletion");
    expect(cancelled.error).toBeNull();
    expect(cancelled.data).toBe(true);
    const restored = await admin
      .from("listings")
      .select("id, status, sold_at")
      .eq("seller_id", userId);
    expect(restored.data).toEqual(expect.arrayContaining(listings!));
    expect((await owner.rpc("cancel_account_deletion")).data).toBe(false);
  });
  it("bevarer publiseringstid og utløpsdato ved avbrudd uten å endre vanlig publisering", async () => {
    const publishedAt = new Date(Date.now() - 25 * 864e5).toISOString();
    const expiresAt = new Date(Date.now() + 5 * 864e5).toISOString();
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Beholder opprinnelig annonseperiode",
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        status: "active",
        price_nok: 100,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const original = await admin
      .from("listings")
      .update({ published_at: publishedAt, expires_at: expiresAt })
      .eq("id", listing!.id)
      .select("published_at, expires_at")
      .single();
    expect(original.error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    const restored = await admin
      .from("listings")
      .select("published_at, expires_at")
      .eq("id", listing!.id)
      .single();
    expect(restored.error).toBeNull();
    expect(restored.data).toEqual(original.data);
    expect(
      (await admin.from("listings").update({ status: "archived" }).eq("id", listing!.id)).error,
    ).toBeNull();
    const renewed = await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", listing!.id)
      .select("published_at, expires_at")
      .single();
    expect(renewed.error).toBeNull();
    expect(new Date(renewed.data!.published_at).getTime()).toBeGreaterThan(
      new Date(publishedAt).getTime(),
    );
    expect(new Date(renewed.data!.expires_at).getTime()).toBeGreaterThan(
      new Date(expiresAt).getTime(),
    );
  });
  it("gjør ikke en utløpt aktiv annonse aktiv igjen", async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Utløper mens sletting ventes",
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        status: "active",
        price_nok: 100,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    await admin
      .from("listings")
      .update({ expires_at: new Date(Date.now() - 864e5).toISOString() })
      .eq("id", listing!.id);
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    expect(
      (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
    ).toBe("expired");
  });
  it("respekterer en publiseringssperre som kom etter slettingsforespørselen", async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Blir sperret under sletting",
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        status: "active",
        price_nok: 100,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    const ban = await admin
      .from("user_bans")
      .insert({ user_id: userId, reason: "Local restoration test", banned_by: userId });
    expect(ban.error).toBeNull();
    try {
      const cancelled = await owner.rpc("cancel_account_deletion");
      expect(cancelled.error).toBeNull();
      expect(cancelled.data).toBe(true);
      expect(
        (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
      ).toBe("disabled");
    } finally {
      await admin.from("user_bans").delete().eq("user_id", userId);
    }
  });
  it("beholder annonsesperren etter gjentatt slettingsforespørsel og avbrudd", async () => {
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Sperres mens sletting ventes",
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        status: "active",
        price_nok: 100,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect(
      (await admin.from("listings").update({ status: "disabled" }).eq("id", listing!.id)).error,
    ).toBeNull();
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    expect(
      (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
    ).toBe("disabled");
  });
  it("gjenoppretter annonser opprettet mellom to slettingsforespørsler", async () => {
    const owner = await signInWithRetry(email);
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        seller_id: userId,
        title: "Opprettet mellom forespørslene",
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        status: "active",
        price_nok: 100,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await owner.rpc("request_account_deletion", { _email: email })).error).toBeNull();
    expect((await owner.rpc("cancel_account_deletion")).error).toBeNull();
    expect(
      (await admin.from("listings").select("status").eq("id", listing!.id).single()).data?.status,
    ).toBe("active");
  });
  describe.skipIf(!canRun)("RLS: ferdigbehandlet rapport stopper ikke utløpt kontosletting", () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      formerModerator: `rls-purge-moderator-${suffix}@example.com`,
      other: `rls-purge-other-${suffix}@example.com`,
      reporter: `rls-purge-reporter-${suffix}@example.com`,
      seller: `rls-purge-seller-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let formerModeratorId: string;
    let otherId: string;
    let listingId: string;
    let reportId: string;

    beforeAll(async () => {
      formerModeratorId = await createRlsUser(admin, emails.formerModerator, userIds);
      otherId = await createRlsUser(admin, emails.other, userIds);
      await createRlsUser(admin, emails.reporter, userIds);
      const sellerId = await createRlsUser(admin, emails.seller, userIds);
      const { data: listing, error: listingError } = await admin
        .from("listings")
        .insert({
          seller_id: sellerId,
          title: "RLS resolved report purge listing",
          price_nok: 100,
          description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
          status: "active",
        })
        .select("id")
        .single();
      if (listingError) throw listingError;
      listingId = listing.id;

      const { error: roleError } = await admin
        .from("user_roles")
        .insert({ user_id: formerModeratorId, role: "moderator" });
      if (roleError) throw roleError;
      const reporter = await signInWithRetry(emails.reporter);
      const { error: submitError } = await reporter.rpc("submit_listing_report", {
        _listing_id: listingId,
        _reason: "Syntetisk RLS purge-test",
      });
      if (submitError) throw submitError;
      const { data: report, error: reportError } = await admin
        .from("reports")
        .select("id")
        .eq("listing_id", listingId)
        .single();
      if (reportError) throw reportError;
      reportId = report.id;

      const moderator = await signInWithRetry(emails.formerModerator);
      const { error: resolveError } = await moderator.rpc("admin_resolve_report", {
        _id: reportId,
      });
      if (resolveError) throw resolveError;
      const { error: roleRemovalError } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", formerModeratorId);
      if (roleRemovalError) throw roleRemovalError;

      for (const email of [emails.formerModerator, emails.other]) {
        const user = await signInWithRetry(email);
        const { error } = await user.rpc("request_account_deletion", { _email: email });
        if (error) throw error;
      }
      const { error: dueError } = await admin
        .from("account_deletions")
        .update({ scheduled_purge_at: "2000-01-01T00:00:00Z" })
        .in("user_id", [formerModeratorId, otherId]);
      if (dueError) throw dueError;
    });

    afterAll(async () => {
      if (!canRun) return;
      await admin.from("account_deletions").delete().in("user_id", userIds);
      if (reportId) await admin.from("reports").delete().eq("id", reportId);
      if (listingId) await admin.from("listings").delete().eq("id", listingId);
      await admin.from("user_roles").delete().in("user_id", userIds);
      await Promise.all(
        userIds.map(async (id) => {
          const { data } = await admin.auth.admin.getUserById(id);
          if (data.user) await admin.auth.admin.deleteUser(id);
        }),
      );
    });

    it("sletter begge forfalte kontoene og beholder rapporten uten moderatorreferanse", async () => {
      const { data: reportBefore, error: reportBeforeError } = await admin
        .from("reports")
        .select("resolved_by")
        .eq("id", reportId)
        .single();
      expect(reportBeforeError).toBeNull();
      expect(reportBefore?.resolved_by).toBe(formerModeratorId);

      const { data, error } = await admin.rpc("purge_expired_accounts");
      expect(error).toBeNull();
      expect(data).toBe(2);
      for (const id of [formerModeratorId, otherId]) {
        const { data: user } = await admin.auth.admin.getUserById(id);
        expect(user.user).toBeNull();
      }
      const { data: requests, error: requestsError } = await admin
        .from("account_deletions")
        .select("user_id")
        .in("user_id", [formerModeratorId, otherId]);
      expect(requestsError).toBeNull();
      expect(requests).toHaveLength(0);
      const { data: reportAfter, error: reportAfterError } = await admin
        .from("reports")
        .select("resolved_by")
        .eq("id", reportId)
        .single();
      expect(reportAfterError).toBeNull();
      expect(reportAfter?.resolved_by).toBeNull();
    });
  });
});
