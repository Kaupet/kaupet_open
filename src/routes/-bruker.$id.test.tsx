// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EDITION } from "@/lib/edition";
const { filters, routeState } = vi.hoisted(() => ({
  filters: [] as unknown[][],
  routeState: { search: {} as Record<string, unknown> },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ id: "user-1" }),
    useLoaderData: () => ({
      profile: {
        id: "user-1",
        display_name: "Kari Nordmann",
        avatar_url: null,
        created_at: "2025-03-01T00:00:00Z",
        deleted_at: null,
        avg_rating: 0,
        review_count: 0,
      },
    }),
    useSearch: () => routeState.search,
  }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  notFound: () => new Error("notFound"),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          filters.push(["eq", ...args]);
          return query;
        },
        is: (...args: unknown[]) => {
          filters.push(["is", ...args]);
          return query;
        },
        order: () => query,
        range: async () => ({ data: [], error: null }),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/profile.functions", () => ({ getPublicProfile: vi.fn() }));
vi.mock("@/components/admin/suspend-user-menu", () => ({ AdminUserActions: () => null }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/profile-reviews", () => ({
  ProfileReviews: ({ preview }: { preview?: { heading: string } }) => (
    <p>{preview ? preview.heading : "Vurderinger (hele listen)"}</p>
  ),
  ProfileRatingLine: () => null,
}));
vi.mock("@/hooks/use-profile-reviews", () => ({
  useProfileReviews: () => ({ data: undefined }),
}));
import { Route } from "./bruker.$id";
const options = (
  Route as unknown as {
    options: {
      component: ComponentType;
      validateSearch: (search: Record<string, unknown>) => unknown;
    };
  }
).options;
const Page = options.component;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  routeState.search = {};
  filters.length = 0;
});
afterEach(cleanup);

it("privatprofilen er tydelig merket som privatperson og viser egne annonser", async () => {
  renderPage();
  expect(screen.getByRole("heading", { level: 1, name: "Kari Nordmann" })).toBeTruthy();
  expect(screen.getByText("Privatperson")).toBeTruthy();
  expect(screen.getByText(/følger kjøpsloven, ikke forbrukerkjøpsloven/u)).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Faner i brukerprofilen" })).toBeTruthy();
  expect(screen.getByText("Hva andre sier om Kari")).toBeTruthy();
  expect(await screen.findByText("Brukeren har ingen aktive annonser.")).toBeTruthy();
  // Bedriftsannonser som brukeren har lagt ut som ansatt hører til bedriften.
  expect(filters).toEqual([
    ["eq", "status", "active"],
    ["eq", "seller_id", "user-1"],
    ...(EDITION === "open" ? [] : [["is", "organization_id", null]]),
  ]);
});

it("vurderingsfanen viser hele listen uten å hente annonser", () => {
  routeState.search = { tab: "vurderinger" };
  renderPage();
  expect(screen.getByText("Vurderinger (hele listen)")).toBeTruthy();
  expect(filters).toEqual([]);
});

it("privatprofilen har ingen «Om»-fane", () => {
  expect(options.validateSearch({ tab: "om" })).toEqual({});
  expect(options.validateSearch({ tab: "vurderinger" })).toEqual({ tab: "vurderinger" });
});
