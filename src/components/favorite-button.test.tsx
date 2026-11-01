// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  insert: vi.fn(),
  deleteEq: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showSuccessToast: state.success, showErrorToast: state.error }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: state.insert,
      delete: () => ({ eq: () => ({ eq: state.deleteEq }) }),
    }),
  },
}));

import { FavoriteButton } from "./favorite-button";

const listingId = "11111111-1111-4111-8111-111111111111";
const renderButton = (props: Partial<Parameters<typeof FavoriteButton>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })}>
      <FavoriteButton listingId={listingId} knownFavorite={false} {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.user = { id: "user-1" };
  state.insert.mockResolvedValue({ error: null });
  state.deleteEq.mockResolvedValue({ error: null });
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("favorittknappen", () => {
  it("sender utlogget bruker til innlogging og husker intensjonen", async () => {
    state.user = null;
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Lagre som favoritt" }));

    expect(state.insert).not.toHaveBeenCalled();
    expect(state.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/auth", search: expect.objectContaining({ mode: "signin" }) }),
    );
    expect(JSON.parse(window.sessionStorage.getItem("kaupet_pending_auth_intent")!)).toEqual({
      type: "favorite",
      listingId,
    });
  });

  it("lagrer og fjerner favoritt for innlogget bruker", async () => {
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Lagre som favoritt" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Lagt til i favoritter"));
    expect(state.insert).toHaveBeenCalledWith({ listing_id: listingId, user_id: "user-1" });

    cleanup();
    renderButton({ knownFavorite: true, variant: "full", size: "lg" });
    expect(screen.getByText("Lagret som favoritt")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Fjern fra favoritter" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Fjernet fra favoritter"));
    expect(state.deleteEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("forklarer når databasen avviser favoritt på egen annonse", async () => {
    state.insert.mockResolvedValue({ error: Object.assign(new Error("rls"), { code: "42501" }) });
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Lagre som favoritt" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("Du kan ikke lagre din egen annonse som favoritt"),
    );
  });

  it("fullfører lagret intensjon etter innlogging, men bare én gang", async () => {
    window.sessionStorage.setItem(
      "kaupet_pending_auth_intent",
      JSON.stringify({ type: "favorite", listingId }),
    );
    renderButton();
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem("kaupet_pending_auth_intent")).toBeNull();
  });

  it("venter med knappen til favorittstatus er lastet", () => {
    renderButton({ favoriteStateReady: false });
    expect(screen.getByRole("button", { name: "Lagre som favoritt" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
