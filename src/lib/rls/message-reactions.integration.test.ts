/** RLS integration tests: message_reactions. Run via `bun run test:rls`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { URL, SERVICE_ROLE_KEY, canRun, PASSWORD, signInWithRetry } from "../rls-test-helpers";
import { DB_RATE_LIMITS } from "@/lib/rate-limit-rules.server";

describe.skipIf(!canRun)("RLS: message_reactions", () => {
  const admin = canRun ? createClient(URL!, SERVICE_ROLE_KEY!) : null!;
  const suffix = Date.now();
  const emails = {
    buyer: `rls-reaction-buyer-${suffix}@example.com`,
    seller: `rls-reaction-seller-${suffix}@example.com`,
    outsider: `rls-reaction-outsider-${suffix}@example.com`,
  };
  const userIds: string[] = [];
  let listingId: string;
  let conversationId: string;
  let messageId: string;
  let deletedMessageId: string;

  beforeAll(async () => {
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userIds.push(data.user!.id);
      return data.user!.id;
    };
    const buyerId = await mkUser(emails.buyer);
    const sellerId = await mkUser(emails.seller);
    await mkUser(emails.outsider);

    const { data: listing, error: listingErr } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId,
        title: "Reaksjonstest",
        description: "Gyldig syntetisk beskrivelse for integrasjonstest.",
        price_nok: 100,
        status: "active",
      })
      .select("id")
      .single();
    if (listingErr) throw listingErr;
    listingId = listing.id;
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ listing_id: listing.id, buyer_id: buyerId, seller_id: sellerId })
      .select("id")
      .single();
    if (convErr) throw convErr;
    conversationId = conv.id;

    const { data: msgs, error: msgErr } = await admin
      .from("messages")
      .insert([
        { conversation_id: conversationId, sender_id: buyerId, body: "Hei!" },
        {
          conversation_id: conversationId,
          sender_id: buyerId,
          body: "Slettet",
          deleted_at: new Date().toISOString(),
        },
      ])
      .select("id, body");
    if (msgErr) throw msgErr;
    messageId = msgs.find((m) => m.body === "Hei!")!.id;
    deletedMessageId = msgs.find((m) => m.body === "Slettet")!.id;
  });

  afterAll(async () => {
    if (!canRun) return;
    await admin.from("message_reactions").delete().eq("conversation_id", conversationId);
    await admin.from("message_reaction_rate_limits").delete().in("user_id", userIds);
    await admin.from("messages").delete().eq("conversation_id", conversationId);
    await admin.from("conversations").delete().eq("id", conversationId);
    await admin.from("listings").delete().eq("id", listingId);
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("lar en deltaker reagere, bytte og fjerne reaksjonen", async () => {
    const seller = await signInWithRetry(emails.seller);
    expect(
      (await seller.rpc("set_message_reaction", { _message_id: messageId, _emoji: "👍" })).error,
    ).toBeNull();
    expect(
      (await seller.rpc("set_message_reaction", { _message_id: messageId, _emoji: "❤️" })).error,
    ).toBeNull();

    const buyer = await signInWithRetry(emails.buyer);
    const { data } = await buyer
      .from("message_reactions")
      .select("user_id, emoji, conversation_id")
      .eq("message_id", messageId);
    expect(data).toEqual([{ user_id: userIds[1], emoji: "❤️", conversation_id: conversationId }]);

    expect(
      (await seller.rpc("set_message_reaction", { _message_id: messageId, _emoji: null })).error,
    ).toBeNull();
    const { data: removed } = await buyer
      .from("message_reactions")
      .select("emoji")
      .eq("message_id", messageId);
    expect(removed).toEqual([{ emoji: null }]);
  });

  it("avviser emoji utenfor settet og reaksjon på slettet melding", async () => {
    const buyer = await signInWithRetry(emails.buyer);
    expect(
      (await buyer.rpc("set_message_reaction", { _message_id: messageId, _emoji: "🤡" })).error,
    ).not.toBeNull();
    expect(
      (await buyer.rpc("set_message_reaction", { _message_id: deletedMessageId, _emoji: "👍" }))
        .error,
    ).not.toBeNull();
  });

  it("skjuler reaksjoner og nekter skriving for andre enn partene", async () => {
    const outsider = await signInWithRetry(emails.outsider);
    expect(
      (await outsider.rpc("set_message_reaction", { _message_id: messageId, _emoji: "👍" })).error,
    ).not.toBeNull();
    const { data } = await outsider
      .from("message_reactions")
      .select("message_id")
      .eq("conversation_id", conversationId);
    expect(data).toEqual([]);
  });

  it("nekter direkte skriving til tabellen", async () => {
    const buyer = await signInWithRetry(emails.buyer);
    const { error } = await buyer.from("message_reactions").insert({
      message_id: messageId,
      user_id: userIds[0],
      conversation_id: conversationId,
      emoji: "👍",
    });
    expect(error).not.toBeNull();
    const { error: deleteError } = await buyer
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId);
    expect(deleteError).not.toBeNull();
  });

  it("nekter reaksjon når samtalen er blokkert", async () => {
    const { data: block, error: blockErr } = await admin
      .from("user_blocks")
      .insert({ blocker_id: userIds[1], blocked_id: userIds[0], scope: "all" })
      .select("id")
      .single();
    expect(blockErr).toBeNull();
    const buyer = await signInWithRetry(emails.buyer);
    expect(
      (await buyer.rpc("set_message_reaction", { _message_id: messageId, _emoji: "👍" })).error,
    ).not.toBeNull();
    await admin.from("user_blocks").delete().eq("id", block!.id);
  });

  it.each(["ban", "suspension"] as const)(
    "tilstandsovergang: eksisterende sesjon kan ikke reagere etter %s",
    async (kind) => {
      const buyer = await signInWithRetry(emails.buyer);
      expect(
        (await buyer.rpc("set_message_reaction", { _message_id: messageId, _emoji: "👍" })).error,
      ).toBeNull();
      const table = kind === "ban" ? "user_bans" : "user_suspensions";
      const { error } = await admin.from(table).insert(
        kind === "ban"
          ? { user_id: userIds[0], reason: "Reaksjonstest", banned_by: userIds[1] }
          : {
              user_id: userIds[0],
              reason: "Reaksjonstest",
              suspended_by: userIds[1],
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            },
      );
      expect(error).toBeNull();
      try {
        for (const emoji of ["❤️", null]) {
          const result = await buyer.rpc("set_message_reaction", {
            _message_id: messageId,
            _emoji: emoji,
          });
          expect(result.error?.code).toBe("23514");
        }
        const { data } = await admin
          .from("message_reactions")
          .select("emoji")
          .eq("message_id", messageId)
          .eq("user_id", userIds[0]);
        expect(data).toEqual([{ emoji: "👍" }]);
      } finally {
        await admin.from(table).delete().eq("user_id", userIds[0]);
      }
    },
  );

  it("stopper endringer over minuttkvoten og skjuler telleren", async () => {
    const seller = await signInWithRetry(emails.seller);
    let lastError: { message: string } | null = null;
    for (let i = 0; i <= DB_RATE_LIMITS.reactionChangesPerMinute; i++) {
      ({ error: lastError } = await seller.rpc("set_message_reaction", {
        _message_id: messageId,
        _emoji: i % 2 ? "👍" : "❤️",
      }));
    }
    expect(lastError?.message).toBe("rate_limited");

    const { data } = await seller.from("message_reaction_rate_limits").select("user_id");
    expect(data ?? []).toEqual([]);
  });
});
