import { describe, expect, it } from "vitest";

import { applyReaction, groupReactions } from "./reactions";

describe("applyReaction", () => {
  const a = { message_id: "m1", user_id: "u1", emoji: "👍" };

  it("legger til, erstatter samme persons reaksjon og fjerner ved null", () => {
    const added = applyReaction(undefined, a);
    expect(added).toEqual([a]);
    const replaced = applyReaction(added, { ...a, emoji: "❤️" });
    expect(replaced).toEqual([{ ...a, emoji: "❤️" }]);
    expect(applyReaction(replaced, { ...a, emoji: null })).toEqual([]);
  });

  it("lar andre personers og meldingers reaksjoner stå", () => {
    const other = { message_id: "m1", user_id: "u2", emoji: "😂" };
    const otherMessage = { message_id: "m2", user_id: "u1", emoji: "🙏" };
    expect(applyReaction([other, otherMessage], { ...a, emoji: null })).toEqual([
      other,
      otherMessage,
    ]);
    expect(groupReactions([a, other, otherMessage]).get("m1")).toEqual([a, other]);
  });
});
