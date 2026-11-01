import { expect, it } from "vitest";
import { getCategoryBehavior } from "./category-behavior";
it("beholder generiske publiseringskrav også uten private spesialmoduler", () => {
  for (const [group, boat] of [
    [null, false],
    [null, true],
    ["ukjent", false],
  ] as const) {
    expect(getCategoryBehavior(group, boat)).toMatchObject({
      requiresDeliveryMethod: true,
      requiresCategoryFilterValues: true,
      showGenericAttributes: true,
    });
  }
});
