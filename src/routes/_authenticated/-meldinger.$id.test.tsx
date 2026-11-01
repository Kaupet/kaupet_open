// @vitest-environment jsdom
//
// "-"-prefiks med vilje, se src/routes/-index.test.tsx: TanStack Start
// scanner alt under src/routes/ som rutefiler uten prefikset. Vitest sitt
// glob (src/**/*.test.tsx) treffer fila fortsatt.

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITION } from "@/lib/edition";

// Regresjonstest for F16: realtime-kanalen for den åpne samtalen svarte 500 i
// staging uten at ["messages", id] (eller lesekvitteringene på
// ["conversation", id]) fikk noen fallback. Testen dekker kjernekontrakten:
// en mislykket kanalstatus skal slå på polling på begge spørringene, en
// vellykket skal la den stå av.

const mocks = vi.hoisted(() => ({
  statusCallback: null as ((status: string) => void) | null,
  statusCallbacks: [] as ((status: string) => void)[],
  queryCalls: [] as { key: unknown[]; opts: Record<string, unknown> }[],
  routeId: "conv-1",
  // Overstyrer default-svaret (undefined-data) for en gitt queryKey-prefiks —
  // brukes av blokkerings-testene under til å sette opp conv/myBlocks/
  // blocksAgainstMe uten å måtte kjøre de ekte queryFn-ene mot Supabase.
  queryData: {} as Record<string, unknown>,
  handlers: [] as { event: string; table: string; cb: (payload: { new: unknown }) => void }[],
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  setQueriesData: vi.fn(),
  mutate: vi.fn(),
  fetchNextPage: vi.fn().mockResolvedValue({}),
  cancelQueries: vi.fn().mockResolvedValue(undefined),
  infiniteState: {} as Record<string, unknown>,
  native: false,
  realQueryClient: null as import("@tanstack/react-query").QueryClient | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    useParams: () => ({ id: mocks.routeId }),
    useSearch: () => ({}),
    options,
  }),
  Link: ({ children, ...props }: { children?: ReactNode }) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] } & Record<string, unknown>) => {
    mocks.queryCalls.push({ key: opts.queryKey, opts });
    if (opts.queryKey[0] === "messages") return { data: [], isLoading: false };
    const prefix = opts.queryKey[0] as string;
    if (prefix in mocks.queryData) {
      return { data: mocks.queryData[prefix], isLoading: false, isError: false, error: null };
    }
    return { data: undefined, isLoading: false, isError: false, error: null };
  },
  useInfiniteQuery: (opts: { queryKey: unknown[] } & Record<string, unknown>) => {
    mocks.queryCalls.push({ key: opts.queryKey, opts });
    return {
      data: mocks.queryData.messages ?? {
        pages: [{ messages: [], nextCursor: undefined }],
        pageParams: [null],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
      ...mocks.infiniteState,
    };
  },
  useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
  useQueryClient: () =>
    mocks.realQueryClient ?? {
      invalidateQueries: mocks.invalidateQueries,
      setQueryData: mocks.setQueryData,
      setQueriesData: mocks.setQueriesData,
      getQueryData: () => mocks.queryData.messages,
      getQueriesData: () => [[["conversation", "conv-1"], mocks.queryData.conversation]],
      cancelQueries: mocks.cancelQueries,
    },
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (
      _type: string,
      filter: { event: string; table: string },
      cb: (payload: { new: unknown }) => void,
    ) => {
      mocks.handlers.push({ event: filter.event, table: filter.table, cb });
      return channel;
    },
    subscribe: (cb: (status: string) => void) => {
      mocks.statusCallback = cb;
      mocks.statusCallbacks.push(cb);
      return channel;
    },
  };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => mocks.native }));
vi.mock("@/hooks/use-form-factor", () => ({
  useFormFactor: () => "phone",
  useIsNarrow: () => true,
}));
vi.mock("@/hooks/use-keyboard-visible", () => ({ useKeyboardVisible: () => false }));
vi.mock("@/features/business-account/use-business-membership", () => ({
  useBusinessMembership: () => ({ data: undefined }),
}));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  IMAGE_ACCEPT: "image/*",
  signListingImageUrls: vi.fn(),
  signMessageAttachmentUrls: vi.fn().mockResolvedValue({}),
  uploadMessageAttachment: vi.fn(),
  validateImages: vi.fn(),
  describeImageError: vi.fn(),
}));
vi.mock("@/lib/messages.functions", () => ({ sendMessage: vi.fn() }));
vi.mock("@/lib/image-compression", () => ({ compressImage: vi.fn() }));
vi.mock("@/lib/blocks.functions", () => ({
  listMyBlocks: vi.fn(),
  listBlocksAgainstMe: vi.fn(),
}));
vi.mock("@/lib/sales.functions", () => ({
  confirmBuyer: vi.fn(),
  getSaleForListing: vi.fn(),
  unconfirmBuyer: vi.fn(),
}));
vi.mock("@/lib/reviews.functions", () => ({
  createReview: vi.fn(),
  getMyReviewForListing: vi.fn(),
}));
vi.mock("@/components/inbox-page", () => ({ InboxPage: () => null }));
vi.mock("@/components/meldinger/message-list", () => ({
  renderWithDayDividers: () => null,
}));
vi.mock("@/components/meldinger/message-actions", () => ({ MessageActions: () => null }));
vi.mock("@/components/meldinger/trade-panel", () => ({
  TradePanel: ({ sale }: { sale: unknown }) => (sale ? <p>Salgspanel</p> : null),
}));
vi.mock("@/components/trade-safety-advice", () => ({
  TradeSafetyAdvice: () => <p>Råd for trygg handel</p>,
}));
vi.mock("@/components/meldinger/use-conversation-offers", () => ({
  useConversationOffers: () => ({
    renderOffer: () => null,
    sheets: null,
    banner: null,
    canOffer: false,
    startOffer: vi.fn(),
    agreed: false,
  }),
}));

import { Route, MESSAGES_POLL_INTERVAL_MS } from "./meldinger.$id";

const ConversationPage = Route.options.component as ComponentType;

function lastQueryOptsFor(keyPrefix: string) {
  const calls = mocks.queryCalls.filter((c) => c.key[0] === keyPrefix);
  const opts = calls[calls.length - 1]?.opts;
  return (
    opts && {
      ...opts,
      refetchInterval:
        typeof opts.refetchInterval === "function"
          ? opts.refetchInterval({ state: { data: mocks.queryData[keyPrefix] } })
          : opts.refetchInterval,
    }
  );
}

beforeEach(() => {
  mocks.statusCallback = null;
  mocks.statusCallbacks = [];
  mocks.queryCalls = [];
  mocks.routeId = "conv-1";
  mocks.queryData = {};
  mocks.handlers = [];
  mocks.invalidateQueries.mockReset();
  mocks.setQueryData.mockReset();
  mocks.setQueriesData.mockReset();
  mocks.mutate.mockReset();
  mocks.infiniteState = {};
  mocks.native = false;
  mocks.realQueryClient = null;
  mocks.fetchNextPage.mockReset().mockResolvedValue({});
  mocks.cancelQueries.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("meldinger.$id — realtime-fallback (F16)", () => {
  it.skipIf(EDITION === "open")(
    "henter en annen samtales reservasjon til den er opphevet, også med fungerende realtime",
    () => {
      const listing = {
        id: "listing-1",
        title: "Sykkel",
        status: "active",
        reserved_until: new Date(Date.now() + 86_400_000).toISOString(),
        listing_images: [],
      };
      const reserved = baseConv({
        listing_id: "listing-1",
        holds_reservation: false,
        listing,
      });
      mocks.queryData.conversation = reserved;
      const view = render(<ConversationPage />);
      act(() => mocks.statusCallback?.("SUBSCRIBED"));
      expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);
      expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);

      mocks.queryData.conversation = {
        ...reserved,
        listing: { ...listing, reserved_until: null },
      };
      view.rerender(<ConversationPage />);
      expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
    },
  );

  it.each([true, false])("poller ikke en egen eller utløpt reservasjon (egen: %s)", (own) => {
    mocks.queryData.conversation = baseConv({
      holds_reservation: own,
      listing: {
        id: "listing-1",
        title: "Sykkel",
        reserved_until: new Date(Date.now() + (own ? 86_400_000 : -1)).toISOString(),
        listing_images: [],
      },
    });
    render(<ConversationPage />);
    act(() => mocks.statusCallback?.("SUBSCRIBED"));
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
  });

  it("slår ikke på polling mens kanalen er SUBSCRIBED", () => {
    render(<ConversationPage />);

    act(() => {
      mocks.statusCallback?.("SUBSCRIBED");
    });

    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
  });

  it("slår på polling på både meldinger og lesekvitteringer når kanalen ikke er SUBSCRIBED", () => {
    render(<ConversationPage />);

    act(() => {
      mocks.statusCallback?.("CHANNEL_ERROR");
    });

    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);
  });

  it("slår polling av igjen når kanalen kommer opp etter en feil", () => {
    render(<ConversationPage />);

    act(() => {
      mocks.statusCallback?.("TIMED_OUT");
    });
    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);

    act(() => {
      mocks.statusCallback?.("SUBSCRIBED");
    });
    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);
  });

  it("ignorerer CLOSED fra en utgått kanal etter samtalebytte", () => {
    const { rerender } = render(<ConversationPage />);
    const channel1Status = mocks.statusCallbacks[0];

    act(() => {
      channel1Status("SUBSCRIBED");
    });

    mocks.routeId = "conv-2";
    rerender(<ConversationPage />);
    const channel2Status = mocks.statusCallbacks[1];

    act(() => {
      channel2Status("SUBSCRIBED");
    });

    // Kanal 1 sin CLOSED kommer inn asynkront, etter at kanal 2 allerede
    // er SUBSCRIBED — den skal ikke slå på polling igjen.
    act(() => {
      channel1Status("CLOSED");
    });

    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
  });
});

it("lar brukeren hente eldre meldinger", async () => {
  mocks.infiniteState = { hasNextPage: true };
  mocks.queryData.conversation = baseConv();
  const view = render(<ConversationPage />);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Vis eldre meldinger" })));
  expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
});
it("henter ny reservasjonsfrist når motparten forlenger i samme samtale", async () => {
  mocks.queryData.conversation = baseConv({ holds_reservation: true, listing_id: "listing-1" });
  render(<ConversationPage />);
  act(() => mocks.statusCallback?.("SUBSCRIBED"));
  mocks.invalidateQueries.mockClear();

  const insert = mocks.handlers.find((h) => h.table === "messages" && h.event === "INSERT")!.cb;
  await act(async () => {
    await insert({
      new: {
        id: "reservation-extension",
        conversation_id: "conv-1",
        sender_id: "seller-1",
        body: "Annonsen er reservert til 25.10.2026 kl. 12:00.",
        created_at: "2026-10-21T12:00:00Z",
        deleted_at: null,
      },
    });
  });

  expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["conversation", "conv-1"],
  });
});

it.each(["user-1", "colleague-1"])(
  "tilstandsovergang: selgerklienten henter ny frist fra en annen klient (%s)",
  async (senderId) => {
    mocks.queryData.conversation = baseConv({
      buyer_id: "buyer-9",
      seller_id: "user-1",
      holds_reservation: true,
      listing_id: "listing-1",
    });
    render(<ConversationPage />);
    act(() => mocks.statusCallback?.("SUBSCRIBED"));
    mocks.invalidateQueries.mockClear();
    const insert = mocks.handlers.find((h) => h.table === "messages" && h.event === "INSERT")!.cb;
    await act(async () => {
      await insert({
        new: {
          id: "reservation-extension",
          conversation_id: "conv-1",
          sender_id: senderId,
          body: "Annonsen er reservert til 25.10.2026 kl. 12:00.",
          created_at: "2026-10-21T12:00:00Z",
          deleted_at: null,
        },
      });
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["conversation", "conv-1"] });
  },
);

it("henter ikke samtalen på nytt for egne kjøpermeldinger", async () => {
  mocks.queryData.conversation = baseConv({ listing_id: "listing-1" });
  render(<ConversationPage />);
  act(() => mocks.statusCallback?.("SUBSCRIBED"));
  mocks.invalidateQueries.mockClear();

  const insert = mocks.handlers.find((h) => h.table === "messages" && h.event === "INSERT")!.cb;
  await act(async () => {
    await insert({
      new: {
        id: "own",
        conversation_id: "conv-1",
        sender_id: "user-1",
        body: "Hei",
        created_at: "2026-10-21T12:00:00Z",
        deleted_at: null,
      },
    });
  });

  expect(mocks.invalidateQueries).not.toHaveBeenCalledWith({
    queryKey: ["conversation", "conv-1"],
  });
});

it("henter ikke samtalen på nytt når selgeren mottar en kjøpermelding", async () => {
  mocks.queryData.conversation = baseConv({
    buyer_id: "buyer-9",
    seller_id: "user-1",
    listing_id: "listing-1",
  });
  render(<ConversationPage />);
  act(() => mocks.statusCallback?.("SUBSCRIBED"));
  mocks.invalidateQueries.mockClear();

  const insert = mocks.handlers.find((h) => h.table === "messages" && h.event === "INSERT")!.cb;
  await act(async () => {
    await insert({
      new: {
        id: "from-buyer",
        conversation_id: "conv-1",
        sender_id: "buyer-9",
        body: "Hei",
        created_at: "2026-10-21T12:00:00Z",
        deleted_at: null,
      },
    });
  });

  expect(mocks.invalidateQueries).not.toHaveBeenCalledWith({
    queryKey: ["conversation", "conv-1"],
  });
});

// En realtime-INSERT under «Vis eldre meldinger» skal ikke avbryte hentingen
// (brukeren måtte klikke på nytt), men vente til den er ferdig — fetchNextPage
// bygger pages fra sidene som fantes da den startet.
it("avbryter ikke henting av eldre meldinger når en ny melding kommer", async () => {
  let finishOlder!: () => void;
  mocks.fetchNextPage.mockReturnValue(new Promise<void>((resolve) => (finishOlder = resolve)));
  mocks.infiniteState = { hasNextPage: true };
  const newest = { id: "m2", created_at: "2026-10-16T12:00:00Z" };
  mocks.queryData = {
    conversation: baseConv(),
    messages: { pages: [{ messages: [newest], nextCursor: newest }], pageParams: [null] },
  };
  const view = render(<ConversationPage />);
  fireEvent.click(view.getByRole("button", { name: "Vis eldre meldinger" }));
  const insert = mocks.handlers.find((h) => h.table === "messages" && h.event === "INSERT")!.cb;
  // Handleren venter på hentingen, så den kan ikke awaites her.
  let inserted!: Promise<unknown>;
  act(() => {
    inserted = Promise.resolve(insert({ new: { id: "m3", created_at: "2026-10-16T13:00:00Z" } }));
  });
  await act(async () => {});

  expect(mocks.cancelQueries).not.toHaveBeenCalled();
  expect(mocks.setQueryData).not.toHaveBeenCalledWith(["messages", "conv-1"], expect.anything());

  await act(async () => {
    finishOlder();
    await inserted;
  });
  const call = mocks.setQueryData.mock.calls.find(([key]) => key[0] === "messages");
  expect(call?.[0]).toEqual(["messages", "conv-1"]);
  const older = {
    pages: [
      { messages: [newest], nextCursor: newest },
      { messages: [{ id: "m1", created_at: "2026-10-15T12:00:00Z" }], nextCursor: undefined },
    ],
    pageParams: [null, newest],
  };
  const ids = call?.[1](older).pages.flatMap((p: { messages: { id: string }[] }) =>
    p.messages.map((m) => m.id),
  );
  expect(ids).toEqual(expect.arrayContaining(["m1", "m2", "m3"]));
});

it("avbryter en vanlig henting før en ny melding legges inn", async () => {
  mocks.queryData = { conversation: baseConv() };
  render(<ConversationPage />);
  const insert = mocks.handlers.find((h) => h.table === "messages" && h.event === "INSERT")!.cb;
  await act(async () => insert({ new: { id: "m3", created_at: "2026-10-16T13:00:00Z" } }));
  expect(mocks.cancelQueries).toHaveBeenCalledWith({ queryKey: ["messages", "conv-1"] });
});

it("viser feil ved henting av eldre meldinger og beholder nytt forsøk", () => {
  mocks.infiniteState = { hasNextPage: true, isFetchNextPageError: true };
  mocks.queryData.conversation = baseConv();
  const view = render(<ConversationPage />);
  expect(view.getByRole("alert").textContent).toContain("Kunne ikke hente eldre meldinger");
  expect(view.getByRole("button", { name: "Vis eldre meldinger" })).toBeTruthy();
});

it("beholder leseposisjonen når eldre sider eller lesekvitteringer lastes", () => {
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  try {
    const newest = { id: "m2", created_at: "2026-10-16T12:00:00Z" };
    mocks.queryData = {
      conversation: baseConv(),
      messages: { pages: [{ messages: [newest], nextCursor: newest }], pageParams: [null] },
    };
    const view = render(<ConversationPage />);
    const log = view.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { value: 1000, configurable: true });
    log.scrollTop = 30;
    mocks.queryData.conversation = baseConv({ seller_last_read_at: newest.created_at });
    mocks.queryData.messages = {
      pages: [
        { messages: [newest], nextCursor: newest },
        { messages: [{ id: "m1", created_at: "2026-10-15T12:00:00Z" }], nextCursor: undefined },
      ],
      pageParams: [null, newest],
    };
    view.rerender(<ConversationPage />);
    expect(log.scrollTop).toBe(30);
  } finally {
    raf.mockRestore();
  }
});

// Blokkerings-UI (App Store 1.2): komponenten skal vise en tydelig tilstand
// og deaktivere komposeren når innlogget bruker har blokkert motparten, eller
// er blokkert av den. useAuth er mocket til user-1, som er buyer_id i
// conv-fixturen under — otherId blir da seller-1.
function baseConv(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    buyer_id: "user-1",
    seller_id: "seller-1",
    listing_id: null,
    listing: null,
    isBusinessSeller: false,
    other: { id: "seller-1", display_name: "Selger", avatar_url: null },
    otherOrganization: null,
    otherDeleted: false,
    otherPending: false,
    buyer_last_read_at: null,
    seller_last_read_at: null,
    ...overrides,
  };
}

describe("meldinger.$id — blokkeringstilstand", () => {
  it("deaktiverer komposeren og viser blokkeringsbeskjed når jeg har blokkert motparten", () => {
    mocks.queryData = {
      conversation: baseConv(),
      "my-blocks": [{ scope: "all", blocked_id: "seller-1", conversation_id: null }],
      "blocks-against-me": [],
    };

    const { container } = render(<ConversationPage />);

    expect(container.textContent).toContain("Du har blokkert");
    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(true);
    expect(textarea?.getAttribute("placeholder")).toBe("Du har blokkert denne samtalen");
  });

  it("deaktiverer komposeren med en nøytral beskjed når motparten har blokkert meg", () => {
    mocks.queryData = {
      conversation: baseConv(),
      "my-blocks": [],
      "blocks-against-me": [{ blocker_id: "seller-1", scope: "all", conversation_id: null }],
    };

    const { container } = render(<ConversationPage />);

    expect(container.textContent).toContain("Du kan ikke sende meldinger i denne samtalen");
    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(true);
  });

  it("lar komposeren stå aktiv når ingen av partene har blokkert hverandre", () => {
    mocks.queryData = {
      conversation: baseConv(),
      "my-blocks": [],
      "blocks-against-me": [],
    };

    const { container } = render(<ConversationPage />);

    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(false);
  });
});

describe("meldinger.$id — kjøpsønsker, realtime og komposer", () => {
  const handler = (table: string, event: string) =>
    mocks.handlers.find((h) => h.table === table && h.event === event)?.cb;

  it("viser kjøpsønsket og skjuler salgspanelet i en samtale om et kjøpsønske", () => {
    mocks.queryData = {
      conversation: baseConv({
        wtb_listing_id: "wtb-1",
        wtbListing: { id: "wtb-1", title: "Ønsker sykkel", max_price_nok: null },
      }),
      "my-blocks": [],
      "blocks-against-me": [],
    };
    const view = render(<ConversationPage />);
    expect(view.container.textContent).toContain("Ønsker sykkel");
    expect(view.container.textContent).not.toContain("Annonsen er ikke lenger tilgjengelig");
    fireEvent.click(view.getByRole("button", { name: /åpne annonsevalg/ }));
    expect(view.getByRole("dialog")).toBeTruthy();
    expect(view.queryByText("Salgspanel")).toBeNull();
  });

  it("oppdaterer lesekvitteringen i den aktive samtalespørringen", () => {
    render(<ConversationPage />);
    act(() => handler("conversations", "UPDATE")?.({ new: { buyer_last_read_at: "t" } }));
    expect(mocks.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["conversation", "conv-1"] },
      expect.any(Function),
    );
  });

  it("skjuler en melding motparten sletter mens samtalen er åpen", () => {
    render(<ConversationPage />);
    const deleted = { id: "m1", body: "", deleted_at: "2026-10-13T10:00:00Z" };
    act(() => handler("messages", "UPDATE")?.({ new: deleted }));
    const call = mocks.setQueryData.mock.calls.find(([key]) => key[0] === "messages");
    expect(call?.[0]).toEqual(["messages", "conv-1"]);
    const data = {
      pages: [{ messages: [{ id: "m1", body: "hei", deleted_at: null }], nextCursor: undefined }],
      pageParams: [null],
    };
    expect(call?.[1](data).pages[0].messages).toEqual([
      { id: "m1", body: "", deleted_at: "2026-10-13T10:00:00Z" },
    ]);
  });

  it("tar ikke med uferdig tekst til neste samtale", () => {
    mocks.queryData = { conversation: baseConv(), "my-blocks": [], "blocks-against-me": [] };
    const { container, rerender } = render(<ConversationPage />);
    const textarea = container.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "Til samtale A" } });
    mocks.routeId = "conv-2";
    rerender(<ConversationPage />);
    expect(container.querySelector("textarea")!.value).toBe("");
  });
});

it("lar bedriftssuperbrukeren sende et bilde i en ansatts samtale", () => {
  mocks.queryData = {
    conversation: baseConv({
      buyer_id: "buyer-1",
      seller_id: "employee-1",
      isBusinessSeller: true,
      listing_id: "listing-1",
      listing: { id: "listing-1", title: "Bedriftens annonse", listing_images: [] },
    }),
    "my-blocks": [],
    "blocks-against-me": [],
  };
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:attachment");
      static revokeObjectURL = vi.fn();
    },
  );
  try {
    const { container, getByRole } = render(<ConversationPage />);
    expect(getByRole("button", { name: "Legg ved bilde" })).toBeDefined();
    const file = new File(["image"], "bilde.jpg", { type: "image/jpeg" });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    const send = getByRole("button", { name: "Send" });
    expect(send.hasAttribute("disabled")).toBe(false);
    fireEvent.click(send);
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1", file }),
    );
    fireEvent.click(getByRole("button", { name: /åpne annonsevalg/ }));
    expect(getByRole("dialog")).toBeTruthy();
    expect(container.ownerDocument.body.textContent).not.toContain("Salgspanel");
  } finally {
    vi.unstubAllGlobals();
  }
});

// PB-2/PB-8: ny melding skal bare flytte leseren ved bunnen eller egen sending.
it.each([
  { sender: "seller-1", top: 30, expected: 30, situation: "leser historikk" },
  { sender: "seller-1", top: 790, expected: 1000, situation: "er nær bunnen" },
  { sender: "user-1", top: 30, expected: 1000, situation: "sender selv fra historikken" },
])("ny melding når brukeren $situation", ({ sender, top, expected }) => {
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  try {
    const newest = { id: "m2", sender_id: "seller-1", created_at: "2026-10-16T12:00:00Z" };
    const older = { id: "m1", sender_id: "seller-1", created_at: "2026-10-15T12:00:00Z" };
    mocks.queryData = {
      conversation: baseConv(),
      messages: {
        pages: [
          { messages: [newest], nextCursor: newest },
          { messages: [older], nextCursor: undefined },
        ],
        pageParams: [null, newest],
      },
    };
    const view = render(<ConversationPage />);
    const log = view.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 200, configurable: true });
    log.scrollTop = top;
    fireEvent.scroll(log);
    mocks.queryData.messages = {
      pages: [
        {
          messages: [{ id: "m3", sender_id: sender, created_at: "2026-10-16T13:00:00Z" }, newest],
          nextCursor: newest,
        },
        { messages: [older], nextCursor: undefined },
      ],
      pageParams: [null, newest],
    };
    view.rerender(<ConversationPage />);
    expect(log.scrollTop).toBe(expected);
  } finally {
    raf.mockRestore();
  }
});

it.each([
  {
    table: "message_reactions",
    key: "message-reactions",
    before: { message_id: "m1", user_id: "buyer", emoji: "👍" },
    after: { message_id: "m1", user_id: "buyer", emoji: "❤️" },
  },
  ...(EDITION === "open"
    ? []
    : [
        {
          table: "offers",
          key: "offers",
          before: { id: "o1", created_at: "2026-10-21T12:00:00Z", status: "pending" },
          after: { id: "o1", created_at: "2026-10-21T12:00:00Z", status: "accepted" },
        },
      ]),
])(
  "beholder sanntidsendringen for $table når et eldre svar kommer sist",
  async ({ table, key, before, after }) => {
    const { QueryClient } =
      await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
    const client = new QueryClient();
    mocks.realQueryClient = client;
    const queryKey = [key, "conv-1"];
    client.setQueryData(queryKey, [before]);
    let finish!: (rows: unknown[]) => void;
    const fetching = client
      .fetchQuery({
        queryKey,
        queryFn: () =>
          new Promise<unknown[]>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    const view = render(<ConversationPage />);
    try {
      const handler = mocks.handlers.find((h) => h.table === table)!;
      await act(async () => {
        handler.cb({ new: after });
      });
      finish([before]);
      await fetching;
      await waitFor(() => expect(client.getQueryData(queryKey)).toEqual([after]));
    } finally {
      view.unmount();
      client.clear();
    }
  },
);

describe("meldinger.$id — samtaleskall (fase 1)", () => {
  it("skjuler bunnmenyen i en åpen samtale på native-telefon og viser den igjen etterpå", () => {
    mocks.native = true;
    const view = render(<ConversationPage />);
    expect(document.documentElement.classList.contains("conversation-open")).toBe(true);
    view.unmount();
    expect(document.documentElement.classList.contains("conversation-open")).toBe(false);
  });

  it("lar bunnmenyen stå på web", () => {
    render(<ConversationPage />);
    expect(document.documentElement.classList.contains("conversation-open")).toBe(false);
  });

  it.skipIf(EDITION === "open")("viser salget i annonsearket for en salgsannonse", () => {
    mocks.queryData = {
      conversation: baseConv({
        listing_id: "listing-1",
        listing: { id: "listing-1", kaupet_code: "K1", title: "Sykkel", listing_images: [] },
      }),
      "my-blocks": [],
      "blocks-against-me": [],
    };
    const view = render(<ConversationPage />);
    expect(view.getByRole("list", { name: "Status for handelen" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: /åpne annonsevalg/ }));
    expect(view.getByText("Salgspanel")).toBeTruthy();
  });
});

// Bedriftsmottakere finnes ikke i Open.
it.each(EDITION === "open" ? [false] : [true, false])(
  "beslutningstabell: viser riktig mottaker og handelsråd (bedrift: %s)",
  (business) => {
    mocks.queryData = {
      conversation: baseConv({
        listing_id: "listing-1",
        listing: {
          id: "listing-1",
          title: "Sykkel",
          organization_id: business ? "org-1" : null,
          listing_images: [],
        },
        otherOrganization: business
          ? { id: "org-1", name: "Sykkelbedriften", logoUrl: null }
          : null,
      }),
      "my-blocks": [],
      "blocks-against-me": [],
    };
    const view = render(<ConversationPage />);
    if (business) {
      expect(view.getByText(/Send den første meldingen til Sykkelbedriften/)).toBeTruthy();
      expect(view.getByRole("link", { name: "Se profilen til Sykkelbedriften" })).toBeTruthy();
      expect(view.queryByText(/med Selger/)).toBeNull();
      expect(view.queryByText("Råd for trygg handel")).toBeNull();
    } else {
      expect(view.getByText(/Send den første meldingen til Selger/)).toBeTruthy();
      expect(view.getByText("Råd for trygg handel")).toBeTruthy();
    }
  },
);

it.skipIf(EDITION === "open")(
  "lar kjøper vurdere bedriften selv om den opprinnelige ansatte har slettet kontoen",
  () => {
    mocks.queryData = {
      conversation: baseConv({
        listing_id: "listing-1",
        listing: { id: "listing-1", title: "Sykkel", organization_id: "org-1", listing_images: [] },
        otherDeleted: true,
        otherOrganization: { id: "org-1", name: "Sykkelbedriften", logoUrl: null },
      }),
      "listing-sale": { conversation_id: "conv-1", buyer_id: "user-1", seller_id: "seller-1" },
      "my-blocks": [],
      "blocks-against-me": [],
    };
    const view = render(<ConversationPage />);
    expect(view.getByText("Gi Sykkelbedriften en vurdering")).toBeTruthy();
  },
);
