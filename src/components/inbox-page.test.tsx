// @vitest-environment jsdom
// kaupet_open: generiske kontrakter; private produktcaser er utelatt.
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxPage } from "./inbox-page";
import { lastConversationMessages } from "@/lib/conversation-messages";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
const pushStatus = vi.hoisted(() => ({
  loading: true,
  supported: false,
  messagesActive: false,
  permission: "default" as NotificationPermission,
  subscribedHere: false,
  enableOnThisDevice: vi.fn<() => Promise<void>>(),
}));
type ConversationMessagesModule = typeof import("@/lib/conversation-messages");
vi.mock("@/lib/conversation-messages", async (importOriginal) => {
  const actual = await importOriginal<ConversationMessagesModule>();
  return { ...actual, lastConversationMessages: vi.fn(async () => new Map()) };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/pull-to-refresh-indicator", () => ({ PullToRefreshIndicator: () => null }));
vi.mock("@/hooks/use-pull-to-refresh", () => ({
  usePullToRefresh: () => ({ refreshing: false, pullDistance: 0 }),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-push-status", () => ({
  usePushStatus: () => pushStatus,
}));
vi.mock("@/lib/storage", () => ({ signListingImageUrls: vi.fn(async () => ({})) }));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
const updateEq = vi.fn(() => ({ is: vi.fn(async () => ({ data: null, error: null })) }));
const conversationUpdate = vi.fn();
const listingConversation = {
  id: "conv-1",
  buyer_id: "user-1",
  seller_id: "seller-1",
  listing_id: "listing-1",
  last_message_at: "2026-09-10T10:00:00Z",
  buyer_last_read_at: null,
  seller_last_read_at: null,
  buyer_deleted_at: null,
  seller_deleted_at: null,
  listing: {
    id: "listing-1",
    title: "2026 Mercedes-benz Amg c 63",
    price_nok: 690000,
    is_free: false,
    status: "active",
    attributes: { omregistreringsavgift_override_kr: 7505 },
    categories: { slug: "bil" },
    listing_images: [],
  },
  buyer: { id: "user-1", display_name: "Kjøper", avatar_url: null, deleted_at: null },
  seller: { id: "seller-1", display_name: "Selger", avatar_url: null, deleted_at: null },
};
let conversationsData: unknown[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "system_messages") {
        return {
          select: () => ({
            order: async () => ({
              data: [
                {
                  id: "sys-1",
                  body: "Velkommen til tjenesten",
                  created_at: "2026-09-01T10:00:00Z",
                  read_at: null,
                },
              ],
              error: null,
            }),
          }),
          update: () => ({ eq: updateEq }),
        };
      }
      if (table === "conversations") {
        return {
          update: (values: unknown) => {
            conversationUpdate(values);
            return { eq: async () => ({ error: null }) };
          },
          select: () => ({
            or: () => ({
              order: async () => ({ data: conversationsData, error: null }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return { select: () => ({ in: () => ({ order: async () => ({ data: [] }) }) }) };
      }
      return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
    },
  },
}));
afterEach(() => {
  cleanup();
  updateEq.mockClear();
  conversationUpdate.mockClear();
  conversationsData = [];
  vi.mocked(lastConversationMessages).mockReset().mockResolvedValue(new Map());
  Object.assign(pushStatus, {
    loading: true,
    supported: false,
    messagesActive: false,
    permission: "default",
    subscribedHere: false,
  });
  pushStatus.enableOnThisDevice.mockReset();
  localStorage.removeItem("kaupet_push_msg_hint_dismissed_v1");
});
describe("InboxPage – systemmeldinger", () => {
  it("viser ikke systemmeldinger fra teamet i innboksen", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { findByText, queryByText } = render(
      <QueryClientProvider client={qc}>
        <InboxPage />
      </QueryClientProvider>,
    );
    await findByText("Ingen samtaler enda");
    expect(queryByText("Velkommen til tjenesten")).toBeNull();
    expect(queryByText(/teamet$/)).toBeNull();
  });
});
it("feilgjetting: viser feil i stedet for tom innboks når meldingene ikke kan hentes", async () => {
  const user = userEvent.setup();
  conversationsData = [
    {
      ...listingConversation,
      listing: {
        ...listingConversation.listing,
        title: "Sykkel til salgs",
        price_nok: 1500,
        attributes: {},
        categories: null,
      },
    },
  ];
  vi.mocked(lastConversationMessages)
    .mockRejectedValueOnce(new Error("Kunne ikke laste meldinger"))
    .mockResolvedValue(new Map());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { findByText, queryByText, getByRole, getByText } = render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );
  await findByText("Kunne ikke hente samtalene");
  expect(getByRole("button", { name: "Prøv igjen" })).toBeTruthy();
  expect(queryByText("Ingen samtaler enda")).toBeNull();
  await user.click(getByRole("button", { name: "Prøv igjen" }));
  await findByText("Sykkel til salgs");
  expect(getByText("Selger")).toBeTruthy();
});

it("lar brukeren flytte samtalen til papirkurven og gjenopprette den", async () => {
  const user = userEvent.setup();
  conversationsData = [
    {
      ...listingConversation,
      listing: {
        ...listingConversation.listing,
        title: "Sykkel til salgs",
        price_nok: 1500,
        attributes: {},
        categories: null,
      },
    },
  ];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );

  await screen.findByText("Sykkel til salgs");
  await user.click(screen.getByRole("button", { name: "Flytt samtale til papirkurven" }));
  expect(conversationUpdate).toHaveBeenCalledWith({ buyer_deleted_at: expect.any(String) });

  await user.click(screen.getByRole("tab", { name: "Papirkurv" }));
  await screen.findByText("Sykkel til salgs");
  await user.click(screen.getByRole("button", { name: "Gjenopprett samtale" }));
  expect(conversationUpdate).toHaveBeenLastCalledWith({ buyer_deleted_at: null });
});

it("viser eller skjuler samtalene i annonsegruppen", async () => {
  const user = userEvent.setup();
  conversationsData = [
    {
      ...listingConversation,
      listing: {
        ...listingConversation.listing,
        title: "Sykkel til salgs",
        price_nok: 1500,
        attributes: {},
        categories: null,
      },
    },
  ];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );

  await screen.findByText("Selger");
  const group = screen.getByRole("button", { name: /Sykkel til salgs/ });
  await user.click(group);
  expect(screen.queryByText("Selger")).toBeNull();
  await user.click(group);
  expect(await screen.findByText("Selger")).toBeTruthy();
});

it("viser selgeren og ulest siste melding for kjøperen", async () => {
  conversationsData = [
    {
      ...listingConversation,
      listing: {
        ...listingConversation.listing,
        title: "Sykkel til salgs",
        price_nok: 1500,
        attributes: {},
        categories: null,
      },
    },
  ];
  vi.mocked(lastConversationMessages).mockResolvedValue(
    new Map([
      [
        "conv-1",
        {
          body: "Den er fortsatt ledig.",
          created_at: "2026-09-10T10:00:00Z",
          sender_id: "seller-1",
          deleted_at: null,
          attachment_path: null,
        },
      ],
    ]),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Selger")).toBeTruthy();
  expect(screen.getByText("Den er fortsatt ledig.")).toBeTruthy();
  expect(screen.getByLabelText("1 uleste")).toBeTruthy();
  expect(screen.getByLabelText("Ulest")).toBeTruthy();
  expect(screen.queryByText("Kjøper")).toBeNull();
});

it("skjuler innholdet i slettede meldinger og viser bildevedlegg som bilde", async () => {
  conversationsData = [
    {
      ...listingConversation,
      listing: {
        ...listingConversation.listing,
        title: "Sykkel til salgs",
        price_nok: 1500,
        attributes: {},
        categories: null,
      },
    },
    {
      ...listingConversation,
      id: "conv-2",
      listing: {
        ...listingConversation.listing,
        title: "Sykkel til salgs",
        price_nok: 1500,
        attributes: {},
        categories: null,
      },
    },
  ];
  vi.mocked(lastConversationMessages).mockResolvedValue(
    new Map([
      [
        "conv-1",
        {
          body: "Privat tekst som ble slettet",
          created_at: "2026-09-10T10:00:00Z",
          sender_id: "seller-1",
          deleted_at: "2026-09-10T11:00:00Z",
          attachment_path: null,
        },
      ],
      [
        "conv-2",
        {
          body: "",
          created_at: "2026-09-10T10:00:00Z",
          sender_id: "seller-1",
          deleted_at: null,
          attachment_path: "listing/message.jpg",
        },
      ],
    ]),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/2 samtaler/)).toBeTruthy();
  expect(screen.getByText("Melding slettet")).toBeTruthy();
  expect(screen.getByText("📷 Bilde")).toBeTruthy();
  expect(screen.queryByText("Privat tekst som ble slettet")).toBeNull();
});

it("lar brukeren aktivere push-varsel og skjule påminnelsen", async () => {
  const user = userEvent.setup();
  Object.assign(pushStatus, { loading: false, supported: true });
  pushStatus.enableOnThisDevice.mockResolvedValue(undefined);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );

  await screen.findByText("Få varsel om nye meldinger");
  await user.click(screen.getByRole("button", { name: "Aktiver push-varsler" }));
  expect(pushStatus.enableOnThisDevice).toHaveBeenCalledWith("messages");
  expect(showSuccessToast).toHaveBeenCalledWith("Push-varsler er aktivert på denne enheten");
  await user.click(screen.getByRole("button", { name: "Skjul melding" }));
  expect(screen.queryByText("Få varsel om nye meldinger")).toBeNull();
});

it("forklarer blokkert push og viser feil når aktivering mislykkes", async () => {
  const user = userEvent.setup();
  Object.assign(pushStatus, { loading: false, supported: true, permission: "denied" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Push-varsler er blokkert")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Skjul melding" }));
  expect(screen.queryByText("Push-varsler er blokkert")).toBeNull();

  localStorage.removeItem("kaupet_push_msg_hint_dismissed_v1");
  Object.assign(pushStatus, { permission: "default" });
  pushStatus.enableOnThisDevice.mockRejectedValue(new Error("Failed to fetch"));
  view.unmount();
  const retryQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={retryQueryClient}>
      <InboxPage />
    </QueryClientProvider>,
  );
  await screen.findByText("Få varsel om nye meldinger");
  await user.click(screen.getByRole("button", { name: "Aktiver push-varsler" }));
  expect(showErrorToast).toHaveBeenCalledWith("Ingen nettverksforbindelse. Prøv igjen");
});
