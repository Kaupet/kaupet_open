import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ from: vi.fn(), context: {} as unknown }));
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({ server: (fn: unknown) => ({ client: () => fn }) }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: (input: { data: unknown; context: unknown }) => unknown;
    const fn = (input: { data?: unknown } = {}) =>
      handler({ data: validator(input.data), context: state.context });
    return Object.assign(fn, {
      middleware: () => fn,
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));

import { createBlock, deleteBlock, listBlocksAgainstMe, listMyBlocks } from "./blocks.functions";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const blockId = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  state.context = { userId, supabase: { from: state.from } };
});

describe("blokkering", () => {
  it("oppretter en samtaleblokk på vegne av en deltaker med riktig annonse", async () => {
    const inserted: unknown[] = [];
    state.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { id: conversationId, buyer_id: userId, seller_id: otherId, listing_id: "listing" },
          error: null,
        }),
        insert: async (row: unknown) => {
          inserted.push([table, row]);
          return { error: null };
        },
      };
      return query;
    });

    await expect(
      createBlock({
        data: {
          targetUserId: otherId,
          scope: "conversation",
          conversationId,
          reason: "Uønsket kontakt",
        },
      }),
    ).resolves.toEqual({ ok: true, alreadyBlocked: false });
    expect(inserted).toEqual([
      [
        "user_blocks",
        {
          blocker_id: userId,
          blocked_id: otherId,
          scope: "conversation",
          conversation_id: conversationId,
          listing_id: "listing",
          reason: "Uønsket kontakt",
        },
      ],
    ]);
  });

  it("avviser egenblokkering og samtaler utenfor brukerens deltakelse", async () => {
    await expect(
      createBlock({ data: { targetUserId: userId, scope: "all" } }),
    ).rejects.toMatchObject({
      status: 400,
    });
    state.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: conversationId,
              buyer_id: otherId,
              seller_id: "55555555-5555-4555-8555-555555555555",
            },
            error: null,
          }),
        }),
      }),
    });

    await expect(
      createBlock({ data: { targetUserId: otherId, scope: "conversation", conversationId } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("krever samtale-ID og avviser samtaler som mangler eller peker på en annen mottaker", async () => {
    await expect(
      createBlock({ data: { targetUserId: otherId, scope: "conversation" } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.from).not.toHaveBeenCalled();

    state.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
    await expect(
      createBlock({ data: { targetUserId: otherId, scope: "conversation", conversationId } }),
    ).rejects.toMatchObject({ status: 404 });

    state.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: conversationId,
              buyer_id: userId,
              seller_id: "55555555-5555-4555-8555-555555555555",
            },
            error: null,
          }),
        }),
      }),
    });
    await expect(
      createBlock({ data: { targetUserId: otherId, scope: "conversation", conversationId } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("behandler en allerede opprettet blokk som en vellykket handling", async () => {
    state.from.mockReturnValue({
      insert: async () => ({ error: { code: "23505", message: "already exists" } }),
    });
    await expect(createBlock({ data: { targetUserId: otherId, scope: "all" } })).resolves.toEqual({
      ok: true,
      alreadyBlocked: true,
    });
  });

  it("viser egne blokkeringer med tilhørende profil og annonse, uten dupliserte oppslag", async () => {
    const rows = [
      {
        id: blockId,
        blocker_id: userId,
        blocked_id: otherId,
        scope: "all",
        listing_id: "listing",
        conversation_id: null,
        reason: null,
        created_at: "2026-10-01",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        blocker_id: userId,
        blocked_id: otherId,
        scope: "conversation",
        listing_id: "listing",
        conversation_id: conversationId,
        reason: null,
        created_at: "2026-09-01",
      },
    ];
    state.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => ({ data: rows, error: null }),
        in: async () =>
          table === "profiles"
            ? { data: [{ id: otherId, display_name: "Ada", avatar_url: null }] }
            : { data: [{ id: "listing", title: "Sykkel" }] },
      };
      return query;
    });

    await expect(listMyBlocks()).resolves.toMatchObject([
      { blocked_profile: { display_name: "Ada" }, listing: { title: "Sykkel" } },
      { blocked_profile: { display_name: "Ada" }, listing: { title: "Sykkel" } },
    ]);
    expect(state.from).toHaveBeenCalledTimes(3);
  });

  it("returnerer tom liste når brukeren ikke har blokkert noen", async () => {
    state.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    });
    await expect(listMyBlocks()).resolves.toEqual([]);
    expect(state.from).toHaveBeenCalledTimes(1);
  });

  it("sletter bare blokken via den innloggede brukerens eierskap og viser blokker mot meg", async () => {
    const filters: unknown[][] = [];
    state.from.mockImplementation((table: string) => {
      const query = {
        error: null,
        delete: () => query,
        eq: (...args: unknown[]) => {
          filters.push([table, ...args]);
          return query;
        },
        select: () => ({
          eq: async (...args: unknown[]) => {
            filters.push([table, ...args]);
            return {
              data: [{ scope: "all", blocker_id: otherId, conversation_id: null }],
              error: null,
            };
          },
        }),
      };
      return query;
    });

    await deleteBlock({ data: { blockId } });
    await expect(listBlocksAgainstMe()).resolves.toEqual([
      { scope: "all", blocker_id: otherId, conversation_id: null },
    ]);
    expect(filters).toEqual([
      ["user_blocks", "id", blockId],
      ["user_blocks", "blocker_id", userId],
      ["user_blocks", "blocked_id", userId],
    ]);
  });
});
