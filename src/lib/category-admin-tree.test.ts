import { describe, expect, it } from "vitest";
import {
  collectDescendantIds,
  depthOf,
  flattenTree,
  getProjection,
  getSubtreeDepth,
} from "./category-admin-tree";

// root-a (0) → child-a1 (1) → grand-a1 (2); root-b (1) uten barn.
const categories = [
  { id: "root-b", parent_id: null, sort_order: 2 },
  { id: "grand-a1", parent_id: "child-a1", sort_order: 1 },
  { id: "child-a2", parent_id: "root-a", sort_order: 2 },
  { id: "child-a1", parent_id: "root-a", sort_order: 1 },
  { id: "root-a", parent_id: null, sort_order: 1 },
];

describe("kategoritreet i admin", () => {
  it("flater ut treet dybde-først i sort_order og hopper over sammenslåtte barn", () => {
    expect(flattenTree(categories, new Set()).map((c) => [c.id, c.depth])).toEqual([
      ["root-a", 0],
      ["child-a1", 1],
      ["grand-a1", 2],
      ["child-a2", 1],
      ["root-b", 0],
    ]);
    expect(flattenTree(categories, new Set(["child-a1"])).map((c) => c.id)).toEqual([
      "root-a",
      "child-a1",
      "child-a2",
      "root-b",
    ]);
  });

  it("beregner dybde, underdybde og etterkommere", () => {
    expect(depthOf("grand-a1", categories)).toBe(2);
    expect(depthOf("root-b", categories)).toBe(0);
    expect(depthOf("orphan", [{ id: "orphan", parent_id: "missing", sort_order: 1 }])).toBe(0);
    expect(getSubtreeDepth(categories, "root-a")).toBe(2);
    expect(getSubtreeDepth(categories, "root-b")).toBe(0);
    expect([...collectDescendantIds(categories, "root-a")].sort()).toEqual([
      "child-a1",
      "child-a2",
      "grand-a1",
    ]);
  });

  describe("projeksjon under dra-og-slipp", () => {
    const flat = flattenTree(categories, new Set());

    it("gjør elementet til barn av forrige element når det dras mot høyre", () => {
      // root-b flyttes inn under child-a2 (dybde 2 er tillatt for et blad).
      expect(getProjection(flat, "root-b", 100, 50, categories)).toEqual({
        depth: 2,
        parentId: "child-a2",
      });
      expect(getProjection(flat, "root-b", 50, 50, categories)).toEqual({
        depth: 1,
        parentId: "root-a",
      });
    });

    it("begrenser dybden slik at et undertre aldri passerer maks dybde", () => {
      // root-a har undertre med dybde 2, så det kan bare ligge på rotnivå.
      const moved = [flat[4], ...flat.slice(0, 4)];
      expect(getProjection(moved, "root-a", 500, 50, categories)).toEqual({
        depth: 0,
        parentId: null,
      });
      // child-a1 har ett barnenivå og kan ikke ligge dypere enn 1.
      expect(getProjection(flat, "child-a1", 500, 50, categories)).toEqual({
        depth: 1,
        parentId: "root-a",
      });
    });

    it("holder elementet minst like dypt som neste element og ukjent id gir null", () => {
      // grand-a1 dras langt mot venstre, men neste element child-a2 har dybde 1.
      expect(getProjection(flat, "grand-a1", -500, 50, categories)).toEqual({
        depth: 1,
        parentId: "root-a",
      });
      expect(getProjection(flat, "unknown", 0, 50, categories)).toBeNull();
    });
  });
});
