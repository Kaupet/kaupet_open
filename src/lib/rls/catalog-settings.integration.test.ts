// kaupet_open: bare kjernecasene; private produktgrener eksporteres ikke.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  canRun,
  PASSWORD,
  createTestCategory,
  signInWithRetry,
  grantAdmin,
  registerCategoryCleanup,
} from "../rls-test-helpers";
describe.skipIf(!canRun)(
  "RLS: categories / category_filters / category_flows — public read, admin-only write",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-taxonomy-admin-${suffix}@example.com`,
      other: `rls-taxonomy-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let categoryId: string;
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
      const adminId = await mkUser(emails.admin);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);
      categoryId = await createTestCategory(admin, `taxonomy-${suffix}`);
    });
    afterAll(async () => {
      if (!canRun) return;
      await admin.from("categories").delete().eq("id", categoryId);
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });
    it("lets an anonymous visitor read all three taxonomy tables", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      for (const table of ["categories", "category_filters", "category_flows"] as const) {
        const { error } = await anon.from(table).select("id").limit(1);
        expect(error, `${table} should be publicly readable`).toBeNull();
      }
    });
    it("blocks a non-admin authenticated user from renaming a category", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("categories")
        .update({ name_nb: "Hijacked category name" }, { count: "exact" })
        .eq("id", categoryId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
    it("blocks a non-admin authenticated user from inserting a category filter", async () => {
      const other = await signIn(emails.other);
      const { error } = await other.from("category_filters").insert({
        category_id: categoryId,
        key: `rls_hijack_${suffix}`,
        label_nb: "Hijacked filter",
        type: "text",
      });
      expect(error).not.toBeNull();
    });
    it("lets an admin insert and then delete a category filter", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient
        .from("category_filters")
        .insert({
          category_id: categoryId,
          key: `rls_admin_test_${suffix}`,
          label_nb: "RLS admin test filter",
          type: "text",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      if (data) {
        const { error: deleteErr } = await adminClient
          .from("category_filters")
          .delete()
          .eq("id", data.id);
        expect(deleteErr).toBeNull();
      }
    });
    it("allows only an admin to write category flows", async () => {
      const other = await signIn(emails.other);
      const adminClient = await signIn(emails.admin);
      const flow = {
        category_id: categoryId,
        field_groups: [
          "photos",
          "title",
          "category-attributes",
          "description-keywords",
          "review-publish",
        ],
        sort_order: 99,
      };
      const { error: flowInsertError } = await other.from("category_flows").insert(flow);
      expect(flowInsertError).not.toBeNull();
      const { data: insertedFlow, error: adminFlowError } = await adminClient
        .from("category_flows")
        .insert(flow)
        .select("id")
        .single();
      expect(adminFlowError).toBeNull();
      expect(insertedFlow).not.toBeNull();
      if (insertedFlow) {
        const { error } = await adminClient
          .from("category_flows")
          .update({ sort_order: 100 })
          .eq("id", insertedFlow.id);
        expect(error).toBeNull();
        const { error: deleteError } = await adminClient
          .from("category_flows")
          .delete()
          .eq("id", insertedFlow.id);
        expect(deleteError).toBeNull();
      }
    });
  },
);
describe.skipIf(!canRun)(
  "RLS: site_settings — public read, only admins can update the singleton row",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = {
      admin: `rls-sitesettings-admin-${suffix}@example.com`,
      other: `rls-sitesettings-other-${suffix}@example.com`,
    };
    const userIds: string[] = [];
    let originalDefaultSearchExamples: string[];
    let createdSiteSettings = false;
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
      const adminId = await mkUser(emails.admin);
      await mkUser(emails.other);
      await grantAdmin(admin, adminId);
      const { data: current, error: currentErr } = await admin
        .from("site_settings")
        .select("default_search_examples")
        .eq("id", true)
        .maybeSingle();
      if (currentErr) throw currentErr;
      if (current) {
        originalDefaultSearchExamples = current.default_search_examples;
      } else {
        originalDefaultSearchExamples = [];
        const { error: insertErr } = await admin
          .from("site_settings")
          .insert({ id: true, default_search_examples: [] });
        if (insertErr) throw insertErr;
        createdSiteSettings = true;
      }
    });
    afterAll(async () => {
      if (!canRun) return;
      if (createdSiteSettings) {
        await admin.from("site_settings").delete().eq("id", true);
      } else {
        await admin
          .from("site_settings")
          .update({ default_search_examples: originalDefaultSearchExamples })
          .eq("id", true);
      }
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });
    it("lets an anonymous visitor read site settings", async () => {
      const anon = createClient(URL!, ANON_KEY!);
      const { data, error } = await anon.from("site_settings").select("id").eq("id", true);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
    it("blocks a non-admin from updating site settings", async () => {
      const other = await signIn(emails.other);
      const { error, count } = await other
        .from("site_settings")
        .update({ default_search_examples: ["hijacked"] }, { count: "exact" })
        .eq("id", true);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
    it("lets an admin update site settings", async () => {
      const adminClient = await signIn(emails.admin);
      const { error, count } = await adminClient
        .from("site_settings")
        .update({ default_search_examples: ["rls-test-example"] }, { count: "exact" })
        .eq("id", true);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  },
);
describe.skipIf(!canRun)(
  "RLS: app_settings has no client access at all, not even for admins",
  () => {
    const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
    const suffix = Date.now();
    const emails = { admin: `rls-appsettings-admin-${suffix}@example.com` };
    const userIds: string[] = [];
    async function signIn(email: string) {
      return signInWithRetry(email);
    }
    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: emails.admin,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      const adminId = data.user!.id;
      userIds.push(adminId);
      await grantAdmin(admin, adminId);
    });
    afterAll(async () => {
      if (!canRun) return;
      await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
    });
    it("never returns app_settings rows to a client, even an admin (zero policies, service-role only — stores job credentials)", async () => {
      const adminClient = await signIn(emails.admin);
      const { data, error } = await adminClient.from("app_settings").select("key").limit(1);
      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  },
);
registerCategoryCleanup();
