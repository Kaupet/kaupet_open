// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { MessageActions } from "./message-actions";
import { MessageBubble } from "./message-bubble";
import type { Message } from "./message-list";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/admin-moderation.functions", () => ({ submitUserReport: vi.fn() }));
vi.mock("@/hooks/use-form-factor", () => ({ useIsNarrow: () => false }));
vi.mock("@/lib/haptics", () => ({ hapticSelection: vi.fn() }));

afterEach(cleanup);

function Harness({ mine = false }: { mine?: boolean }) {
  const [message, setMessage] = useState<Message | null>(null);
  const row: Message = {
    id: "m1",
    conversation_id: "c1",
    sender_id: mine ? "me" : "other",
    body: "Er den ledig?",
    created_at: "2026-10-20T10:00:00Z",
    deleted_at: null,
  };
  return (
    <>
      <MessageBubble
        message={row}
        myId="me"
        startsGroup
        lastInGroup
        interaction={{
          reactions: new Map(),
          otherName: "Marte",
          canReact: true,
          onOpenActions: setMessage,
          onReact: vi.fn(),
        }}
      />
      <MessageActions
        message={message}
        onClose={() => setMessage(null)}
        myId="me"
        myReaction={null}
        canReact
        reportUserId="other"
        onReact={vi.fn()}
        onDelete={vi.fn()}
      />
    </>
  );
}

async function openMenu(mine = false) {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness mine={mine} />
    </QueryClientProvider>,
  );
  const bubble = screen.getByRole("button", { name: /Er den ledig/ });
  bubble.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("dialog", { name: "Valg for meldingen" });
  return { user, bubble };
}

it.each(["Escape", "reaksjon"])(
  "tilstandsovergang: gir fokus tilbake til meldingen etter %s",
  async (close) => {
    const { user, bubble } = await openMenu();
    if (close === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByRole("button", { name: "Reager med hjerte" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(bubble);
    });
  },
);

it.each([
  { mine: true, action: "Slett", role: "alertdialog", title: "Slett melding" },
  { mine: false, action: "Rapporter", role: "dialog", title: "Rapporter melding" },
])("beholder fokus i $title når meldingsmenyen lukkes", async ({ mine, action, role, title }) => {
  const { user } = await openMenu(mine);
  await user.click(screen.getByRole("button", { name: action }));
  const dialog = await screen.findByRole(role, { name: title });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  expect(within(dialog).getByRole("button", { name: "Avbryt" })).toBeTruthy();
});
