import { beforeEach, describe, expect, it, vi } from "vitest";

import { EDITION } from "@/lib/edition";

const state = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), context: {} as unknown }));
vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({ server: () => ({ client: (fn: unknown) => fn }) }),
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
vi.mock("@/lib/admin-auth.server", () => ({ requireAdminRole: vi.fn() }));
vi.mock("@/lib/moderator-auth.server", () => ({ requireAdminOrModeratorRole: vi.fn() }));

import { adminDisableListing, submitReport, submitUserReport } from "./admin-moderation.functions";
import { requireAdminRole } from "./admin-auth.server";

const sender = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
const message = {
  id: messageId,
  conversation_id: "conversation",
  sender_id: sender,
  body: "Bud: 7 500 kr",
  attachment_path: null,
  deleted_at: null,
  offer_id: "offer",
};
let messageResult: { data: typeof message | null; error: Error | null };
let offerResult: { data: { comment: string | null } | null; error: Error | null };

beforeEach(() => {
  vi.clearAllMocks();
  messageResult = { data: message, error: null };
  offerResult = { data: { comment: "Ærlig bud — kan hente i dag 👍" }, error: null };
  state.context = { supabase: { from: state.from, rpc: state.rpc }, userId: "reporter" };
  state.rpc.mockResolvedValue({ error: null });
  state.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => (table === "messages" ? messageResult : offerResult),
    };
    return query;
  });
});
const report = (extra = {}) =>
  submitUserReport({
    data: {
      reportedUserId: sender,
      messageId,
      reason: "Trakassering",
      comment: "Min forklaring",
      ...extra,
    },
  });

describe("rapportering av meldinger og bud", () => {
  it.skipIf(EDITION === "open")(
    "siterer budkommentaren fra databasen før rapportørens forklaring",
    async () => {
      await report();
      expect(state.rpc).toHaveBeenCalledWith("submit_user_report", {
        _reported_user_id: sender,
        _reason: "Trakassering",
        _comment: `Melding ${messageId}: «Bud: 7 500 kr\n\nÆrlig bud — kan hente i dag 👍»\n\nMin forklaring`,
      });
    },
  );
  it.skipIf(EDITION === "open")(
    "bevarer hele budkommentaren når en lang forklaring kuttes",
    async () => {
      const quote = "æ".repeat(500);
      offerResult.data = { comment: quote };
      await report({ comment: "x".repeat(1000) });
      const text = state.rpc.mock.calls[0][1]._comment as string;
      expect(text).toHaveLength(1000);
      expect(text).toContain(quote);
    },
  );
  it.skipIf(EDITION === "open").each([null, ""])(
    "håndterer bud uten kommentar (%s)",
    async (comment) => {
      offerResult.data = { comment };
      await report();
      expect(state.rpc.mock.calls[0][1]._comment).toBe(
        `Melding ${messageId}: «Bud: 7 500 kr»\n\nMin forklaring`,
      );
    },
  );
  it("beholder vanlig meldingsrapportering uten budoppslag", async () => {
    messageResult.data = { ...message, offer_id: null } as unknown as typeof message;
    await report();
    expect(state.from).not.toHaveBeenCalledWith("offers");
    expect(state.rpc.mock.calls[0][1]._comment).toContain("«Bud: 7 500 kr»");
  });
  it.each(["skjult", "slettet", "annen avsender"])("avviser en melding som er %s", async (kind) => {
    messageResult.data =
      kind === "skjult"
        ? null
        : ({
            ...message,
            deleted_at: kind === "slettet" ? "2026-10-23T12:00:00Z" : null,
            sender_id: kind === "annen avsender" ? "annen" : sender,
          } as unknown as typeof message);
    await expect(report()).rejects.toThrow("Fant ikke meldingen");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.skipIf(EDITION === "open")(
    "avviser et bud som ikke er lesbart med rapportørens RLS",
    async () => {
      offerResult.data = null;
      await expect(report()).rejects.toThrow("Fant ikke budet");
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );
  it.skipIf(EDITION === "open")("oppretter ingen rapport hvis budoppslaget feiler", async () => {
    offerResult.error = new Error("database unavailable");
    await expect(report()).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("avviser ugyldig meldings-ID før databaseoppslag", () => {
    expect(() => report({ messageId: "ikke-en-uuid" })).toThrow();
    expect(state.from).not.toHaveBeenCalled();
  });
  it("sender en annonsemelding til rapport-RPC-en og lar serverfeil komme tilbake", async () => {
    await submitReport({
      data: { listingId: messageId, reason: "Villedende annonse", comment: "Æøå 👍" },
    });
    expect(state.rpc).toHaveBeenCalledWith("submit_listing_report", {
      _listing_id: messageId,
      _reason: "Villedende annonse",
      _comment: "Æøå 👍",
    });

    state.rpc.mockResolvedValueOnce({ error: new Error("database unavailable") });
    await expect(
      submitReport({ data: { listingId: messageId, reason: "Spam" } }),
    ).rejects.toThrow();
  });
  it("krever administrator før annonsen deaktiveres", async () => {
    const id = messageId;
    vi.mocked(requireAdminRole).mockRejectedValueOnce(new Error("Mangler administratorrolle"));
    await expect(adminDisableListing({ data: { id, reason: "Brudd på vilkår" } })).rejects.toThrow(
      "Mangler administratorrolle",
    );
    expect(state.rpc).not.toHaveBeenCalled();

    vi.mocked(requireAdminRole).mockResolvedValueOnce(undefined);
    await expect(adminDisableListing({ data: { id, reason: "Brudd på vilkår" } })).resolves.toEqual(
      {
        ok: true,
      },
    );
    expect(state.rpc).toHaveBeenCalledWith("admin_disable_listing", {
      _id: id,
      _reason: "Brudd på vilkår",
    });
  });
});
