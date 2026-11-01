import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CreateDemoUserDialog, DEMO_USERS_AVAILABLE } from "@/components/create-demo-user-dialog";
import { DefaultSearchExamplesCard } from "@/components/admin/categories/default-search-examples-card";
import { FilterSynonymsDialog } from "@/components/admin/categories/filter-synonyms-dialog";
import { SuggestValuesButton } from "@/components/admin/categories/suggest-values-button";
import { SearchInterpretation } from "@/features/listing-search/search-interpretation";
import { SearchSuggestionsLayer } from "@/features/listing-search/search-suggestions-layer";
import { useTextToFilterPipeline } from "@/features/listing-search/use-text-to-filter-pipeline";
import type { CategoryFilter } from "@/lib/category-filters";
import { SYNONYM_ELIGIBLE_TYPES } from "@/components/admin/categories/synonym-availability";
import { conversationWtbListingId, WTB_CONVERSATION_COLUMN } from "@/features/wtb/availability";
import {
  CONVERSATION_RESERVATION_COLUMN,
  conversationHoldsReservation,
  LISTING_RESERVATION_COLUMN,
  listingReservedUntil,
  TRADE_AVAILABLE,
} from "@/components/meldinger/trade-availability";
import {
  applyOffer,
  fetchOfferComment,
  MESSAGE_OFFER_COLUMN,
  messageOfferId,
  subscribeOfferChanges,
  type Offer,
} from "@/components/meldinger/offers";
import { resolveTextToFilters } from "@/features/listing-search/resolve-text-to-filters";
import type { AppliedSearchState } from "@/features/listing-search/search-schema";
import { buildStructuredSearchSuggestions } from "@/features/listing-search/structured-search-suggestions";
import { useBrandCategoryCandidate } from "@/features/listing-search/use-brand-category-candidate";
import {
  bestZeroResultExpansions,
  buildZeroResultCandidates,
  useZeroResultExpansion,
} from "@/features/listing-search/zero-result-expansion";
import { fetchListingReservations, withReservations } from "@/hooks/use-listing-reservations";
import { useNativePromotionAllowed } from "@/hooks/use-native-promotion-allowed";
import { prefetchCategorySuggestion } from "./category-suggestion.functions";
import { countSalesBySeller } from "./sales.functions";
import {
  escapeRegExp,
  matchAttributeOptionPhrase,
  matchBrandPhrase,
  matchCategoryPhrase,
} from "./search-category-match";
import {
  parseNumericFilters,
  parsePriceFilters,
  removeNumericMatches,
} from "./search-number-parser";
import { stripFillerWords } from "./search-stopwords";
import { SEARCH_SUGGESTIONS } from "./search-suggestions";
import {
  CONVERSATION_ORGANIZATION_RELATION,
  organizationConversationAccess,
  organizationConversationAccessKey,
} from "./organization-access.server";
import {
  LISTING_OWNER_COLUMNS,
  authorizeListingOwner,
  draftOwnerPatch,
  newListingOwner,
  publishOwnerPatch,
} from "./listing-ownership.server";
import { conversationOrganizations } from "./conversation-organizations";
import { listingBusinessData } from "./listing-business-data";
import { hasBusinessAccount, verifiedAccountDestination } from "./business-auth";
import {
  createSavedSearch,
  listSavedSearches,
  listPriceDrops,
  listSoldNotifications,
} from "./saved-searches";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("Open skal ikke slå opp private tabeller");
      },
    },
  ),
}));

describe("Open-grenser uten private tjenester", () => {
  it.each(["", "ukjent", "æøå 👋"])("gir ikke bedriftsrettigheter for %s", async (id) => {
    const client = {} as Parameters<typeof organizationConversationAccess>[0];
    await expect(organizationConversationAccess(client, id, {})).resolves.toBe(false);
    expect(organizationConversationAccessKey({})).toBeNull();
    expect(CONVERSATION_ORGANIZATION_RELATION).toBe("");
    // Eieren er alltid privatpersonen: ingen bedriftskolonner, ingen lokasjon.
    expect(LISTING_OWNER_COLUMNS).toBe("");
    const admin = {} as Parameters<typeof newListingOwner>[0];
    await expect(newListingOwner(admin, id, null, {})).resolves.toEqual({ seller_id: id });
    await expect(draftOwnerPatch(admin, id, {}, null, {})).resolves.toEqual({});
    await expect(publishOwnerPatch(admin, id, {}, id, {})).resolves.toEqual({});
    await expect(authorizeListingOwner(admin, id, { seller_id: id })).resolves.toBeUndefined();
    await expect(authorizeListingOwner(admin, id, { seller_id: `${id}x` })).rejects.toMatchObject({
      status: 403,
    });
    await expect(hasBusinessAccount(id)).resolves.toBe(false);
    await expect(verifiedAccountDestination(id)).resolves.toBe("/");
  });

  it("leser ingen bedriftstabell for samtaler eller annonser", async () => {
    await expect(conversationOrganizations([null, undefined, "bedrift"])).resolves.toEqual(
      new Map(),
    );
    await expect(listingBusinessData("annonse", "bedrift")).resolves.toBeNull();
  });

  it("returnerer tomme private varslingslister og avviser nye lagrede søk", async () => {
    await expect(listSavedSearches()).resolves.toEqual([]);
    await expect(listPriceDrops()).resolves.toEqual([]);
    await expect(listSoldNotifications()).resolves.toEqual([]);
    await expect(createSavedSearch("Søk", { q: "æøå 👋" })).rejects.toThrow("ikke tilgjengelige");
  });
});

describe("Open-grenser for bud, salg og søketolkning", () => {
  const client = {} as SupabaseClient;

  it("har ingen salg, bud eller reservasjoner og gjør ingen oppslag", async () => {
    await expect(countSalesBySeller(client, "selger")).resolves.toBe(0);
    await expect(
      fetchOfferComment(client, { offer_id: "bud", conversation_id: "s", sender_id: "a" }),
    ).resolves.toEqual({ data: null, error: null });
    expect(applyOffer(undefined, {} as Offer)).toBeUndefined();
    await expect(fetchListingReservations(["annonse"])).resolves.toEqual(new Map());
    await expect(withReservations([{ id: "annonse" }])).resolves.toEqual([
      { id: "annonse", reserved_until: null },
    ]);
    expect(useNativePromotionAllowed()).toBe(false);
    expect(DEMO_USERS_AVAILABLE).toBe(false);
    expect(TRADE_AVAILABLE).toBe(false);
    expect(
      [LISTING_RESERVATION_COLUMN, CONVERSATION_RESERVATION_COLUMN, MESSAGE_OFFER_COLUMN].join(""),
    ).toBe("");
    expect(listingReservedUntil({ reserved_until: "2099-01-01T00:00:00Z" })).toBeNull();
    expect(conversationHoldsReservation({ holds_reservation: true })).toBe(false);
    expect(messageOfferId({ offer_id: "bud" })).toBeNull();
    const on = vi.fn();
    subscribeOfferChanges({ on } as never, "samtale", {} as never, () => true);
    expect(on).not.toHaveBeenCalled();
    expect(WTB_CONVERSATION_COLUMN).toBe("");
    expect(conversationWtbListingId({ wtb_listing_id: "ønske" })).toBeNull();
    expect(SYNONYM_ELIGIBLE_TYPES).toEqual([]);
  });

  it.each(["", "sykkel under 3000 kr", "æøå 👋"])(
    "søker på teksten «%s» uten å tolke den",
    async (q) => {
      expect(stripFillerWords(q)).toBe(q);
      expect(parsePriceFilters(q)).toEqual([]);
      expect(parseNumericFilters(q, [])).toEqual([]);
      expect(removeNumericMatches(q, [])).toBe(q);
      expect(matchCategoryPhrase(q, [{ slug: "sykler", name_nb: "Sykkel" }])).toBeNull();
      expect(matchBrandPhrase(q, [])).toBeNull();
      expect(matchAttributeOptionPhrase(q, [], [])).toBeNull();
      expect(buildStructuredSearchSuggestions(q, [], {})).toEqual([]);
      await expect(
        resolveTextToFilters({ q: ` ${q} `, categories: [], brands: [], allFilters: [] }),
      ).resolves.toEqual({ q: q.trim(), attrPatch: {}, criteria: [] });
      await expect(prefetchCategorySuggestion(q)).resolves.toEqual({ suggestions: [] });
    },
  );

  it("foreslår ingen utvidelser, merker eller eksempelsøk", () => {
    const applied = {} as AppliedSearchState;
    expect(buildZeroResultCandidates(applied, [])).toEqual([]);
    expect(bestZeroResultExpansions([], [])).toEqual([]);
    expect(useZeroResultExpansion({ applied, filters: [], categories: [], enabled: true })).toEqual(
      { expansion: undefined, expansions: [], isPending: false },
    );
    expect(useBrandCategoryCandidate([{ id: "a", slug: "a", name_nb: "A" }], "a")).toEqual({
      candidate: null,
      isLoading: false,
    });
    expect(SEARCH_SUGGESTIONS).toEqual([]);
    expect(escapeRegExp("a.b")).toBe("a\\.b");
  });

  it("rendrer ingenting for lukkede flater og tolker aldri søketeksten", () => {
    const noop = () => {};
    expect(CreateDemoUserDialog({ open: true, onOpenChange: noop })).toBeNull();
    expect(DefaultSearchExamplesCard({})).toBeNull();
    expect(
      FilterSynonymsDialog({ filter: {} as CategoryFilter, open: true, onOpenChange: noop }),
    ).toBeNull();
    expect(SuggestValuesButton({ categoryId: "k", filterKey: "f", onApply: noop })).toBeNull();
    expect(
      SearchInterpretation({
        criteria: [],
        categories: [],
        filters: [],
        onCategoryChange: noop,
        onAttributeChange: noop,
      }),
    ).toBeNull();
    expect(
      SearchSuggestionsLayer({
        q: "sykkel",
        categories: [],
        onSubmitQuery: noop,
        onPickCategory: noop,
        onPickSavedSearch: noop,
      }),
    ).toBeNull();
    const setQDraft = vi.fn();
    const updateSearch = vi.fn();
    useTextToFilterPipeline({
      qDraft: "sykkel under 3000",
      setQDraft,
      updateSearch,
      attrFilters: [],
      allFilters: [],
      attrValues: {},
      handleAttrValueChange: noop,
      categoryId: null,
    });
    expect(setQDraft).not.toHaveBeenCalled();
    expect(updateSearch).not.toHaveBeenCalled();
  });
});
