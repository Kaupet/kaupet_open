// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCategoryBehavior, type CategoryBehavior } from "@/lib/category-behavior";
import { registerVertical, verticals } from "@/lib/verticals";

import type { WizardSharedProps } from "../types";
import { Price } from ".";

afterEach(() => {
  cleanup();
  delete verticals.buyerFee;
});

function baseProps(overrides: Partial<WizardSharedProps> = {}) {
  return {
    register: vi.fn(() => ({
      name: "price_nok",
      ref: vi.fn(),
      onChange: vi.fn(),
      onBlur: vi.fn(),
    })),
    errors: {},
    touchedFields: {},
    isFree: false,
    setValue: vi.fn(),
    priceNok: "",
    wtbMatch: null,
    behavior: getCategoryBehavior(null),
    calculatedBuyerFeeKr: null,
    attributes: {},
    onAttributesChange: vi.fn(),
    lockedFree: undefined,
    similarListings: undefined,
    ...overrides,
  } as unknown as WizardSharedProps;
}

describe("Price", () => {
  it("viser ikke '0' som verdi eller placeholder når feltet er tomt", () => {
    render(<Price {...baseProps()} />);

    const input = screen.getByLabelText(/Pris/) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("");
  });

  it("viser lignende-pris-hint kun ved minst 3 datapunkter", () => {
    const listings = (n: number[]) =>
      n.map((price_nok, i) => ({
        id: String(i),
        title: `Annonse ${i}`,
        price_nok,
        is_free: false,
        city: null,
        category_slug: null,
        attributes: null,
      }));

    const { rerender } = render(
      <Price {...baseProps({ similarListings: listings([1000, 1200]) })} />,
    );
    expect(screen.queryByText(/Lignende til salgs for/)).toBeNull();

    rerender(
      <Price {...baseProps({ similarListings: listings([1000, 1200, 2400, 2000, 1500]) })} />,
    );
    expect(screen.getByText("Lignende til salgs for 1 200–2 000 kr")).toBeTruthy();
  });

  it("holder prisen innenfor serverens grense på 10 000 000 kr", () => {
    const setValue = vi.fn();
    render(<Price {...baseProps({ setValue, priceNok: 10_000_001 })} />);
    expect(setValue).toHaveBeenCalledWith("price_nok", 10_000_000, expect.anything());
  });

  it("tilbyr «Gis bort gratis» og skjuler avgiften for generiske kategorier", () => {
    registerFee();
    render(<Price {...baseProps()} />);
    expect(screen.getByText("Gis bort gratis")).toBeTruthy();
    expect(screen.queryByText("Avgiftsfelt")).toBeNull();
  });

  it("viser kjøperavgiften og skjuler «Gis bort gratis» når behavior krever det", () => {
    registerFee();
    render(<Price {...baseProps({ behavior: feeBehavior, priceNok: 1000 })} />);
    expect(screen.queryByText("Gis bort gratis")).toBeNull();
    expect(screen.getByText("Avgiftsfelt")).toBeTruthy();
    expect((screen.getByLabelText("Pris synlig i annonse") as HTMLInputElement).value).toMatch(
      /^1\s250 kr$/,
    );
  });

  it("senker prisgrensen med avgiften, så totalen holder seg under grensen", () => {
    registerFee();
    const setValue = vi.fn();
    render(<Price {...baseProps({ behavior: feeBehavior, setValue, priceNok: 10_000_000 })} />);
    expect(setValue).toHaveBeenCalledWith("price_nok", 9_999_750, expect.anything());
  });

  it("viser bare prisen når ingen vertikal har registrert avgiften", () => {
    render(<Price {...baseProps({ behavior: feeBehavior, priceNok: 1000 })} />);
    expect(screen.queryByLabelText("Pris synlig i annonse")).toBeNull();
  });
});

const feeBehavior: CategoryBehavior = {
  ...getCategoryBehavior(null),
  buyerFee: true,
  allowsGiveaway: false,
};

function registerFee() {
  registerVertical({
    buyerFee: { addedOnTopKr: () => 250, Fields: () => <p>Avgiftsfelt</p> },
  });
}
