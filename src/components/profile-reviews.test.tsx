// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileReviews } from "./profile-reviews";

let state: Record<string, unknown>;
vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: () => state }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/reviews.functions", () => ({
  getOrganizationReviews: vi.fn(),
  getUserReviews: vi.fn(),
}));
afterEach(cleanup);
const org = { organizationId: "org-1" };

const review = (id: string, rating: number, comment: string, role = "buyer") => ({
  id,
  rating,
  comment,
  role,
  created_at: "2026-10-25",
  reviewer_name: "Kari",
  listing: { kaupet_code: "ABC123", title: "Sykkel" },
});

const loaded = {
  data: {
    pages: [
      {
        reviews: [
          review("r1", 5, "God service"),
          review("r2", 4, "Grei handel"),
          review("r3", 4, "Rask levering"),
          review("r4", 3, "Helt ok"),
        ],
        avg_rating: 4,
        review_count: 4,
        rating_counts: [0, 0, 1, 2, 1],
      },
    ],
  },
};

it("viser lasting, feil, tomtilstand og bedriftens vurderinger", () => {
  state = { isPending: true };
  const view = render(
    <ProfileReviews subject={org} emptyText="Bedriften har ingen vurderinger ennå." />,
  );
  expect(screen.getByRole("status").textContent).toContain("Laster");
  state = { isError: true };
  view.rerender(<ProfileReviews subject={org} emptyText="Bedriften har ingen vurderinger ennå." />);
  expect(screen.getByRole("alert").textContent).toContain("Kunne ikke laste");
  state = {
    data: { pages: [{ reviews: [], avg_rating: 0, review_count: 0, rating_counts: [] }] },
  };
  view.rerender(<ProfileReviews subject={org} emptyText="Bedriften har ingen vurderinger ennå." />);
  expect(screen.getByText("Bedriften har ingen vurderinger ennå.")).toBeTruthy();
  state = loaded;
  view.rerender(<ProfileReviews subject={org} emptyText="Bedriften har ingen vurderinger ennå." />);
  expect(screen.getByText("God service")).toBeTruthy();
  expect(screen.getByText("4,0")).toBeTruthy();
  expect(screen.getByText("Basert på 4 vurderinger")).toBeTruthy();
  expect(screen.getAllByText("Sykkel")).toHaveLength(4);
  expect(screen.getAllByText(/Kari/u)).toHaveLength(4);
});

it("viser fordelingen per stjerne", () => {
  state = loaded;
  render(<ProfileReviews subject={org} emptyText="Bedriften har ingen vurderinger ennå." />);
  const rows = screen.getByRole("list", { name: "Fordeling av vurderinger" }).children;
  expect(Array.from(rows, (row) => row.textContent)).toEqual([
    "55 stjerner: 1",
    "44 stjerner: 2",
    "33 stjerner: 1",
    "22 stjerner: 0",
    "11 stjerner: 0",
  ]);
});

it("utdraget viser de tre nyeste og lenker til alle", () => {
  state = loaded;
  render(
    <ProfileReviews
      subject={org}
      emptyText=""
      preview={{
        heading: "Hva kjøpere sier",
        allReviewsLink: (label: string) => <a href="#vurderinger">{label}</a>,
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Hva kjøpere sier" })).toBeTruthy();
  expect(screen.getByText("Rask levering")).toBeTruthy();
  expect(screen.queryByText("Helt ok")).toBeNull();
  expect(screen.getByRole("link", { name: "Se alle 4 vurderinger" })).toBeTruthy();
});

it("utdraget skjules når bedriften ikke har vurderinger", () => {
  state = {
    data: { pages: [{ reviews: [], avg_rating: 0, review_count: 0, rating_counts: [] }] },
  };
  const { container } = render(
    <ProfileReviews
      subject={org}
      emptyText=""
      preview={{ heading: "Hva kjøpere sier", allReviewsLink: () => null }}
    />,
  );
  expect(container.textContent).toBe("");
});

it("privatprofilen merker rollen og bruker riktig verb", () => {
  state = {
    data: {
      pages: [
        {
          reviews: [review("r1", 5, "Rask betaling", "seller"), review("r2", 4, "Fin sofa")],
          avg_rating: 4.5,
          review_count: 2,
          rating_counts: [0, 0, 0, 1, 1],
        },
      ],
    },
  };
  render(<ProfileReviews subject={{ userId: "u1" }} emptyText="" />);
  expect(screen.getByText("Som kjøper")).toBeTruthy();
  expect(screen.getByText("Som selger")).toBeTruthy();
  expect(screen.getByText(/· solgte/u)).toBeTruthy();
  expect(screen.getByText(/· kjøpte/u)).toBeTruthy();
});

it("bedriftsprofilen viser ikke rollemerker", () => {
  state = loaded;
  render(<ProfileReviews subject={org} emptyText="" />);
  expect(screen.queryByText("Som selger")).toBeNull();
});
