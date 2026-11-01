// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderWithDayDividers, type Message, type MessageInteraction } from "./message-list";

const msg = (over: Partial<Message>): Message => ({
  id: "m1",
  conversation_id: "c",
  sender_id: "other",
  body: "Er den ledig?",
  created_at: "2026-10-20T10:00:00Z",
  deleted_at: null,
  ...over,
});

function setup(messages: Message[], over: Partial<MessageInteraction> = {}) {
  const interaction: MessageInteraction = {
    reactions: new Map(),
    otherName: "Marte",
    canReact: true,
    onOpenActions: vi.fn(),
    onReact: vi.fn(),
    ...over,
  };
  render(<div>{renderWithDayDividers(messages, "me", null, {}, interaction)}</div>);
  return interaction;
}

afterEach(cleanup);

describe("meldingsboble", () => {
  it("åpner menyen med trykk, skjermleseraktivering og mellomrom", async () => {
    const user = userEvent.setup();
    const { onOpenActions } = setup([msg({})]);
    const bubble = screen.getByRole("button", { name: /Er den ledig/ });
    await user.pointer({ keys: "[TouchA]", target: bubble });
    expect(onOpenActions).toHaveBeenCalledWith(msg({}));
    vi.mocked(onOpenActions).mockClear();
    // Skjermlesere sender klikk uten pekerhendelser.
    fireEvent.click(bubble);
    expect(onOpenActions).toHaveBeenCalledTimes(1);
    vi.mocked(onOpenActions).mockClear();
    bubble.focus();
    await user.keyboard(" ");
    expect(onOpenActions).toHaveBeenCalledWith(msg({}));
  });

  it("lar musklikk og tekstmarkering være i fred", async () => {
    const user = userEvent.setup();
    const { onOpenActions } = setup([msg({})]);
    const bubble = screen.getByRole("button", { name: /Er den ledig/ });
    await user.click(bubble);
    await user.dblClick(bubble);
    expect(onOpenActions).not.toHaveBeenCalled();

    const range = document.createRange();
    range.selectNodeContents(bubble);
    window.getSelection()!.addRange(range);
    fireEvent.click(bubble);
    window.getSelection()!.removeAllRanges();
    expect(onOpenActions).not.toHaveBeenCalled();
  });

  it("åpner menyen med Enter, kontekstmenytast og høyreklikk", () => {
    const { onOpenActions } = setup([msg({})]);
    const bubble = screen.getByRole("button", { name: /Er den ledig/ });
    fireEvent.keyDown(bubble, { key: "Enter" });
    fireEvent.keyDown(bubble, { key: "ContextMenu" });
    fireEvent.contextMenu(bubble);
    expect(onOpenActions).toHaveBeenCalledTimes(3);
  });

  it("gir slettede og usendte meldinger ingen meny", () => {
    setup([
      msg({ deleted_at: "2026-10-20T10:01:00Z" }),
      msg({ id: "m2", sender_id: "me", pending: true }),
    ]);
    expect(screen.queryByRole("button", { name: /Melding slettet|Er den ledig/ })).toBeNull();
  });

  it("viser ikke reaksjoner på slettede meldinger", () => {
    setup([msg({ deleted_at: "2026-10-20T10:01:00Z" })], {
      reactions: new Map([["m1", [{ message_id: "m1", user_id: "other", emoji: "😂" }]]]),
    });
    expect(screen.queryByText(/reagerte med/)).toBeNull();
  });

  it("beskriver reaksjoner med navn for skjermleser", () => {
    setup([msg({})], {
      reactions: new Map([
        [
          "m1",
          [
            { message_id: "m1", user_id: "me", emoji: "❤️" },
            { message_id: "m1", user_id: "other", emoji: "😂" },
          ],
        ],
      ]),
    });
    expect(screen.getByText("Du reagerte med hjerte. Marte reagerte med latter")).toBeTruthy();
  });
});
