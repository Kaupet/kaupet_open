// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/lib/categories";
import { EDITION } from "@/lib/edition";

const state = vi.hoisted(() => ({
  categories: [] as Array<Record<string, unknown>>,
  shell: {} as Record<string, unknown>,
  updateSearch: vi.fn(),
  retry: vi.fn(),
  panel: vi.fn(),
  isNative: false,
  wtb: {
    wtbCount: 0,
    wtbLoading: false,
    wtbListings: [] as Array<{ id: string }>,
    hasSearchCriteria: true,
  },
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-categories", () => ({
  useCategories: () => ({ data: state.categories }),
  visibleCategories: (categories: Array<{ is_hidden?: boolean }>) =>
    categories.filter((category) => !category.is_hidden),
}));
vi.mock("@/components/attribute-fields", () => ({ useAllCategoryFilters: () => ({ data: [] }) }));
vi.mock("@/features/listing-search/use-search-results-shell", () => ({
  useSearchResultsShell: () => state.shell,
}));
vi.mock("@/features/listing-search/search-panel/search-panel-context", () => ({
  useSearchPanel: () => ({ open: false, openPanel: state.panel }),
}));
vi.mock("@/features/listing-search/use-wtb-listings", () => ({
  useWtbListings: () => state.wtb,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => state.isNative }));
vi.mock("@/hooks/use-form-factor", () => ({ useIsDesktop: () => false }));
vi.mock("@/hooks/use-pull-to-refresh", () => ({
  usePullToRefresh: () => ({ refreshing: false, pullDistance: 0 }),
}));
vi.mock("@/features/listing-search/use-hero-category-actions", () => ({
  useHeroCategoryActions: () => ({
    selectHeroCategory: vi.fn(),
    toggleChildCategory: vi.fn(),
    isChildActive: () => false,
  }),
}));
vi.mock("@/features/listing-search/use-search-interpretation", () => ({
  useSearchInterpretation: () => [[], vi.fn()],
}));
vi.mock("@/features/listing-search/use-brand-category-candidate", () => ({
  useBrandCategoryCandidate: () => ({ candidate: null, isLoading: false }),
}));
vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));
vi.mock("@/lib/last-search-context", () => ({ saveLastSearchContext: vi.fn() }));
vi.mock("@/features/listing-search/filters/search-bar", () => ({
  SearchBar: ({
    categorySuggestion,
  }: {
    categorySuggestion?: { label: string; onSelect: () => void };
  }) =>
    categorySuggestion ? (
      <button type="button" onClick={categorySuggestion.onSelect}>
        {categorySuggestion.label}
      </button>
    ) : (
      <input aria-label="Søk" />
    ),
}));
vi.mock("@/features/listing-search/filters/advanced-search-sheet", () => ({
  SaveSearchDialog: () => null,
}));
vi.mock("@/features/listing-search/filters/active-filters", () => ({ ActiveFilters: () => null }));
vi.mock("@/features/listing-search/search-panel/search-results-body", () => ({
  SearchResultsBody: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/listing-search/search-panel/mobile-filter-button", () => ({
  MobileFilterButton: () => null,
}));
vi.mock("@/features/listing-search/search-panel/search-filter-chip-row", () => ({
  SearchFilterChipRow: () => null,
}));
vi.mock("@/features/listing-search/search-panel/search-summary-pill", () => ({
  SearchSummaryPill: ({
    categoryToken,
  }: {
    categoryToken?: { label: string; onRemove: () => void };
  }) =>
    categoryToken ? (
      <button type="button" onClick={categoryToken.onRemove}>
        Fjern {categoryToken.label}
      </button>
    ) : null,
}));
vi.mock("@/features/listing-search/search-interpretation", () => ({
  SearchInterpretation: () => null,
}));
vi.mock("@/components/result-list", () => ({
  ResultList: ({
    isLoading,
    loadError,
    onRetry,
    categorySuggestion,
    onMapApplyViewport,
    onMapClearLocation,
    onSortChange,
  }: {
    isLoading: boolean;
    loadError: boolean;
    onRetry: () => void;
    categorySuggestion?: { categoryName: string; onApply: () => void };
    onMapApplyViewport: (
      center: { lat: number; lng: number },
      radius: number,
      label?: string,
    ) => void;
    onMapClearLocation: () => void;
    onSortChange: (sort: "price_asc") => void;
  }) => (
    <section>
      {isLoading && <p>Laster annonser</p>}
      {loadError && (
        <>
          <p>Annonsene kunne ikke lastes</p>
          <button onClick={onRetry}>Prøv igjen</button>
        </>
      )}
      {categorySuggestion && (
        <button onClick={categorySuggestion.onApply}>
          Gå til {categorySuggestion.categoryName}
        </button>
      )}
      <button onClick={() => onMapApplyViewport({ lat: 59.9, lng: 10.7 }, 25, "Oslo")}>
        Bruk kartutsnitt
      </button>
      <button onClick={onMapClearLocation}>Fjern sted</button>
      <button onClick={() => onSortChange("price_asc")}>Sorter etter pris</button>
    </section>
  ),
}));
vi.mock("@/components/wtb-listing-card", () => ({ WtbListingCard: () => null }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/pull-to-refresh-indicator", () => ({ PullToRefreshIndicator: () => null }));
vi.mock("@/components/category-breadcrumb", () => ({ CategoryBreadcrumb: () => null }));
vi.mock("@/components/scroll-arrow-row", () => ({
  ScrollArrowRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/browse-page-skeleton", () => ({
  BrowsePageSkeleton: () => <p>Laster søket</p>,
}));
vi.mock("@/features/listing-search/search-start", () => ({
  SearchStart: ({
    categories,
    onPickCategory,
  }: {
    categories: Array<{ name_nb: string; slug: string }>;
    onPickCategory: (category: { name_nb: string; slug: string }) => void;
  }) => (
    <button type="button" onClick={() => onPickCategory(categories[0])}>
      Velg {categories[0]?.name_nb}
    </button>
  ),
}));

import { SearchResultsPage } from "./search-results-page";

const category: Category & { is_hidden: boolean } = {
  id: "category-id",
  slug: "sykkel",
  name_nb: "Sykkel",
  parent_id: null,
  is_hidden: false,
};
const childCategory: Category & { is_hidden: boolean } = {
  id: "child-category-id",
  slug: "terrengsykkel",
  name_nb: "Terrengsykkel",
  parent_id: category.id,
  is_hidden: false,
};

function renderPage(
  q: string,
  scope?: {
    category: typeof category;
    breadcrumb: (typeof category)[];
    subSlugParam: "sub" | "sub2";
    subSlug?: string;
  },
  results?: "listings" | "wtb",
) {
  const search = {
    q,
    category: "",
    categories: [],
    catMode: "any",
    qMode: "all",
    extraGroups: [],
    conditions: [],
    sort: "new",
    results,
  } as never;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SearchResultsPage search={search} navigate={state.updateSearch} scope={scope} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.categories = [category, childCategory];
  state.isNative = false;
  state.wtb = {
    wtbCount: 0,
    wtbLoading: false,
    wtbListings: [],
    hasSearchCriteria: true,
  };
  state.shell = {
    location: null,
    effectiveCategories: [],
    categoryTree: {
      roots: [category],
      childrenByParent: new Map([[category.id, [childCategory]]]),
      bySlug: new Map([
        [category.slug, category],
        [childCategory.slug, childCategory],
      ]),
      byId: new Map([
        [category.id, category],
        [childCategory.id, childCategory],
      ]),
    },
    attrFilters: [],
    attrValues: {},
    handleAttrValueChange: vi.fn(),
    terms: [],
    appliedSearch: { value: {}, attributes: {} },
    currentCriteria: {},
    updateSearch: state.updateSearch,
    applyPanelDraft: vi.fn(),
    resetFilters: vi.fn(),
    justCreatedKeys: [],
    removeAttrWithRestore: vi.fn(),
    activeFilterCount: 0,
    isLoading: false,
    loadError: false,
    nextPageError: false,
    retryListings: state.retry,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    totalCount: 0,
    zeroResultExpansion: null,
    zeroResultExpansions: [],
    zeroResultExpansionPending: false,
    cards: [],
    mapListings: [],
    mapCenter: null,
    searchPanelResults: null,
  };
});

afterEach(cleanup);

describe("søk og resultater", () => {
  it.skipIf(EDITION === "open")(
    "foreslår en matchende kategori og fjerner kategorinavnet når brukeren velger den",
    async () => {
      const user = userEvent.setup();
      renderPage("sykkel");

      await user.click(screen.getByRole("button", { name: "Begrens søket til Sykkel" }));
      expect(state.updateSearch).toHaveBeenCalledWith({
        category: "",
        categories: ["sykkel"],
        catMode: "any",
        q: "",
      });
    },
  );

  it("lar brukeren prøve igjen etter feil ved lasting av annonser", async () => {
    const user = userEvent.setup();
    state.shell = { ...state.shell, loadError: true };
    renderPage("vinterdekk");

    expect(screen.getByText("Annonsene kunne ikke lastes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it("viser tomtilstand for ØK og lar brukeren gå tilbake til salgsannonsene", async () => {
    const user = userEvent.setup();
    state.wtb = { wtbCount: 2, wtbLoading: false, wtbListings: [], hasSearchCriteria: true };
    renderPage("sofa", undefined, "wtb");

    expect(
      screen.getByRole("tab", { name: "Ønskes kjøpt (2)" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Ingen ønskes kjøpt-annonser funnet")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Til salgs" }));
    const navigation = state.updateSearch.mock.calls[0][0];
    expect(navigation.replace).toBe(true);
    expect(navigation.search({ keep: "state", results: "wtb" })).toEqual({
      keep: "state",
      results: undefined,
    });
  });

  it("faller tilbake til salgsannonser når ØK-fanen ikke lenger har treff", () => {
    state.wtb = { wtbCount: 0, wtbLoading: false, wtbListings: [], hasSearchCriteria: true };
    renderPage("sofa", undefined, "wtb");

    expect(screen.queryByRole("tablist", { name: "Annonsetype" })).toBeNull();
    expect(screen.queryByText("Ingen ønskes kjøpt-annonser funnet")).toBeNull();
  });

  it("holder seg på kategorisiden og beholder valg av underkategori i URL-en", async () => {
    const user = userEvent.setup();
    renderPage("", { category, breadcrumb: [category], subSlugParam: "sub" });

    await user.click(screen.getByRole("button", { name: "Terrengsykkel" }));
    expect(state.updateSearch).toHaveBeenCalledOnce();
    const navigation = state.updateSearch.mock.calls[0][0];
    expect(navigation.search({ other: "behold" })).toEqual({
      other: "behold",
      sub: "terrengsykkel",
    });
  });

  it("viser valgt underkategori når den er en etterkommer av kategorisiden", () => {
    renderPage("", {
      category,
      breadcrumb: [category],
      subSlugParam: "sub",
      subSlug: "terrengsykkel",
    });
    expect(screen.getByRole("heading", { level: 1, name: "Terrengsykkel" })).toBeTruthy();
  });

  it.skipIf(EDITION === "open")(
    "lar kategoriforslaget i tomt resultat åpne riktig kategori",
    async () => {
      const user = userEvent.setup();
      renderPage("sykkel");
      await user.click(screen.getByRole("button", { name: "Gå til Sykkel" }));
      expect(state.updateSearch).toHaveBeenCalledWith({
        category: "",
        categories: ["sykkel"],
        catMode: "any",
        q: "",
      });
    },
  );

  it("viser startflaten på native og lar brukeren velge en kategori", async () => {
    const user = userEvent.setup();
    state.isNative = true;
    renderPage("");

    await user.click(screen.getByRole("button", { name: "Velg Sykkel" }));
    expect(state.updateSearch).toHaveBeenCalledWith({
      category: "",
      categories: ["sykkel"],
      q: "",
    });
  });

  it("lar native-brukeren fjerne kategori-tokenet uten å endre andre filtre", async () => {
    const user = userEvent.setup();
    state.isNative = true;
    state.shell = { ...state.shell, effectiveCategories: ["sykkel"] };
    renderPage("");

    await user.click(screen.getByRole("button", { name: "Fjern Sykkel" }));
    expect(state.updateSearch).toHaveBeenCalledWith({ category: "", categories: [] });
  });

  it("beholder kartets sted og sortering i søkeparametrene", async () => {
    const user = userEvent.setup();
    renderPage("sofa");

    await user.click(screen.getByRole("button", { name: "Bruk kartutsnitt" }));
    await user.click(screen.getByRole("button", { name: "Sorter etter pris" }));
    expect(state.updateSearch).toHaveBeenNthCalledWith(1, {
      lat: 59.9,
      lng: 10.7,
      radius: 25,
      loc: "Oslo",
    });
    expect(state.updateSearch).toHaveBeenNthCalledWith(2, { sort: "price_asc" });
  });
});
