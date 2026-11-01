import { ClientError, toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole as requireAdmin } from "@/lib/admin-auth.server";
import { requireAdminOrModeratorRole } from "@/lib/moderator-auth.server";
import {
  fetchOfferComment,
  MESSAGE_OFFER_COLUMN,
  messageOfferId,
} from "@/components/meldinger/offers";

const reason = z.string().trim().min(1, "Begrunnelse er påkrevd").max(500);
const uuid = z.guid();
const message = z.string().trim().min(1, "Melding er påkrevd").max(2000);

export const adminDisableListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid, reason }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_disable_listing", {
      _id: data.id,
      _reason: data.reason,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminEnableListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_enable_listing", {
      _id: data.id,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminSetListingHomeVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid, hidden: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_set_listing_home_visibility", {
      _id: data.id,
      _hidden: data.hidden,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ userId: uuid, reason }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_ban_user", {
      _user_id: data.userId,
      _reason: data.reason,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminUnbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_unban_user", {
      _user_id: data.userId,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        listingId: uuid,
        reason: z.string().trim().min(1, "Grunn er påkrevd").max(500),
        comment: z.string().trim().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("submit_listing_report", {
      _listing_id: data.listingId,
      _reason: data.reason,
      _comment: data.comment ?? undefined,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const submitUserReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        reportedUserId: uuid,
        reason: z.string().trim().min(1, "Grunn er påkrevd").max(500),
        comment: z.string().trim().max(1000).optional(),
        /** Rapportert melding: serveren siterer den selv, så sitatet ikke kan forfalskes. */
        messageId: uuid.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let comment = data.comment;
    if (data.messageId) {
      // Brukerens egen klient: RLS sørger for at bare partene kan lese meldingen.
      const { data: message, error: messageError } = await context.supabase
        .from("messages")
        .select(
          `id, conversation_id, sender_id, body, attachment_path, deleted_at${MESSAGE_OFFER_COLUMN}` as const,
        )
        .eq("id", data.messageId)
        .maybeSingle();
      if (messageError) throw await toClientError("database", messageError);
      if (!message || message.sender_id !== data.reportedUserId || message.deleted_at) {
        throw new ClientError("Fant ikke meldingen", 404);
      }
      let body = message.body;
      const offerId = messageOfferId(message);
      if (offerId) {
        const { data: offer, error: offerError } = await fetchOfferComment(context.supabase, {
          ...message,
          offer_id: offerId,
        });
        if (offerError) throw await toClientError("database", offerError);
        if (!offer) throw new ClientError("Fant ikke budet", 404);
        body = [body, offer.comment].filter(Boolean).join("\n\n");
      }
      const quote = body ? `«${body}»` : message.attachment_path ? "(bilde)" : "(tom)";
      // Sitatet først, så kuttes en lang kommentar og ikke meldingen.
      comment = [`Melding ${message.id}: ${quote}`, data.comment]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 1000);
    }
    const { error } = await context.supabase.rpc("submit_user_report", {
      _reported_user_id: data.reportedUserId,
      _reason: data.reason,
      _comment: comment ?? undefined,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminDisableListingWithMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid, reason, message }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_disable_listing_with_message", {
      _id: data.id,
      _reason: data.reason,
      _message: data.message,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminDeleteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid, message }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_delete_listing", {
      _id: data.id,
      _message: data.message,
    });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_reports", { _limit: 200 });
    if (error) {
      throw await toClientError("database", error);
    }
    return data ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrModeratorRole(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_resolve_report", { _id: data.id });
    if (error) {
      throw await toClientError("database", error);
    }
    return { ok: true };
  });
