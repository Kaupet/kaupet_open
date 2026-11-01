// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listMyBlocks: vi.fn(),
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/blocks.functions", () => ({
  listMyBlocks: state.listMyBlocks,
  createBlock: state.createBlock,
  deleteBlock: state.deleteBlock,
}));
vi.mock("@/lib/admin-moderation.functions", () => ({ submitUserReport: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showSuccessToast: state.success, showErrorToast: state.error }));
vi.mock("@/lib/errors", () => ({ formatErrorMessage: (e: Error) => e.message }));
vi.mock("@/components/report-dialog", () => ({
  ReportDialog: () => null,
  USER_REPORT_REASONS: [],
}));

import { BlockConversationMenu } from "./block-conversation-menu";

const props = { targetUserId: "user-2", conversationId: "conv-1", targetName: "Kari" };
const renderMenu = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 0 } } })}>
      <BlockConversationMenu {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.listMyBlocks.mockResolvedValue([]);
  state.createBlock.mockResolvedValue(undefined);
  state.deleteBlock.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("blokkeringsmenyen i samtalen", () => {
  it("blokkerer bare denne samtalen etter bekreftelse", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Blokker denne samtalen" }));
    expect(screen.getByText(/Andre samtaler mellom dere påvirkes ikke/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Blokker" }));

    await waitFor(() =>
      expect(state.createBlock).toHaveBeenCalledWith({
        data: { targetUserId: "user-2", scope: "conversation", conversationId: "conv-1" },
      }),
    );
    expect(state.success).toHaveBeenCalledWith("Samtalen er blokkert");
  });

  it("blokkerer hele brukeren uten samtale-ID og viser feil fra serveren", async () => {
    state.createBlock.mockRejectedValue(new Error("Ikke tillatt"));
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Blokker brukeren helt" }));
    expect(screen.getByRole("heading", { name: "Blokker Kari?" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Blokker" }));

    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Ikke tillatt"));
    expect(state.createBlock).toHaveBeenCalledWith({
      data: { targetUserId: "user-2", scope: "all", conversationId: undefined },
    });
  });

  it("avbryt i bekreftelsen oppretter ingen blokkering", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Blokker brukeren helt" }));
    await userEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(state.createBlock).not.toHaveBeenCalled();
  });

  it("opphever en eksisterende blokkering av brukeren", async () => {
    state.listMyBlocks.mockResolvedValue([
      { id: "block-1", scope: "all", blocked_id: "user-2", conversation_id: null },
    ]);
    renderMenu();
    await userEvent.click(await screen.findByRole("button", { name: "Opphev blokkering" }));

    await waitFor(() =>
      expect(state.deleteBlock).toHaveBeenCalledWith({ data: { blockId: "block-1" } }),
    );
    expect(state.success).toHaveBeenCalledWith("Blokkering opphevet");
    expect(screen.queryByRole("button", { name: "Blokker brukeren helt" })).toBeNull();
  });

  it("viser opphevelse for blokkert samtale, men ikke for en annen samtale", async () => {
    state.listMyBlocks.mockResolvedValue([
      { id: "block-2", scope: "conversation", blocked_id: "user-2", conversation_id: "conv-9" },
    ]);
    renderMenu();
    await waitFor(() => expect(state.listMyBlocks).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Blokker denne samtalen" })).toBeTruthy();

    cleanup();
    state.listMyBlocks.mockResolvedValue([
      { id: "block-3", scope: "conversation", blocked_id: "user-2", conversation_id: "conv-1" },
    ]);
    renderMenu();
    expect(await screen.findByRole("button", { name: "Opphev blokkering" })).toBeTruthy();
  });
});
