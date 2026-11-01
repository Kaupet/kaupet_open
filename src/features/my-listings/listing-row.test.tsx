// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingRow, type Row } from "./listing-row";

import { EDITION } from "@/lib/edition";

afterEach(cleanup);

vi.mock("@/lib/storage", () => ({
  signListingImageUrls: vi.fn().mockResolvedValue({}),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const row: Row = {
  id: "1",
  kaupet_code: "ABC123",
  title: "Test-annonse",
  status: "active",
  price_nok: 100,
  is_free: false,
  city: "Oslo",
  category_id: null,
  category_slug: null,
  attributes: null,
  description: null,
  view_count: 0,
  favorite_count: 0,
  created_at: new Date().toISOString(),
  expires_at: null,
  cover_path: null,
};

const noop = () => {};

// Typekontrakt (kjøres av tsc): uten editOnly er radhandlingene påkrevd, så
// en glemt onDelete ikke gir en sletteknapp som ikke gjør noe.
export function _listingRowRequiresActions() {
  // @ts-expect-error onPromote … onDelete mangler
  return <ListingRow row={row} spin360={false} activePromotion={null} busy={false} />;
}

describe("ListingRow", () => {
  it.skipIf(EDITION === "open")(
    "shows the promote action for every user, not just demo/admin roles",
    () => {
      const { getAllByText } = renderWithClient(
        <ListingRow
          row={row}
          spin360={false}
          activePromotion={null}
          onPromote={noop}
          onMarkSold={noop}
          onReactivate={noop}
          onRepublish={noop}
          onPublishDraft={noop}
          onDelete={noop}
          busy={false}
        />,
      );

      expect(getAllByText("Fremhev annonse").length).toBeGreaterThan(0);
    },
  );

  it("viser bare Rediger i editOnly, uten døde status- og slettehandlinger", () => {
    const { getByText, queryByText, queryByLabelText } = renderWithClient(
      <ListingRow
        row={{ ...row, status: "draft" }}
        spin360={false}
        activePromotion={null}
        busy={false}
        editOnly
      />,
    );
    expect(getByText("Rediger")).toBeTruthy();
    expect(queryByText("Publiser")).toBeNull();
    expect(queryByText("Marker som solgt")).toBeNull();
    expect(queryByLabelText("Slett")).toBeNull();
  });
});
