import { describe, expect, it } from "vitest";

import { endsGroup, type Message } from "./message-list";
import { tradeStep } from "./trade-step";

const msg = (over: Partial<Message>): Message => ({
  id: "m",
  conversation_id: "c",
  sender_id: "a",
  body: "hei",
  created_at: "2026-10-20T10:00:00Z",
  deleted_at: null,
  ...over,
});

describe("endsGroup", () => {
  it("holder meldinger fra samme avsender innen fem minutter i én gruppe", () => {
    expect(endsGroup(msg({}), msg({ created_at: "2026-10-20T10:04:00Z" }))).toBe(false);
  });

  it("avslutter gruppen ved ny avsender, lang pause, slettet melding eller siste melding", () => {
    expect(endsGroup(msg({}), msg({ sender_id: "b" }))).toBe(true);
    expect(endsGroup(msg({}), msg({ created_at: "2026-10-20T10:06:00Z" }))).toBe(true);
    expect(endsGroup(msg({}), msg({ deleted_at: "2026-10-20T10:01:00Z" }))).toBe(true);
    expect(endsGroup(msg({}), undefined)).toBe(true);
  });
});

describe("tradeStep", () => {
  it("går Kontakt → Avtalt → Solgt", () => {
    const base = { hasMessages: true, agreed: false, soldInThisConversation: false };
    expect(tradeStep({ ...base, hasMessages: false })).toBeNull();
    expect(tradeStep(base)).toBe("contact");
    expect(tradeStep({ ...base, agreed: true })).toBe("agreed");
    expect(tradeStep({ ...base, agreed: true, soldInThisConversation: true })).toBe("sold");
  });
});
