// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  disableListing: vi.fn(),
  updateStatus: vi.fn(),
  deleteOwnerListing: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createIsomorphicFn: () => ({ server: (fn: unknown) => ({ client: () => fn }) }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ delete: () => ({ eq: state.deleteOwnerListing }) }),
  },
}));
vi.mock("@/lib/listings.functions", () => ({ updateListingStatus: state.updateStatus }));
vi.mock("@/lib/admin-moderation.functions", () => ({
  submitReport: vi.fn(),
  submitUserReport: vi.fn(),
  adminDisableListingWithMessage: state.disableListing,
  adminDeleteListing: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock("@/lib/errors", () => ({ formatErrorMessage: (error: Error) => error.message }));
vi.mock("@/components/listing-detail/mark-sold-dialog", () => ({ MarkSoldDialog: () => null }));
vi.mock("@/components/report-dialog", () => ({
  ReportDialog: () => null,
  LISTING_REPORT_REASONS: [],
  USER_REPORT_REASONS: [],
}));

import { ListingActionsMenu } from "./listing-actions-menu";

const baseProps = {
  listingId: "11111111-1111-4111-8111-111111111111",
  listingTitle: "Sykkel",
  sellerId: "22222222-2222-4222-8222-222222222222",
  isAdminOrModerator: false,
  isOwner: false,
  listingStatus: "active",
};
const renderMenu = (props: Partial<typeof baseProps> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ListingActionsMenu {...baseProps} {...props} />
    </QueryClientProvider>,
  );

afterEach(cleanup);

describe("valg på annonsedetaljen", () => {
  it("skjuler salgsbekreftelse for solgt annonse, men lar eieren avpublisere og slette", async () => {
    const user = userEvent.setup();
    renderMenu({ isOwner: true, listingStatus: "sold" });
    await user.click(screen.getByRole("button", { name: "Flere valg" }));

    expect(screen.queryByRole("menuitem", { name: "Merk som solgt" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Avpubliser annonse" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Slett annonse" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Rapporter annonse" })).toBeNull();
  });

  it("viser rapportvalg til andre brukere, uten eierens sletting eller avpublisering", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Flere valg" }));

    expect(screen.getByRole("menuitem", { name: "Rapporter annonse" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rapporter bruker" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Slett annonse" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Avpubliser annonse" })).toBeNull();
  });

  it("krever en melding til eieren før moderatorens avpublisering sendes", async () => {
    const user = userEvent.setup();
    state.disableListing.mockReset().mockResolvedValue({ ok: true });
    renderMenu({ isAdminOrModerator: true });

    await user.click(screen.getByRole("button", { name: "Flere valg" }));
    await user.click(screen.getByRole("menuitem", { name: "Avpubliser annonse (admin)" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    const submit = screen.getByRole("button", { name: /^Avpubliser$/ });
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.type(
      screen.getByLabelText("Melding til eier (påkrevd)"),
      "Annonsen bryter reglene.",
    );
    expect(submit.hasAttribute("disabled")).toBe(false);
    await user.click(submit);

    await waitFor(() =>
      expect(state.disableListing).toHaveBeenCalledWith({
        data: {
          id: baseProps.listingId,
          reason: "Avpublisert av moderator",
          message: "Annonsen bryter reglene.",
        },
      }),
    );
  });

  it("ber eieren bekrefte avpublisering før statusen endres til arkivert", async () => {
    const user = userEvent.setup();
    state.updateStatus.mockReset().mockResolvedValue({ ok: true });
    renderMenu({ isOwner: true });

    await user.click(screen.getByRole("button", { name: "Flere valg" }));
    await user.click(screen.getByRole("menuitem", { name: "Avpubliser annonse" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(state.updateStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Flere valg" }));
    await user.click(screen.getByRole("menuitem", { name: "Avpubliser annonse" }));
    await user.click(screen.getByRole("button", { name: /^Avpubliser$/ }));
    await waitFor(() =>
      expect(state.updateStatus).toHaveBeenCalledWith({
        data: { id: baseProps.listingId, status: "archived" },
      }),
    );
  });

  it("sletter bare eierens annonse etter destruktiv bekreftelse", async () => {
    const user = userEvent.setup();
    state.deleteOwnerListing.mockReset().mockResolvedValue({ error: null });
    renderMenu({ isOwner: true });

    await user.click(screen.getByRole("button", { name: "Flere valg" }));
    await user.click(screen.getByRole("menuitem", { name: "Slett annonse" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Slett permanent" }));

    await waitFor(() =>
      expect(state.deleteOwnerListing).toHaveBeenCalledWith("id", baseProps.listingId),
    );
  });
});
