import {
  CONVERSATION_ORGANIZATION_RELATION,
  organizationConversationAccess,
  organizationConversationAccessKey,
  type ConversationOrganizationFields,
} from "@/lib/organization-access.server";
// TanStack Start-serverfunksjoner for opplasting/sletting av bilder i R2.
//
// Filoverføring: FormData, ikke base64 (som i vehicle-360.functions.ts).
// TanStack Start støtter FormData som validator-input for POST-serverfunksjoner
// (klienten sender multipart, serveren rekonstruerer en ekte FormData med
// File-verdier før validatoren kjører — se server-functions-handler i
// @tanstack/start-server-core). Det unngår 33 %-overhead og
// tekst-en/dekoding fra base64, som ikke gir noen fordel her siden det ikke
// finnes en token-only, sesjonsløs klient for disse opplastingene (i
// motsetning til 360-opptak, som bruker base64 nettopp fordi det sendes fra
// en uinnlogget mobilklient som ikke kan gjøre multipart mot en
// autentisert serverfunksjon på samme måte).
//
// Størrelsesgrensen håndheves i handleren rett etter at valideringen av
// selve feltene er gjort, før noe når R2 — men multipart-bodyen er allerede
// lest/bufret av rammeverket når validatoren kjører (samme begrensning
// gjelder base64-mønsteret: JSON-bodyen er allerede parset før zod ser
// lengden). Å håndheve grensen før hele forespørselen bufres krever en
// global body size-grense på serveren (nitro/Workers-nivå), som ikke finnes
// i dette repoet i dag og er utenfor denne oppgaven.
//
// Autorisasjon: annonsebilder sjekkes via RPC-en `can_upload_listing_image`
// (supabase/migrations/20260918100000_can_upload_listing_image.sql), som
// speiler `listing_images_write`/`listing_images_delete`-policyene i
// 20260902150000_storage_bucket_policies.sql. Avatar og organisasjonslogo
// bruker samme regler som `avatars_owner_insert` og
// `organization_logos_superuser_insert` krevde før migreringen til R2 — se
// kommentarene ved hver funksjon.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { ClientError } from "@/lib/to-client-error";
import { deleteObject, presignGetUrl, putObject } from "@/lib/r2.server";
import { pathFromPublicImageUrl, publicImageUrl } from "@/lib/image-url";
import { assertUserNotRateLimited } from "@/lib/rate-limit.server";
import {
  UUID_RE,
  assertServerSideImage,
  readServerSideImage,
  registerUpload,
  reserveUploadQuota,
} from "@/lib/upload-guards.server";
import {
  ATTACHMENT_URL_TTL_SECONDS,
  MAX_ATTACHMENT_PATHS_PER_REQUEST,
  extFromMime,
  thumbPathFor,
} from "@/lib/storage";

// {id}/{uuid}.{ext} — samme mønster for annonsebilder (id = listingId, se
// `thumbPathFor` for thumbnail-varianten) og meldingsvedlegg (id =
// conversationId, se uploadMessageAttachment).
const UUID_DIR_UUID_FILE_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$/i;
const AVATAR_PATH_RE = new RegExp(`^${UUID_RE}/avatar-${UUID_RE}\\.(jpg|png|webp|jxl)$`, "i");

function listingIdFromValidatedPath(path: string): string {
  return path.split("/", 1)[0];
}

export const uploadListingImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const listingId = formData.get("listingId");
    const file = formData.get("file");
    if (typeof listingId !== "string" || !z.guid().safeParse(listingId).success) {
      throw new ClientError("Ugyldig annonse-id", 400);
    }
    if (!(file instanceof File)) throw new ClientError("Mangler bildefil", 400);
    return { listingId, file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const { data: allowed, error } = await context.supabase.rpc("can_upload_listing_image", {
      _listing_id: data.listingId,
    });
    if (error) throw new Error("Kunne ikke sjekke tilgang til annonsen");
    if (!allowed)
      throw new ClientError("Du har ikke tilgang til å laste opp bilder til denne annonsen", 403);

    await assertUserNotRateLimited(context.userId, "standard_upload");
    const bytes = await readServerSideImage(data.file);
    await reserveUploadQuota(context.userId, data.file.size);
    const key = `${data.listingId}/${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await registerUpload("BILDER", key);
    await putObject("BILDER", key, bytes, data.file.type);
    return { path: key };
  });

export const uploadListingImageThumb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const path = formData.get("path");
    const file = formData.get("file");
    if (typeof path !== "string" || !UUID_DIR_UUID_FILE_PATH_RE.test(path)) {
      throw new ClientError("Ugyldig bildesti", 400);
    }
    if (!(file instanceof File)) throw new ClientError("Mangler miniatyrbilde", 400);
    return { path, file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const listingId = listingIdFromValidatedPath(data.path);
    const { data: allowed, error } = await context.supabase.rpc("can_upload_listing_image", {
      _listing_id: listingId,
    });
    if (error) throw new Error("Kunne ikke sjekke tilgang til annonsen");
    if (!allowed)
      throw new ClientError("Du har ikke tilgang til å laste opp bilder til denne annonsen", 403);

    await assertUserNotRateLimited(context.userId, "standard_upload");
    const bytes = await readServerSideImage(data.file);
    await reserveUploadQuota(context.userId, data.file.size);
    const key = thumbPathFor(data.path);
    await registerUpload("BILDER", key);
    await putObject("BILDER", key, bytes, data.file.type);
    return { ok: true as const };
  });

export const deleteListingImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ path: z.string().regex(UUID_DIR_UUID_FILE_PATH_RE, "Ugyldig bildesti") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const listingId = listingIdFromValidatedPath(data.path);
    // Samme betingelser som skrive-policyen (se can_upload_listing_image) —
    // listing_images_write og listing_images_delete var identiske i SQL-en
    // som ble erstattet.
    const { data: allowed, error } = await context.supabase.rpc("can_upload_listing_image", {
      _listing_id: listingId,
    });
    if (error) throw new Error("Kunne ikke sjekke tilgang til annonsen");
    if (!allowed) throw new ClientError("Du har ikke tilgang til å slette dette bildet", 403);

    await deleteObject("BILDER", data.path);
    await deleteObject("BILDER", thumbPathFor(data.path)).catch(() => {
      // Best-effort — eldre bilder har ikke nødvendigvis en thumbnail.
    });
    return { ok: true as const };
  });

// Avatar-bucketen er offentlig og eies av brukeren selv (avatars_owner_insert
// krevde bare at første path-segment var auth.uid()). Nøkkelen bygges her fra
// context.userId (fra den autentiserte sesjonen), aldri fra klientinput, så
// det er ingen ekstra tilgangssjekk å gjøre utover autentisering.
export const uploadAvatarImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ClientError("Mangler bildefil", 400);
    return { file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);
    await assertUserNotRateLimited(context.userId, "standard_upload");
    const bytes = await readServerSideImage(data.file);
    await reserveUploadQuota(context.userId, data.file.size);
    const key = `${context.userId}/avatar-${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await registerUpload("BILDER", key);
    await putObject("BILDER", key, bytes, data.file.type);
    return { url: publicImageUrl(key) };
  });

export const deletePreviousAvatarImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ previousPublicUrl: z.string().min(1).nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.previousPublicUrl) return { ok: true as const };
    const path = pathFromPublicImageUrl(data.previousPublicUrl);
    // Path-eierskap er den eneste autorisasjonen avatars_owner_delete krevde
    // — så vi håndhever nøyaktig det samme her, selv om dette er best-effort
    // opprydning (feil svelges, avataren er allerede byttet ut).
    if (!path || !AVATAR_PATH_RE.test(path) || path.split("/", 1)[0] !== context.userId) {
      return { ok: true as const };
    }
    await deleteObject("BILDER", path).catch(() => {});
    return { ok: true as const };
  });

type AttachmentConversation = ConversationOrganizationFields & {
  id: string;
  buyer_id: string;
  seller_id: string;
};

const ATTACHMENT_CONVERSATION_SELECT = `id, buyer_id, seller_id${CONVERSATION_ORGANIZATION_RELATION}`;

/** Samme deltakerregel som meldingene selv (messages-policyene og
 * send_message): kjøper, selger, eller en aktør med tilgang via annonsens eier. */
async function canUseConversationAttachments(
  supabase: SupabaseClient<Database>,
  userId: string,
  conversation: AttachmentConversation,
): Promise<boolean> {
  if (conversation.buyer_id === userId || conversation.seller_id === userId) return true;
  return organizationConversationAccess(supabase, userId, conversation);
}

// Meldingsvedlegg ligger i den private VEDLEGG-bucketen. Autorisasjonen
// følger meldingene: deltaker i samtalen som første path-segment peker på,
// eller bedriftsbruker med chattilgang (se canUseConversationAttachments).
export const uploadMessageAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const conversationId = formData.get("conversationId");
    const file = formData.get("file");
    if (typeof conversationId !== "string" || !z.guid().safeParse(conversationId).success) {
      throw new ClientError("Ugyldig samtale-id", 400);
    }
    if (!(file instanceof File)) throw new ClientError("Mangler vedleggsfil", 400);
    return { conversationId, file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const { data: conv, error } = await context.supabase
      .from("conversations")
      .select(ATTACHMENT_CONVERSATION_SELECT)
      .eq("id", data.conversationId)
      .maybeSingle<AttachmentConversation>();
    if (error) throw new Error("Kunne ikke sjekke tilgang til samtalen");
    if (!conv || !(await canUseConversationAttachments(context.supabase, context.userId, conv))) {
      throw new ClientError("Du er ikke deltaker i denne samtalen", 403);
    }
    const otherPartyId = conv.buyer_id === context.userId ? conv.seller_id : conv.buyer_id;
    const { data: blocked, error: blockError } = await context.supabase.rpc("is_blocked_between", {
      _a: context.userId,
      _b: otherPartyId,
      _conversation_id: data.conversationId,
    });
    if (blockError) throw new Error("Kunne ikke sjekke blokkering mellom brukerne");
    if (blocked !== false) {
      throw new ClientError("Vedlegg kan ikke sendes mellom blokkerte brukere", 403);
    }

    await assertUserNotRateLimited(context.userId, "standard_upload");
    const bytes = await readServerSideImage(data.file);
    await reserveUploadQuota(context.userId, data.file.size);
    const key = `${data.conversationId}/${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await registerUpload("VEDLEGG", key);
    await putObject("VEDLEGG", key, bytes, data.file.type);
    return { path: key };
  });

// Returnerer presignerte GET-URL-er kun for stiene brukeren faktisk har
// tilgang til (samme regel som uploadMessageAttachment). Stier
// brukeren ikke har tilgang til utelates i stedet for å kaste, siden en
// liste kan inneholde vedlegg fra flere samtaler.
export const signMessageAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        // Grense for å hindre at en klient sender vilkårlig mange stier inn i
        // én `.in()`-spørring og presign-løkke.
        paths: z
          .array(z.string().regex(UUID_DIR_UUID_FILE_PATH_RE))
          .max(MAX_ATTACHMENT_PATHS_PER_REQUEST, "For mange vedlegg i én forespørsel"),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }): Promise<Record<string, string>> => {
    const conversationIds = Array.from(new Set(input.paths.map((p) => p.split("/", 1)[0])));
    if (conversationIds.length === 0) return {};

    const { data, error } = await context.supabase
      .from("conversations")
      .select(ATTACHMENT_CONVERSATION_SELECT)
      .in("id", conversationIds);
    if (error) throw new Error("Kunne ikke sjekke tilgang til samtalene");
    const convs = (data ?? []) as unknown as AttachmentConversation[];

    // Samme eier gir samme svar: ett kall per kombinasjon, ikke per samtale
    // (Worker-grensen for underforespørsler).
    const accessByListing = new Map<string, Promise<boolean>>();
    const access = await Promise.all(
      convs.map(async (c) => {
        const cacheKey =
          c.buyer_id === context.userId || c.seller_id === context.userId
            ? null
            : organizationConversationAccessKey(c);
        let allowed = cacheKey ? accessByListing.get(cacheKey) : undefined;
        if (!allowed) {
          allowed = canUseConversationAttachments(context.supabase, context.userId, c);
          if (cacheKey) accessByListing.set(cacheKey, allowed);
        }
        return (await allowed) ? c.id : null;
      }),
    );
    const allowedConversationIds = new Set(access.filter((id): id is string => id !== null));

    const allowedPaths = input.paths.filter((p) => allowedConversationIds.has(p.split("/", 1)[0]));
    const urls = await Promise.all(
      allowedPaths.map((path) => presignGetUrl("VEDLEGG", path, ATTACHMENT_URL_TTL_SECONDS)),
    );
    return Object.fromEntries(allowedPaths.map((path, i) => [path, urls[i]]));
  });
