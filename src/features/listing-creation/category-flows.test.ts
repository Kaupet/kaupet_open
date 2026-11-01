import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CategoryNode } from "@/lib/category-filters";

import {
  DEFAULT_FIELD_GROUPS,
  effectiveFlowForCategory,
  resolveWizardPages,
  withRuntimeFieldGroups,
  type CategoryFlowRow,
} from "./category-flows";
import { registerVertical, verticals } from "@/lib/verticals";

const cats: CategoryNode[] = [
  { id: "parent", parent_id: null },
  { id: "child", parent_id: "parent" },
  { id: "other", parent_id: null },
];
const byId = new Map(cats.map((c) => [c.id, c]));

function row(partial: Partial<CategoryFlowRow> & { category_id: string }): CategoryFlowRow {
  return {
    id: partial.category_id,
    field_groups: DEFAULT_FIELD_GROUPS,
    sort_order: 0,
    ...partial,
  };
}

describe("effectiveFlowForCategory", () => {
  it("returns the default flow for a null category", () => {
    expect(effectiveFlowForCategory(null, [], byId)).toEqual({
      fieldGroups: ["category-select", ...DEFAULT_FIELD_GROUPS],
    });
  });

  it("returns the default flow when no category in the chain has a row", () => {
    expect(effectiveFlowForCategory("child", [], byId)).toEqual({
      fieldGroups: ["category-select", ...DEFAULT_FIELD_GROUPS],
    });
  });

  it("uses the category's own row when present", () => {
    const flows = [row({ category_id: "child", field_groups: ["photos", "review-publish"] })];
    expect(effectiveFlowForCategory("child", flows, byId).fieldGroups).toEqual([
      "category-select",
      "photos",
      "review-publish",
    ]);
  });

  it("inherits the nearest ancestor's row when the category itself has none", () => {
    const flows = [row({ category_id: "parent", field_groups: ["photos", "review-publish"] })];
    expect(effectiveFlowForCategory("child", flows, byId).fieldGroups).toEqual([
      "category-select",
      "photos",
      "review-publish",
    ]);
  });

  it("does not inherit a flow from an unrelated category", () => {
    const flows = [row({ category_id: "other", field_groups: ["photos"] })];
    expect(effectiveFlowForCategory("child", flows, byId).fieldGroups).toEqual([
      "category-select",
      ...DEFAULT_FIELD_GROUPS,
    ]);
  });

  it("lets a child row override an inherited parent row wholesale (no merging)", () => {
    const flows = [
      row({ category_id: "parent", field_groups: ["photos", "condition", "review-publish"] }),
      row({ category_id: "child", field_groups: ["photos", "review-publish"] }),
    ];
    expect(effectiveFlowForCategory("child", flows, byId).fieldGroups).toEqual([
      "category-select",
      "photos",
      "review-publish",
    ]);
  });

  it("deduplicates repeated field groups, keeping the first occurrence", () => {
    const flows = [
      row({
        category_id: "child",
        field_groups: [
          "photos",
          "category-attributes",
          "photos",
          "title",
          "description-keywords",
          "review-publish",
        ],
      }),
    ];
    expect(effectiveFlowForCategory("child", flows, byId).fieldGroups).toEqual([
      "category-select",
      "photos",
      "category-attributes",
      "title",
      "description-keywords",
      "review-publish",
    ]);
  });

  it("hoists photos first and drops title when entered from the landing screen", () => {
    expect(effectiveFlowForCategory(null, [], byId, "title").fieldGroups).toEqual([
      "photos",
      "category-attributes",
      "condition",
      "price",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ]);
  });

  it("keeps title right after photos, without category-select, on the photos-first entry", () => {
    expect(effectiveFlowForCategory(null, [], byId, "photos").fieldGroups).toEqual([
      "photos",
      "title",
      "category-attributes",
      "condition",
      "price",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ]);
  });
});

describe("resolveWizardPages", () => {
  const flowWithCategorySelect = ["category-select", ...DEFAULT_FIELD_GROUPS];

  it("bruker de samme fire oppgavesidene på web og native", () => {
    const expected = [
      ["category-select"],
      ["photos", "title"],
      ["category-attributes", "description-keywords"],
      ["condition", "price", "delivery", "location"],
      ["review-publish"],
    ];
    expect(resolveWizardPages(flowWithCategorySelect, { native: false })).toEqual(expected);
    expect(resolveWizardPages(flowWithCategorySelect, { native: true })).toEqual(expected);
  });

  it("produces fewer, smaller pages for a category with fewer groups", () => {
    const groups = ["photos", "title", "category-attributes", "review-publish"];
    const expected = [["photos", "title"], ["category-attributes"], ["review-publish"]];
    expect(resolveWizardPages(groups, { native: false })).toEqual(expected);
    expect(resolveWizardPages(groups, { native: true })).toEqual(expected);
  });

  it("handles an empty field-group list", () => {
    expect(resolveWizardPages([], { native: false })).toEqual([]);
    expect(resolveWizardPages([], { native: true })).toEqual([]);
  });

  it("beholder første kategoriside etter bekreftelse når påkrevde attributter finnes", () => {
    const beforeConfirmation = [
      "photos",
      "category-confirm",
      "category-attributes",
      "condition",
      "price",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ];
    const afterConfirmation = beforeConfirmation.filter((key) => key !== "category-confirm");

    for (const native of [false, true]) {
      expect(resolveWizardPages(beforeConfirmation, { native })).toEqual([
        ["photos"],
        ["category-confirm"],
        ["category-attributes", "description-keywords"],
        ["condition", "price", "delivery", "location"],
        ["review-publish"],
      ]);
      expect(resolveWizardPages(afterConfirmation, { native })[1]).toEqual([
        "category-attributes",
        "description-keywords",
      ]);
    }
  });

  it("grupperer båtflyten i de samme oppgavene på web og native", () => {
    const groups = [
      "photos",
      "boat-facts",
      "category-attributes",
      "description-keywords",
      "delivery",
      "location",
      "review-publish",
    ];

    const expected = [
      ["photos"],
      ["boat-facts", "category-attributes", "description-keywords"],
      ["delivery", "location"],
      ["review-publish"],
    ];
    expect(resolveWizardPages(groups, { native: false })).toEqual(expected);
    expect(resolveWizardPages(groups, { native: true })).toEqual(expected);
  });
});
describe("withRuntimeFieldGroups", () => {
  const landingFlow = ["photos", "category-attributes", "description-keywords", "review-publish"];

  it("puts category-confirm right after photos while the suggestion is unconfirmed", () => {
    expect(withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: true })).toEqual([
      "photos",
      "category-confirm",
      "category-attributes",
      "description-keywords",
      "review-publish",
    ]);
  });

  it("drops category-confirm once the category is confirmed", () => {
    expect(withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: false })).toEqual(
      landingFlow,
    );
  });

  it("adds no runtime groups to a flow no vertical owns", () => {
    expect(withRuntimeFieldGroups(landingFlow, { showCategoryConfirm: false })).toEqual(
      landingFlow,
    );
  });
});

it.each([false, true])("holder kategoriforslag alene på steg 2 (native=%s)", (native) => {
  const keys = withRuntimeFieldGroups(
    ["photos", "title", "category-attributes", "description-keywords", "review-publish"],
    { showCategoryConfirm: true },
  );
  expect(resolveWizardPages(keys, { native })[1]).toEqual(["category-confirm"]);
});

// Kjernen kjenner bare flaggene på vertikalens feltgrupper (VerticalFieldGroup),
// ikke nøklene. Kjøretøyets egen flyt testes i field-groups/vehicle-flow.test.ts.
describe("en registrert vertikal som eier flyten", () => {
  const groupBase = { classification: "requiredToPublish" as const, Component: () => null };
  beforeAll(() => {
    registerVertical({
      fieldGroups: {
        owner: {
          ...groupBase,
          key: "owner",
          labelNb: "Eier",
          solo: true,
          flow: {
            normalize: (keys) => keys.filter((key) => key !== "title"),
            runtimeGroups: ["runtime"],
            onSubcategorySelect: (previous) => previous,
            adminOrder: (stored) => stored,
            adminInfoNb: "",
          },
        },
        facts: { ...groupBase, key: "facts", labelNb: "Fakta", forceBreakBefore: true },
        runtime: { ...groupBase, key: "runtime", labelNb: "Kjøring", solo: true, task: "trade" },
      },
    });
  });
  afterAll(() => {
    delete verticals.fieldGroups;
  });

  it("lar eieren normalisere de lagrede nøklene", () => {
    const flows = [
      row({ category_id: "child", field_groups: ["owner", "photos", "title", "review-publish"] }),
    ];
    expect(effectiveFlowForCategory("child", flows, byId).fieldGroups).toEqual([
      "category-select",
      "owner",
      "photos",
      "review-publish",
    ]);
  });

  it("legger eierens kjøretidsgrupper rett før publisering", () => {
    expect(
      withRuntimeFieldGroups(["photos", "owner", "facts", "review-publish"], {
        showCategoryConfirm: false,
      }),
    ).toEqual(["photos", "owner", "facts", "runtime", "review-publish"]);
  });

  it("deler sidene i biter med solo-grupper og sideskift", () => {
    const groups = ["photos", "owner", "facts", "condition", "price", "runtime", "location"];
    expect(resolveWizardPages(groups, { native: false })).toEqual([
      ["photos"],
      ["owner"],
      ["facts", "condition", "price"],
      ["runtime"],
      ["location"],
    ]);
    expect(resolveWizardPages(groups, { native: true })).toEqual(groups.map((key) => [key]));
  });

  it("gir vertikalens grupper oppgaven sin i en flyt uten eier", () => {
    expect(
      resolveWizardPages(["photos", "price", "runtime", "review-publish"], { native: false }),
    ).toEqual([["photos"], ["price", "runtime"], ["review-publish"]]);
  });
});
