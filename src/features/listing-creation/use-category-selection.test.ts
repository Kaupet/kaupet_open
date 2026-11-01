// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttributeMap } from "@/components/attribute-fields";
import { useCategorySelectionActions, useCategorySelectionState } from "./use-category-selection";

const spies = {
  setAttributes: vi.fn(),
  setAttributesTouched: vi.fn(),
  setValue: vi.fn(),
  goToNextPage: vi.fn(),
  applyCategorySuggestion: vi.fn(),
  setReviewJumpRequested: vi.fn(),
  setStep: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

function useSelection(attributes: AttributeMap, pageKeys: string[]) {
  const returnToReviewRef = { current: false };
  const reviewSectionLastStepRef = { current: null as number | null };
  const state = useCategorySelectionState();
  const actions = useCategorySelectionActions({
    state,
    categoryId: "old-category",
    verticalRootCategoryId: null,
    attributes,
    setAttributes: spies.setAttributes,
    setAttributesTouched: spies.setAttributesTouched,
    setValue: spies.setValue,
    currentPage: { groups: pageKeys.map((key) => ({ key })) } as never,
    goToNextPage: spies.goToNextPage,
    applyCategorySuggestion: spies.applyCategorySuggestion,
    returnToReviewRef,
    reviewSectionLastStepRef,
    setReviewJumpRequested: spies.setReviewJumpRequested,
    setStep: spies.setStep,
    subcategoryLocked: false,
    subcategoryPageIndex: -1,
  });
  return {
    state,
    actions,
    ...spies,
  };
}

describe("valg av annonsekategori", () => {
  it("ber om bekreftelse før kategoribytte som forkaster utfylte egenskaper", () => {
    const { result } = renderHook(() => useSelection({ color: "blå" }, ["category-attributes"]));

    act(() => result.current.actions.requestCategorySelect("wizard", "new-category", "parent"));
    expect(result.current.state.pendingCategoryChange).toEqual({
      id: "new-category",
      parentId: "parent",
      via: "wizard",
      kind: "select",
    });
    expect(result.current.setValue).not.toHaveBeenCalled();

    act(() => result.current.actions.confirmPendingCategoryChange());
    expect(result.current.setAttributes).toHaveBeenCalledWith({});
    expect(result.current.setAttributesTouched).toHaveBeenCalledWith(false);
    expect(result.current.setValue).toHaveBeenCalledWith("category_id", "new-category", {
      shouldValidate: true,
    });
    expect(result.current.state.pendingCategoryChange).toBeNull();
    expect(result.current.state.categoryConfirmed).toBe(true);
  });

  it("går videre etter direkte valg på kategoristeget når ingen egenskaper går tapt", () => {
    const { result } = renderHook(() => useSelection({}, ["category-select"]));
    act(() => result.current.actions.requestCategorySelect("wizard", "new-category", "parent"));

    expect(result.current.setValue).toHaveBeenCalledWith("category_id", "new-category", {
      shouldValidate: true,
    });
    expect(result.current.goToNextPage).toHaveBeenCalledOnce();
    expect(result.current.state.pendingCategoryChange).toBeNull();
  });

  it("lar forslag fylle kategorien og bekrefte det aktuelle steget", () => {
    const { result } = renderHook(() => useSelection({}, ["category-confirm"]));
    act(() => result.current.actions.applySuggestedCategory("suggested-category"));

    expect(result.current.applyCategorySuggestion).toHaveBeenCalledWith("suggested-category");
    expect(result.current.state.categoryConfirmed).toBe(true);
    expect(result.current.goToNextPage).not.toHaveBeenCalled();
  });
});
