import { describe, expect, it } from "vitest";
import { assertDraftActor } from "./draft-actor";

describe("DEF-DRAFT-01: server actor boundary", () => {
  it("accepts the original user", () => {
    expect(() => assertDraftActor("a", "a")).not.toThrow();
  });
  it("rejects a changed session before creating a row", () => {
    expect(() => assertDraftActor("a", "b")).toThrow("Kontoen er endret");
    try {
      assertDraftActor("a", "b");
    } catch (error) {
      expect(error).toMatchObject({ status: 409 });
    }
  });
  it("keeps existing non-composer callers compatible without weakening their own authorization", () => {
    expect(() => assertDraftActor(undefined, "a")).not.toThrow();
  });
});
