// @vitest-environment jsdom

import type * as ReactStart from "@tanstack/react-start";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { PublishActions, ReviewPublishGroup } from ".";

const categoryFilters = vi.hoisted(() => ({
  current: [] as import("@/lib/category-filters").CategoryFilter[],
}));
const turnstileOptions = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock("@/components/turnstile", () => ({
  Turnstile: ({ options }: { options: Record<string, unknown> }) => {
    turnstileOptions.current = options;
    return null;
  },
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactStart>()),
  useServerFn: () => vi.fn().mockResolvedValue({ token: "test-token" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-category-filters", () => ({
  useAllCategoryFilters: () => ({ data: categoryFilters.current }),
}));
afterEach(cleanup);

describe("ReviewPublishGroup", () => {
  afterEach(() => {
    categoryFilters.current = [];
  });

  it("viser harde publiseringskrav separat og lar anbefalinger passeres når kravene er oppfylt", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const view = (publishingRequirementErrors: string[]) => (
      <form onSubmit={onSubmit}>
        <ReviewPublishGroup
          {...({
            native: true,
            behavior: { requiresDeliveryMethod: false },
            categories: [],
            categoryId: "",
            images: [],
            title: "Kort",
            subtitle: undefined,
            previewPrice: null,
            city: undefined,
            postalCode: undefined,
            categoryLabel: "Møbler",
            attributes: {},
            mutationIsPending: false,
            uploadProgress: null,
            improvementGroupKeys: ["photos", "price", "location"],
            publishingRequirementErrors,
            onEditReviewSection: vi.fn(),
          } as unknown as WizardSharedProps)}
        />
        <PublishActions
          native
          turnstileEnabled={false}
          turnstileRef={{ current: null }}
          mutationIsPending={false}
          onCancel={vi.fn()}
        />
      </form>
    );
    const { rerender } = render(view(["Tittelen må være minst 5 tegn"]));

    expect(screen.getByText("1 opplysning må fylles ut")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tittelen må være minst 5 tegn" })).toBeTruthy();
    expect(screen.queryByText("Klar til publisering")).toBeNull();

    rerender(view([]));
    expect(screen.getByText("Klar til publisering")).toBeTruthy();
    expect(screen.getByText("Legg til bilder, så finner flere den")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publiser" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("viser annonsesiden fra ny-annonse.tsx som selve Se over-visningen", () => {
    render(
      <ReviewPublishGroup
        {...({
          native: false,
          attributes: {},
          mutationIsPending: false,
          uploadProgress: null,
          improvementGroupKeys: [],
          publishingRequirementErrors: [],
          reviewListing: <p>Annonsesiden</p>,
        } as unknown as WizardSharedProps)}
      />,
    );

    expect(screen.getByText("Annonsesiden")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Se full forhåndsvisning" })).toBeNull();
  });
});

describe("PublishActions", () => {
  it.each([false, true])(
    "viser Turnstile-utfordringen bare når brukerinteraksjon kreves",
    (native) => {
      render(
        <PublishActions
          native={native}
          turnstileEnabled
          turnstileRef={{ current: null }}
          mutationIsPending={false}
          onCancel={vi.fn()}
        />,
      );

      expect(turnstileOptions.current).toEqual({
        appearance: "interaction-only",
        action: "kaupet",
      });
    },
  );
});
