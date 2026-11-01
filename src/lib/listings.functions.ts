import {
  LISTING_OWNER_COLUMNS,
  assertCategoryChangeAllowed,
  assertDraftOwner,
  assertDraftRepublishAllowed,
  authorizeListingOwner,
  draftOwnerPatch,
  listingOwnershipInputShape,
  newListingOwner,
  publishOwnerPatch,
  type ListingOwnerFields,
} from "@/lib/listing-ownership.server";
import { assertDraftActor } from "@/lib/draft-actor";
import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { ClientError, toClientError } from "@/lib/to-client-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  attributesSchema,
  effectiveFiltersForCategory,
  findNonNumericAttribute,
  normalizeNumericAttributes,
  findInvalidDateAttribute,
  getMissingRequiredFilters,
  normalizeFilter,
  isBoatCategory,
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_MODEL_IDS_KEY,
  PART_FITMENT_YEAR_FROM_KEY,
  PART_FITMENT_YEAR_TO_KEY,
  valueGroupFor,
  type CategoryNode,
} from "@/lib/category-filters";
import { getCategoryBehavior, type CategoryBehavior } from "@/lib/category-behavior";
import { equipmentFilterKeys } from "@/lib/verticals";
import { assertUserNotRateLimited } from "@/lib/rate-limit.server";
import {
  effectiveFlowForCategory,
  type CategoryFlowRow,
} from "@/features/listing-creation/category-flows";
import { validateRequiredFieldGroups } from "@/features/listing-creation/field-groups/validators";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { MAX_LISTING_PRICE_NOK } from "@/lib/constants";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { requireAdminRole } from "@/lib/admin-auth.server";

const LISTING_CREATE_LIMIT_MESSAGE =
  "Du har opprettet for mange annonser den siste timen. Prøv igjen senere.";
const LISTING_PUBLISH_LIMIT_MESSAGE =
  "Du har publisert for mange annonser den siste timen. Prøv igjen senere.";

type ListingMutationRow = ListingOwnerFields & {
  id: string;
  kaupet_code: string;
  seller_id: string;
  status: "disabled" | "active" | "expired" | "draft" | "sold" | "archived";
  title: string | null;
  description: string | null;
  condition: string | null;
  can_ship: boolean | null;
  postal_code: string | null;
  city: string | null;
  is_free: boolean;
  price_nok: number | null;
  category_id: string | null;
  attributes: unknown;
  updated_at: string;
};

async function authorizeListingMutation(
  supabaseAdmin: SupabaseClient,
  userId: string,
  listingId: string,
): Promise<ListingMutationRow> {
  const { data: listing, error } = await supabaseAdmin
    .from("listings")
    .select(
      `id, kaupet_code, seller_id${LISTING_OWNER_COLUMNS}, status, title, description, condition, can_ship, postal_code, city, is_free, price_nok, category_id, attributes, updated_at`,
    )
    .eq("id", listingId)
    .maybeSingle();
  if (error) {
    throw await toClientError("database", error);
  }
  if (!listing) throw new ClientError("Annonsen finnes ikke.", 404);
  await authorizeListingOwner(supabaseAdmin, userId, listing);
  return listing;
}

async function assertListingCreationAllowed(userId: string, message: string) {
  await assertUserNotRateLimited(userId, "listing_creation", message);
}

function validatePartFitment(
  categoryId: string,
  filters: ReturnType<typeof normalizeFilter>[],
  categoriesById: Map<string, CategoryNode>,
  attributes: Record<string, string | number | boolean | string[]>,
) {
  const isPartCategory = effectiveFiltersForCategory(categoryId, filters, categoriesById).some(
    (filter) => filter.key === PART_FITMENT_SCOPE_KEY,
  );
  if (!isPartCategory) return;

  const scope = attributes[PART_FITMENT_SCOPE_KEY];
  if (scope !== "universal" && scope !== "specific" && scope !== "unknown") {
    throw new ClientError("Velg hvordan delen passer til kjøretøy.", 400);
  }
  if (scope !== "specific") return;

  const modelIds = attributes[PART_FITMENT_MODEL_IDS_KEY];
  if (
    !Array.isArray(modelIds) ||
    modelIds.length === 0 ||
    modelIds.some((id) => !/^[0-9a-f-]{36}$/iu.test(id))
  ) {
    throw new ClientError("Legg til minst én gyldig bilmodell.", 400);
  }

  const yearFrom = attributes[PART_FITMENT_YEAR_FROM_KEY];
  const yearTo = attributes[PART_FITMENT_YEAR_TO_KEY];
  if (typeof yearFrom === "number" && typeof yearTo === "number" && yearFrom > yearTo) {
    throw new ClientError("Årsmodell fra kan ikke være høyere enn årsmodell til.", 400);
  }
}
function assertAttributeFormats(
  categoryId: string | null,
  filters: ReturnType<typeof normalizeFilter>[],
  categoriesById: Map<string, CategoryNode>,
  attributes: Record<string, unknown>,
  behavior: CategoryBehavior,
) {
  const invalid = findNonNumericAttribute(categoryId, filters, categoriesById, attributes);
  if (invalid) throw new ClientError(`${invalid.label_nb} må være et tall.`, 400);
  const invalidDate = findInvalidDateAttribute(
    categoryId,
    filters,
    categoriesById,
    attributes,
    behavior.extraDateAttributes,
  );
  if (invalidDate) throw new ClientError(`${invalidDate.label_nb} må være en gyldig dato.`, 400);
}

/** Kategorireglene annonsevalideringene trenger. Uten dem kan vi ikke vite
 * hva som er påkrevd: kast i stedet for å validere mot tomme regler og
 * publisere en ufullstendig annonse. Hentes side for side, ellers
 * kapper PostgREST ved 1000 rader og påkrevde felt faller ut. */
async function loadCategoryRules(supabaseAdmin: SupabaseClient, scope: string) {
  const [filters, categories, flows] = await Promise.all([
    fetchAllPages((from, to) =>
      supabaseAdmin
        .from("category_filters")
        .select(
          "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional",
        )
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabaseAdmin.from("categories").select("id, parent_id").order("id").range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabaseAdmin
        .from("category_flows")
        .select("id, category_id, field_groups, sort_order")
        .order("id")
        .range(from, to),
    ),
  ]);
  const rulesError = filters.error ?? categories.error ?? flows.error;
  if (rulesError) throw await toClientError(scope, rulesError);
  return {
    normalizedFilters: (filters.data ?? []).map(normalizeFilter),
    categoriesById: new Map<string, CategoryNode>(
      (categories.data ?? []).map((c) => [c.id as string, c as CategoryNode]),
    ),
    flowRows: (flows.data ?? []) as CategoryFlowRow[],
  };
}

async function validateExistingListingForPublish(
  supabaseAdmin: SupabaseClient,
  listing: ListingMutationRow,
  loadedRules?: Awaited<ReturnType<typeof loadCategoryRules>>,
) {
  const titleLength = listing.title?.trim().length ?? 0;
  if (titleLength < 5) throw new ClientError("Tittelen må være minst 5 tegn.", 400);
  if (titleLength > 120) throw new ClientError("Tittelen kan ikke være lengre enn 120 tegn.", 400);
  const descriptionLength = listing.description?.trim().length ?? 0;
  if (descriptionLength < 20) throw new ClientError("Beskrivelsen må være minst 20 tegn.", 400);
  if (descriptionLength > 4000)
    throw new ClientError("Beskrivelsen kan ikke være lengre enn 4000 tegn.", 400);
  if (!listing.category_id) throw new ClientError("Velg en kategori før annonsen publiseres.", 400);
  if (!listing.postal_code || !/^\d{4}$/.test(listing.postal_code)) {
    throw new ClientError("Oppgi et gyldig postnummer før annonsen publiseres.", 400);
  }
  if (!listing.city?.trim()) throw new ClientError("Oppgi sted før annonsen publiseres.", 400);
  if (
    !listing.is_free &&
    (listing.price_nok == null ||
      !Number.isInteger(listing.price_nok) ||
      listing.price_nok < 0 ||
      listing.price_nok > MAX_LISTING_PRICE_NOK)
  ) {
    throw new ClientError("Oppgi en gyldig pris før annonsen publiseres.", 400);
  }
  if (
    listing.condition !== null &&
    !["new", "like_new", "good", "acceptable", "for_parts"].includes(listing.condition)
  ) {
    throw new ClientError("Annonsens tilstand er ugyldig.", 400);
  }

  const { normalizedFilters, categoriesById, flowRows } =
    loadedRules ?? (await loadCategoryRules(supabaseAdmin, "republishListing.rules"));
  const categoryBehavior = getCategoryBehavior(
    valueGroupFor(listing.category_id, normalizedFilters, categoriesById),
    isBoatCategory(listing.category_id, normalizedFilters, categoriesById),
  );
  const attributesResult = attributesSchema.safeParse(listing.attributes ?? {});
  if (!attributesResult.success) throw new ClientError("Annonsens attributter er ugyldige.", 400);
  const attributes = normalizeNumericAttributes(
    listing.category_id,
    normalizedFilters,
    categoriesById,
    attributesResult.data,
  );
  assertAttributeFormats(
    listing.category_id,
    normalizedFilters,
    categoriesById,
    attributes,
    categoryBehavior,
  );

  if (categoryBehavior.requiresCategoryFilterValues) {
    const missing = getMissingRequiredFilters(
      listing.category_id,
      normalizedFilters,
      categoriesById,
      attributes,
      [...equipmentFilterKeys(), ...categoryBehavior.requiredFilterExclusions],
    );
    if (missing.length > 0) {
      throw new Error(`Fyll inn: ${missing.map((filter) => filter.label_nb).join(", ")}`);
    }
    validatePartFitment(listing.category_id, normalizedFilters, categoriesById, attributes);
  }

  const { fieldGroups } = effectiveFlowForCategory(listing.category_id, flowRows, categoriesById);
  const fieldGroupError = validateRequiredFieldGroups(
    fieldGroups,
    { condition: listing.condition, can_ship: listing.can_ship },
    categoryBehavior,
  );
  if (fieldGroupError) throw new Error(fieldGroupError);
  return attributes;
}

const listingImageRefsSchema = z
  .array(
    z.object({
      id: z.guid(),
      storage_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|jxl)$/iu),
      sort_order: z.number().int().min(0).max(99),
      caption: z.string().trim().max(140).nullable(),
      ai_generated: z.boolean().optional(),
    }),
  )
  .max(100);

/** Knytter allerede opplastede bilder til et serverutkast, med samme
 * avstemming som publiseringen (sync_listing_images). */
export const syncDraftListingImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        expected_user_id: z.guid().optional(),
        draftId: z.guid(),
        images: listingImageRefsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertDraftActor(data.expected_user_id, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: result, error } = await supabaseAdmin.rpc("sync_draft_listing_images", {
      _listing_id: data.draftId,
      _user_id: context.userId,
      _images: data.images,
    });
    if (error) throw await toClientError("database", error);
    return z.object({ already_published: z.boolean() }).parse(result);
  });

export const saveDraftListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        expected_user_id: z.guid().optional(),
        ...listingOwnershipInputShape,
        id: z.guid().optional(),
        expected_updated_at: z.string().datetime({ offset: true }).optional(),
        title: z.string().trim().min(1).max(120),
        subtitle: z.string().trim().max(80).nullable().optional(),
        description: z.string().trim().max(4000).optional(),
        category_id: z.guid().nullable().optional(),
        condition: z
          .enum(["new", "like_new", "good", "acceptable", "for_parts"])
          .nullable()
          .optional(),
        is_free: z.boolean().optional(),
        price_nok: z.number().int().min(0).max(MAX_LISTING_PRICE_NOK).nullable().optional(),
        postal_code: z
          .string()
          .regex(/^\d{4}$/)
          .nullable()
          .optional(),
        city: z.string().max(100).nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        can_ship: z.boolean().nullable().optional(),
        known_issues: z.string().trim().max(2000).nullable().optional(),
        no_known_issues: z.boolean().nullable().optional(),
        maintenance_history: z.string().trim().max(2000).nullable().optional(),
        attributes: attributesSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertDraftActor(data.expected_user_id, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { userId } = context;

    const fields = {
      title: data.title,
      ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category_id !== undefined && { category_id: data.category_id }),
      ...(data.condition !== undefined && { condition: data.condition }),
      ...(data.is_free !== undefined && { is_free: data.is_free }),
      ...(data.price_nok !== undefined && { price_nok: data.is_free ? null : data.price_nok }),
      ...(data.postal_code !== undefined && { postal_code: data.postal_code }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.lat !== undefined && { lat: data.lat }),
      ...(data.lng !== undefined && { lng: data.lng }),
      ...(data.can_ship !== undefined && { can_ship: data.can_ship }),
      ...(data.known_issues !== undefined && { known_issues: data.known_issues }),
      ...(data.no_known_issues !== undefined && { no_known_issues: !!data.no_known_issues }),
      ...(data.maintenance_history !== undefined && {
        maintenance_history: data.maintenance_history,
      }),
      ...(data.attributes !== undefined && { attributes: data.attributes }),
    };

    if (data.id) {
      const existing = await authorizeListingMutation(supabaseAdmin, userId, data.id);
      assertDraftOwner(data, existing);
      // A lost publish response must not turn the active listing back into a draft.
      if (existing.status === "active") {
        return {
          id: existing.id,
          kaupet_code: existing.kaupet_code,
          updated_at: existing.updated_at,
          published: true as const,
        };
      }
      const ownerPatch = await draftOwnerPatch(
        supabaseAdmin,
        userId,
        existing,
        data.category_id !== undefined ? data.category_id : existing.category_id,
        data,
      );
      let query = supabaseAdmin
        .from("listings")
        .update({
          ...fields,
          ...ownerPatch,
          draft_expiry_notified_at: null,
        })
        .eq("id", data.id)
        .eq("status", "draft");
      // No local version to check against yet (e.g. a draft saved before
      // version tracking existed) — update unconditionally instead of
      // reporting a conflict that never actually happened.
      if (data.expected_updated_at) {
        query = query.eq("updated_at", data.expected_updated_at);
      }
      const { data: updated, error } = await query
        .select("id, kaupet_code, updated_at")
        .maybeSingle();
      if (error) {
        throw await toClientError("saveDraftListing.update", error, { listing_id: data.id });
      }
      if (!updated) {
        const latest = await authorizeListingMutation(supabaseAdmin, userId, data.id);
        return { conflict: true as const, updated_at: latest.updated_at };
      }
      return {
        id: updated.id as string,
        kaupet_code: updated.kaupet_code as string,
        updated_at: updated.updated_at as string,
      };
    }

    const owner = await newListingOwner(supabaseAdmin, userId, data.category_id ?? null, data);
    await assertListingCreationAllowed(userId, LISTING_CREATE_LIMIT_MESSAGE);

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({
        ...owner,
        status: "draft",
        ...fields,
      })
      .select("id, kaupet_code, updated_at")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return {
      id: listing.id as string,
      kaupet_code: listing.kaupet_code as string,
      updated_at: listing.updated_at as string,
    };
  });

export const discardDraftListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.guid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    await authorizeListingMutation(supabaseAdmin, context.userId, data.id);
    const { error } = await supabaseAdmin
      .from("listings")
      .delete()
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) {
      throw await toClientError("database", error);
    }
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        expected_user_id: z.guid().optional(),
        ...listingOwnershipInputShape,
        images: listingImageRefsSchema.optional(),
        draftId: z.guid().optional(),
        title: z.string().trim().min(5).max(120),
        subtitle: z.string().trim().max(80).nullable().optional(),
        description: z.string().trim().min(20).max(4000),
        category_id: z.guid(),
        condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]).nullable(),
        is_free: z.boolean(),
        price_nok: z.number().int().min(0).max(MAX_LISTING_PRICE_NOK).nullable(),
        postal_code: z
          .string()
          .regex(/^\d{4}$/)
          .nullable(),
        city: z.string().max(100).nullable(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        can_ship: z.boolean().nullable(),
        known_issues: z.string().trim().max(2000).nullable().optional(),
        no_known_issues: z.boolean().nullable().optional(),
        maintenance_history: z.string().trim().max(2000).nullable().optional(),
        attributes: attributesSchema.optional(),
        turnstileToken: z.string().nullable().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.images !== undefined && !data.draftId) {
          ctx.addIssue({
            code: "custom",
            path: ["draftId"],
            message: "Bildene må tilhøre et utkast.",
          });
        }
        if (!data.is_free && data.price_nok == null) {
          ctx.addIssue({
            code: "custom",
            path: ["price_nok"],
            message: "Oppgi en pris før annonsen publiseres.",
          });
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertDraftActor(data.expected_user_id, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { userId } = context;
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);

    const { normalizedFilters, categoriesById, flowRows } = await loadCategoryRules(
      supabaseAdmin,
      "database",
    );
    const attributes = normalizeNumericAttributes(
      data.category_id,
      normalizedFilters,
      categoriesById,
      data.attributes ?? {},
    );
    const categoryBehavior = getCategoryBehavior(
      valueGroupFor(data.category_id, normalizedFilters, categoriesById),
      isBoatCategory(data.category_id, normalizedFilters, categoriesById),
    );
    const missing = categoryBehavior.requiresCategoryFilterValues
      ? getMissingRequiredFilters(data.category_id, normalizedFilters, categoriesById, attributes, [
          ...equipmentFilterKeys(),
          ...categoryBehavior.requiredFilterExclusions,
        ])
      : [];
    if (missing.length > 0) {
      throw new Error(`Fyll inn: ${missing.map((f) => f.label_nb).join(", ")}`);
    }
    assertAttributeFormats(
      data.category_id,
      normalizedFilters,
      categoriesById,
      attributes,
      categoryBehavior,
    );
    if (categoryBehavior.requiresCategoryFilterValues) {
      validatePartFitment(data.category_id, normalizedFilters, categoriesById, attributes);
    }

    const { fieldGroups } = effectiveFlowForCategory(data.category_id, flowRows, categoriesById);
    const fieldGroupError = validateRequiredFieldGroups(
      fieldGroups,
      {
        condition: data.condition,
        can_ship: data.can_ship,
      },
      categoryBehavior,
    );
    if (fieldGroupError) throw new Error(fieldGroupError);

    const listingFields = {
      title: data.title,
      subtitle: data.subtitle || null,
      description: data.description,
      category_id: data.category_id,
      condition: data.condition,
      is_free: data.is_free,
      price_nok: data.is_free ? null : data.price_nok,
      postal_code: data.postal_code,
      city: data.city,
      lat: data.lat,
      lng: data.lng,
      can_ship: data.can_ship,
      known_issues: data.known_issues ?? null,
      no_known_issues: !!data.no_known_issues,
      maintenance_history: data.maintenance_history ?? null,
      ...(data.attributes !== undefined && { attributes }),
      status: "active" as const,
      published_at: new Date().toISOString(),
    };
    if (data.draftId) {
      const existing = await authorizeListingMutation(supabaseAdmin, userId, data.draftId);
      assertDraftOwner(data, existing);
      if (existing.status === "active") {
        return { id: existing.id, kaupet_code: existing.kaupet_code, already_published: true };
      }
      // Draft updates never re-check creation rights, so publishing must.
      const ownerPatch = await publishOwnerPatch(
        supabaseAdmin,
        userId,
        existing,
        data.category_id,
        data,
      );
      if (data.images !== undefined) {
        const { data: result, error } = await supabaseAdmin.rpc("publish_listing_draft", {
          _listing_id: data.draftId,
          _user_id: userId,
          _fields: { ...listingFields, ...ownerPatch },
          _images: data.images,
        });
        if (error) throw await toClientError("database", error);
        return z
          .object({
            id: z.guid(),
            kaupet_code: z.string(),
            already_published: z.boolean(),
          })
          .parse(result);
      }
      const { data: listing, error } = await supabaseAdmin
        .from("listings")
        .update({ ...listingFields, ...ownerPatch })
        .eq("id", data.draftId)
        .eq("status", "draft")
        .select("id, kaupet_code")
        .maybeSingle();
      if (error) throw await toClientError("database", error);
      if (!listing) {
        const latest = await authorizeListingMutation(supabaseAdmin, userId, data.draftId);
        assertDraftOwner(data, latest);
        if (latest.status === "active")
          return { id: latest.id, kaupet_code: latest.kaupet_code, already_published: true };
        throw new ClientError("Utkastet kan ikke publiseres i denne tilstanden.", 409);
      }
      return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
    }

    const owner = await newListingOwner(supabaseAdmin, userId, data.category_id, data);
    await assertListingCreationAllowed(userId, LISTING_PUBLISH_LIMIT_MESSAGE);

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .insert({
        ...owner,
        ...listingFields,
      })
      .select("id, kaupet_code")
      .single();
    if (error) {
      throw await toClientError("database", error);
    }
    return { id: listing.id as string, kaupet_code: listing.kaupet_code as string };
  });

export const republishListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.guid(),
        turnstileToken: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);

    const { userId } = context;
    const listing = await authorizeListingMutation(supabaseAdmin, userId, data.id);

    if (listing.status === "disabled") {
      throw new ClientError(
        "Denne annonsen er deaktivert av moderator og kan ikke reaktiveres",
        409,
      );
    }
    if (!["draft", "archived", "sold", "expired"].includes(listing.status)) {
      throw new ClientError("Annonsen kan ikke publiseres på nytt fra denne statusen.", 409);
    }
    const attributes = await validateExistingListingForPublish(supabaseAdmin, listing);
    if (listing.status !== "draft") {
      await assertListingCreationAllowed(userId, LISTING_PUBLISH_LIMIT_MESSAGE);
    } else {
      await assertDraftRepublishAllowed(supabaseAdmin, userId, listing);
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("listings")
      .update({
        attributes,
        status: "active",
        published_at: now,
        expires_at: expiresAt,
      })
      .eq("id", data.id)
      .eq("status", listing.status)
      .eq("updated_at", listing.updated_at)
      .select("id, status, published_at, expires_at")
      .maybeSingle();
    if (error) {
      throw await toClientError("republishListing.update", error, { listing_id: data.id });
    }
    // Ingen rad: annonsen ble endret (eller fikk ny status) etter at den ble
    // validert, så publiseringen hadde vært basert på utdaterte data.
    if (!updated) {
      throw new ClientError("Annonsen ble endret samtidig. Last siden på nytt og prøv igjen.", 409);
    }

    return updated;
  });

export const updateListingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.guid(),
        status: z.enum(["archived", "sold"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const listing = await authorizeListingMutation(supabaseAdmin, context.userId, data.id);
    if (listing.status === "disabled") {
      throw new ClientError("Denne annonsen er deaktivert av moderator", 409);
    }
    if (listing.status !== "active") {
      throw new ClientError("Bare aktive annonser kan endre status.", 409);
    }
    const { data: updated, error } = await supabaseAdmin
      .from("listings")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("status", "active")
      .select("id, status")
      .single();
    if (error) {
      throw await toClientError("updateListingStatus", error, { listing_id: data.id });
    }
    return updated;
  });

export const getListingKaupetCodeById = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ listing_id: z.guid() }).parse(input))
  .handler(async ({ data }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    // Unauthenticated (legacy /annonse/:id → /$kaupetCode redirect), so this
    // must not use service-role to reveal a draft/disabled listing's code —
    // same visibility RLS gives everyone else.
    // Synligheten er listing_is_public (aktiv, eller solgt de siste 30
    // dagene), samme kontrakt som RLS og /$kaupetCode.
    const { data: row, error } = await supabaseAdmin
      .from("listings")
      .select("kaupet_code, status, sold_at")
      .eq("id", data.listing_id)
      .in("status", ["active", "sold"])
      .maybeSingle();
    if (error) {
      throw await toClientError("database", error);
    }
    if (!row) return { kaupet_code: null };
    const { data: isPublic, error: publicError } = await supabaseAdmin.rpc("listing_is_public", {
      _status: row.status,
      _sold_at: row.sold_at,
    });
    if (publicError) {
      throw await toClientError("database", publicError);
    }
    return { kaupet_code: isPublic === true ? row.kaupet_code : null };
  });

/**
 * Lagrer attributter (og ev. ny kategori) for en eksisterende annonse fra
 * inline-redigeringen. Samme tall-/datokontroll som opprettelse og
 * publisering; skrivingen går som brukeren, så RLS avgjør tilgang og
 * hvilken kategori annonsen kan flyttes til.
 */
export const updateListingAttributes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.guid(),
        attributes: z.record(z.string(), z.unknown()).optional().default({}),
        /** Nøkler brukeren har tømt. */
        removedKeys: z.array(z.string()).optional(),
        /** Satt ved kategoribytte: attributtene erstattes i stedet for å flettes. */
        category_id: z.guid().optional(),
        condition: z
          .enum(["new", "like_new", "good", "acceptable", "for_parts"])
          .nullable()
          .optional(),
        can_ship: z.boolean().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const current = await authorizeListingMutation(supabaseAdmin, context.userId, data.id);
    if (current.status === "disabled") {
      throw new ClientError("Denne annonsen er deaktivert av moderator", 409);
    }
    const categoryId = data.category_id ?? current.category_id;
    if (data.category_id && data.category_id !== current.category_id) {
      await assertCategoryChangeAllowed(supabaseAdmin, context.userId, current, data.category_id);
    }
    const categoryRules = await loadCategoryRules(supabaseAdmin, "database");
    const { normalizedFilters, categoriesById } = categoryRules;
    // Bare det brukeren sender valideres: en eldre ugyldig verdi i et annet
    // felt skal ikke sperre redigering av resten.
    const patch = normalizeNumericAttributes(
      categoryId,
      normalizedFilters,
      categoriesById,
      data.attributes,
    );
    assertAttributeFormats(
      categoryId,
      normalizedFilters,
      categoriesById,
      patch,
      getCategoryBehavior(
        valueGroupFor(categoryId, normalizedFilters, categoriesById),
        isBoatCategory(categoryId, normalizedFilters, categoriesById),
      ),
    );

    let attributes: Record<string, unknown> = patch;
    if (!data.category_id) {
      // Flere inline-paneler skriver til samme JSON-kolonne, så flett med
      // det som ligger der.
      attributes = { ...((current.attributes as Record<string, unknown>) ?? {}), ...patch };
      for (const key of data.removedKeys ?? []) {
        if (!(key in patch)) delete attributes[key];
      }
    }

    const condition = data.condition !== undefined ? data.condition : current.condition;
    const canShip = data.can_ship !== undefined ? data.can_ship : current.can_ship;
    if (current.status === "active" || current.status === "sold") {
      attributes = await validateExistingListingForPublish(
        supabaseAdmin,
        {
          ...current,
          category_id: categoryId,
          attributes,
          condition,
          can_ship: canShip,
        },
        categoryRules,
      );
    }

    // Autorisasjon og validering må gjelde samme annonseversjon.
    const { data: updated, error } = await supabaseAdmin
      .from("listings")
      .update({
        attributes: attributes as Json,
        ...(data.category_id && { category_id: data.category_id }),
        ...(data.condition !== undefined && { condition: data.condition }),
        ...(data.can_ship !== undefined && { can_ship: data.can_ship }),
      })
      .eq("id", data.id)
      .eq("updated_at", current.updated_at)
      .eq("status", current.status)
      .select("id")
      .maybeSingle();
    if (error) throw await toClientError("updateListingAttributes", error, { listing_id: data.id });
    if (!updated) {
      throw new ClientError("Endringen ble ikke lagret. Last siden på nytt og prøv igjen.", 409);
    }
  });

/** Category deletion validates public rows before an atomic, version-checked move. */
export const adminReplaceListingCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ category_id: z.guid(), replacement_category_id: z.guid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdminRole(context.supabase, context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: listings, error } = await fetchAllPages((from, to) =>
      supabaseAdmin
        .from("listings")
        .select(
          `id, kaupet_code, seller_id${LISTING_OWNER_COLUMNS}, status, title, description, condition, can_ship, postal_code, city, is_free, price_nok, category_id, attributes, updated_at`,
        )
        .eq("category_id", data.category_id)
        .order("id")
        .range(from, to),
    );
    if (error) throw await toClientError("adminReplaceListingCategory.read", error);

    const publicListings = (listings ?? []).filter(
      (listing) => listing.status === "active" || listing.status === "sold",
    );
    const loadedRules = publicListings.length
      ? await loadCategoryRules(supabaseAdmin, "adminReplaceListingCategory.rules")
      : undefined;
    const validatedAttributes = new Map<string, Record<string, unknown>>();
    for (const listing of publicListings) {
      validatedAttributes.set(
        listing.id,
        await validateExistingListingForPublish(
          supabaseAdmin,
          { ...listing, category_id: data.replacement_category_id },
          loadedRules,
        ),
      );
    }

    const { error: moveError } = await supabaseAdmin.rpc("admin_replace_listing_category", {
      _category_id: data.category_id,
      _replacement_category_id: data.replacement_category_id,
      _expected_rows: (listings ?? []).map((listing) => ({
        id: listing.id,
        status: listing.status,
        updated_at: listing.updated_at,
        ...(validatedAttributes.has(listing.id) && {
          attributes: validatedAttributes.get(listing.id),
        }),
      })) as unknown as Json,
    });
    if (moveError) {
      if (moveError.code === "PT409") {
        throw new ClientError(
          "En annonse ble endret samtidig. Last siden på nytt og prøv igjen.",
          409,
        );
      }
      throw await toClientError("adminReplaceListingCategory.update", moveError);
    }
  });
