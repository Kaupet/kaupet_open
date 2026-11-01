import { describe, expect, it } from "vitest";

import { isValidMapCoordinate, KARTVERKET_TILE_LAYER } from "./kartverket-map";

describe("Kartverket-kartlag", () => {
  it("har ingen ekstern kartleverandør", () => {
    expect(KARTVERKET_TILE_LAYER).toEqual({ url: "", attribution: "" });
  });

  it("avviser koordinater som ikke kan vises på kartet", () => {
    expect(isValidMapCoordinate({ lat: 59.91, lng: 10.75 })).toBe(true);
    expect(isValidMapCoordinate({ lat: Number.NaN, lng: 10.75 })).toBe(false);
    expect(isValidMapCoordinate({ lat: 59.91, lng: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidMapCoordinate({ lat: 91, lng: 10.75 })).toBe(false);
    expect(isValidMapCoordinate(null)).toBe(false);
  });
});
