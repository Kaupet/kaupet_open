// kaupet_open: roller håndheves av databasepolicyene.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  createRlsUser,
  signInWithRetry,
} from "../rls-test-helpers";

describe.skipIf(!canRun)("RLS: administrasjon av roller", () => {
  const service = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const userIds: string[] = [];
  let ownerId: string;
  let otherId: string;
  let emptyUserId: string;
  let ownerRoleId: string;
  let owner: SupabaseClient;
  let other: SupabaseClient;
  let administrator: SupabaseClient;
  let anonymous: SupabaseClient;

  beforeAll(async () => {
    const ownerEmail = `rls-preferences-owner-${suffix}@example.com`;
    const otherEmail = `rls-preferences-other-${suffix}@example.com`;
    const adminEmail = `rls-preferences-admin-${suffix}@example.com`;
    ownerId = await createRlsUser(service, ownerEmail, userIds);
    otherId = await createRlsUser(service, otherEmail, userIds);
    emptyUserId = await createRlsUser(
      service,
      `rls-preferences-empty-${suffix}@example.com`,
      userIds,
    );
    const adminId = await createRlsUser(service, adminEmail, userIds);
    const roles = await service
      .from("user_roles")
      .insert([
        { user_id: ownerId, role: "user" },
        { user_id: otherId, role: "demo" },
        { user_id: adminId, role: "admin" },
      ])
      .select("id, user_id");
    if (roles.error) throw roles.error;
    ownerRoleId = roles.data.find((row) => row.user_id === ownerId)!.id;
    owner = await signInWithRetry(ownerEmail);
    other = await signInWithRetry(otherEmail);
    administrator = await signInWithRetry(adminEmail);
    anonymous = createClient(URL!, ANON_KEY!);
  });

  afterAll(async () => {
    if (!canRun || !userIds.length) return;
    const roles = await service.from("user_roles").delete().in("user_id", userIds);
    if (roles.error) throw roles.error;
    const profiles = await service.from("profiles").delete().in("id", userIds);
    if (profiles.error) throw profiles.error;
    for (const id of userIds) {
      const result = await service.auth.admin.deleteUser(id);
      if (result.error) throw result.error;
    }
  });

  it.each(["eier", "annen bruker", "anonym"] as const)(
    "beskytter rollene mot selvoppgradering og annen skriving for %s",
    async (actor) => {
      const client = actor === "eier" ? owner : actor === "anonym" ? anonymous : other;
      const read = await client.from("user_roles").select("id, role").eq("user_id", ownerId);
      expect(read.error).toBeNull();
      expect(read.data).toEqual(actor === "eier" ? [{ id: ownerRoleId, role: "user" }] : []);
      const inserted = await client
        .from("user_roles")
        .insert({ user_id: actor === "annen bruker" ? otherId : ownerId, role: "admin" });
      expect(inserted.error?.code).toBe("42501");
      const updated = await client
        .from("user_roles")
        .update({ role: "admin" }, { count: "exact" })
        .eq("id", ownerRoleId);
      expect(updated.error).toBeNull();
      expect(updated.count).toBe(0);
      const deleted = await client
        .from("user_roles")
        .delete({ count: "exact" })
        .eq("id", ownerRoleId);
      expect(deleted.error).toBeNull();
      expect(deleted.count).toBe(0);
    },
  );

  it("lar en administrator lese, tildele, endre og fjerne en annen brukers rolle", async () => {
    const read = await administrator
      .from("user_roles")
      .select("user_id")
      .in("user_id", [ownerId, otherId]);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(2);
    const inserted = await administrator
      .from("user_roles")
      .insert({ user_id: emptyUserId, role: "admin" })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const updated = await administrator
      .from("user_roles")
      .update({ role: "moderator" }, { count: "exact" })
      .eq("id", inserted.data!.id);
    expect(updated.error).toBeNull();
    expect(updated.count).toBe(1);
    const deleted = await administrator
      .from("user_roles")
      .delete({ count: "exact" })
      .eq("id", inserted.data!.id);
    expect(deleted.error).toBeNull();
    expect(deleted.count).toBe(1);
  });
});
