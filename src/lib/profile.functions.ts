import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { ClientError, toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pathFromPublicImageUrl } from "@/lib/image-url";
import { countSalesBySeller } from "@/lib/sales.functions";

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Minst 2 tegn").max(80),
});

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", context.userId)
      .select("id, display_name, avatar_url")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return profile;
  });

export const updateOwnAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ avatarUrl: z.string().url().max(2048) }).parse(input))
  .handler(async ({ data, context }) => {
    const parsed = new URL(data.avatarUrl);
    const r2Path = pathFromPublicImageUrl(data.avatarUrl);
    const validR2Avatar =
      r2Path !== null &&
      new RegExp(`^${context.userId}/avatar-[0-9a-f-]{36}\\.(jpg|png|webp|jxl)$`, "i").test(r2Path);
    let configuredOrigin: string | null = null;
    try {
      configuredOrigin = new URL(process.env.SUPABASE_URL ?? "").origin;
    } catch {
      // Reject the URL when the server is missing a valid Supabase origin.
    }
    const expectedPath = `/storage/v1/object/public/avatars/${context.userId}/`;
    const validLegacyAvatar =
      configuredOrigin !== null &&
      parsed.origin === configuredOrigin &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname.startsWith(expectedPath);
    if (!validR2Avatar && !validLegacyAvatar) {
      throw new ClientError("Ugyldig profilbilde", 400);
    }
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: data.avatarUrl })
      .eq("id", context.userId)
      .select("id, display_name, avatar_url")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return profile;
  });

export type PublicProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  deleted_at: string | null;
  avg_rating: number;
  review_count: number;
};

export type MyProfileStats = {
  created_at: string;
  listings_count: number;
  sales_count: number;
  avg_rating: number;
  review_count: number;
};

export const getPublicProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ userId: z.guid() }).parse(input))
  .handler(async ({ data }): Promise<PublicProfile | null> => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, created_at, deleted_at")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) {
      throw await toClientError("database", error);
    }
    if (!profile) return null;

    const { reviewSummary } = await import("@/lib/review-summary");
    const summary = await reviewSummary(supabaseAdmin, data.userId);
    return {
      id: profile.id,
      display_name: profile.deleted_at ? "Slettet bruker" : profile.display_name,
      avatar_url: profile.deleted_at ? null : profile.avatar_url,
      created_at: profile.created_at,
      deleted_at: profile.deleted_at,
      ...summary,
    };
  });

export const getMyProfileStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfileStats> => {
    const { supabase, userId } = context;

    const { reviewSummary } = await import("@/lib/review-summary");
    const [{ data: profile, error: profileErr }, { count: listingsCount }, salesCount, summary] =
      await Promise.all([
        supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
        // Bare aktive: telleren leses som "annonser jeg har ute" og skal stemme
        // med «Aktive»-fanen i Mine annonser og den offentlige profilen. Solgte
        // telles allerede i Salg ved siden av.
        supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", userId)
          .eq("status", "active"),
        countSalesBySeller(supabase, userId),
        reviewSummary(supabase, userId),
      ]);
    if (profileErr) {
      throw await toClientError("database", profileErr);
    }

    return {
      created_at: profile?.created_at ?? new Date().toISOString(),
      listings_count: listingsCount ?? 0,
      sales_count: salesCount,
      ...summary,
    };
  });
