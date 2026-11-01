// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FieldGroup } from "./field-groups/registry";
import {
  isReviewEditFinished,
  reviewEditTarget,
  useWizardNavigation,
} from "./use-wizard-navigation";
import type { WizardPage } from "./use-listing-steps";

vi.mock("@/lib/verticals", () => ({ verticalFieldGroups: () => [] }));
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));

function pages(...pageKeys: string[][]): WizardPage[] {
  return pageKeys.map((keys) => ({
    groups: keys.map((key) => ({ key }) as unknown as FieldGroup),
  }));
}

describe("reviewEditTarget", () => {
  const flow = pages(
    ["photos"],
    ["category-attributes"],
    ["price", "location"],
    ["review-publish"],
  );

  it("hopper til første og siste side for seksjonens feltgrupper", () => {
    expect(reviewEditTarget(flow, "details")).toEqual({ first: 2, last: 3 });
    expect(reviewEditTarget(flow, "content")).toEqual({ first: 1, last: 1 });
  });

  it("lar eksplisitt groupKey gå foran seksjonen", () => {
    expect(reviewEditTarget(flow, "details", { groupKey: "photos" })).toEqual({
      first: 1,
      last: 1,
    });
  });

  it("faller tilbake til seksjonen når groupKey ikke finnes på noen side", () => {
    expect(reviewEditTarget(flow, "location", { groupKey: "ukjent" })).toEqual({
      first: 3,
      last: 3,
    });
  });

  it("gir null når ingen side har seksjonens grupper (landing-flyten uten category-select)", () => {
    expect(reviewEditTarget(flow, "category")).toBeNull();
  });
});

describe("isReviewEditFinished", () => {
  it("er sann bare på siste steg i en pågående review-redigering", () => {
    expect(isReviewEditFinished(true, 3, 3)).toBe(true);
    expect(isReviewEditFinished(true, 2, 3)).toBe(false);
    expect(isReviewEditFinished(false, 3, 3)).toBe(false);
    expect(isReviewEditFinished(true, 3, null)).toBe(false);
  });
});

describe("navigasjon fra forhåndsvisningen", () => {
  it("hopper til redigeringssteget, nullstiller valideringsfeil og husker retursteget", () => {
    const setValidationError = vi.fn();
    const setCategoryEditConfirmOpen = vi.fn();
    const { result } = renderHook(() =>
      useWizardNavigation({
        pages: pages(["photos"], ["category-attributes"], ["price"], ["review-publish"]),
        categoryId: "category-id",
        setValidationError,
        setCategoryEditConfirmOpen,
      }),
    );

    act(() => result.current.setStep(4));
    act(() =>
      result.current.editReviewSection("details", { field: "price", reviewAnchor: "details" }),
    );

    expect(result.current.step).toBe(2);
    expect(result.current.returnToReviewRef.current).toBe(true);
    expect(result.current.reviewSectionLastStepRef.current).toBe(3);
    expect(setValidationError).toHaveBeenCalledWith(null);
    expect(setCategoryEditConfirmOpen).not.toHaveBeenCalled();
  });

  it("åpner kategoriendring fra forhåndsvisningen når flyten ikke har et kategoristeg", () => {
    const setCategoryEditConfirmOpen = vi.fn();
    const { result } = renderHook(() =>
      useWizardNavigation({
        pages: pages(["photos"], ["review-publish"]),
        categoryId: "category-id",
        setValidationError: vi.fn(),
        setCategoryEditConfirmOpen,
      }),
    );

    act(() => result.current.editReviewSection("category"));

    expect(setCategoryEditConfirmOpen).toHaveBeenCalledWith(true);
    expect(result.current.returnToReviewRef.current).toBe(true);
    expect(result.current.reviewSectionLastStepRef.current).toBeNull();
  });

  it("avbryter returmodus når brukeren går tilbake manuelt", () => {
    const { result } = renderHook(() =>
      useWizardNavigation({
        pages: pages(["photos"], ["price"], ["review-publish"]),
        categoryId: "category-id",
        setValidationError: vi.fn(),
        setCategoryEditConfirmOpen: vi.fn(),
      }),
    );
    act(() => result.current.editReviewSection("details"));
    expect(result.current.returnToReviewRef.current).toBe(true);

    act(() => result.current.goBack());
    expect(result.current.step).toBe(1);
    expect(result.current.returnToReviewRef.current).toBe(false);
    expect(result.current.reviewSectionLastStepRef.current).toBeNull();
    expect(result.current.pendingReviewFocusRef.current).toBeNull();
  });
});
