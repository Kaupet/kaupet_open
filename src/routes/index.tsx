// kaupet_open: minimal forside med søk, «Opprett en annonse» og
// hovedkategoriene. Hero, kategoristrøm, populære annonser og onboarding
// er ikke med.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { IntentOptions } from "@/components/intent-title-landing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLandingCategories } from "@/features/landing/use-landing-categories";
import { interpretedSearchState, submitSearch } from "@/features/listing-search/submit-search";
import { categoriesQueryOptions } from "@/hooks/use-categories";
import { defaultAdvancedSearchValue } from "@/lib/advanced-search-value";
import { CategoryIcon } from "@/lib/category-icons";

const searchSchema = z.object({
  q: z.string().optional(),
  // Satt av /ny-annonse når veiviseren åpnes uten utkast; åpner valget her.
  opprett: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  loader: async () => {
    if (typeof window !== "undefined") return { categories: undefined };
    try {
      return { categories: await categoriesQueryOptions.queryFn() };
    } catch {
      return { categories: undefined };
    }
  },
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const { opprett } = Route.useSearch();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { categories: ssrCategories } = Route.useLoaderData();
  const { categories, allFilters } = useLandingCategories(ssrCategories);
  const roots = useMemo(() => (categories ?? []).filter((c) => c.parent_id === null), [categories]);

  useEffect(() => {
    if (!opprett) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickerOpen(true);
    void navigate({ to: "/", search: {}, replace: true });
  }, [opprett, navigate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitSearch({
      applied: { value: defaultAdvancedSearchValue(), attributes: {} },
      query,
      categories: categories ?? [],
      allFilters: allFilters ?? [],
      commit: (search, criteria) =>
        navigate({ to: "/annonser", search, state: interpretedSearchState(criteria) }),
    });
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9"
            aria-label="Søk i annonser"
          />
        </div>
        <Button type="submit" size="lg">
          Søk
        </Button>
      </form>

      <div className="space-y-3">
        <Button
          variant="outline"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
        >
          {pickerOpen ? "Avbryt" : "Opprett en annonse"}
        </Button>
        {pickerOpen && <IntentOptions />}
      </div>

      <nav aria-label="Kategorier">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roots.map((cat) => (
            <li key={cat.id}>
              <Link
                to="/$kaupetCode"
                params={{ kaupetCode: cat.slug }}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <CategoryIcon iconName={cat.icon} className="size-4 shrink-0" />
                {cat.name_nb}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
