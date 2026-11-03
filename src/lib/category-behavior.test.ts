import { expect, it } from "vitest";
import { getCategoryBehavior } from "./category-behavior";
import { filterCategoryBehavior } from "./category-filters";
it("beholder generiske publiseringskrav også uten private spesialmoduler", () => {
  // Uten registrert vertikal gir heller ikke et bransjefilter egen oppførsel.
  const filters = [{ category_id: "bater", key: "boat_type" }] as never;
  const byId = new Map([["bater", { id: "bater", parent_id: null }]]);
  expect(filterCategoryBehavior("bater", filters, byId)).toBeNull();
  for (const group of [null, "ukjent"]) {
    expect(
      getCategoryBehavior(group, filterCategoryBehavior("bater", filters, byId)),
    ).toMatchObject({
      requiresDeliveryMethod: true,
      requiresCategoryFilterValues: true,
      showGenericAttributes: true,
    });
  }
});
