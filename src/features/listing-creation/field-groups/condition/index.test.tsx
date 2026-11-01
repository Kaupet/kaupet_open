// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCategoryBehavior } from "@/lib/category-behavior";

import type { WizardSharedProps } from "../types";
import { Condition } from ".";

afterEach(() => cleanup());

describe("Condition", () => {
  it("viser tilstandsvalgene som en radiogruppe av rader, ikke en nedtrekksliste", () => {
    const setValue = vi.fn();
    render(
      <Condition
        setValue={setValue as unknown as WizardSharedProps["setValue"]}
        condition={null}
        behavior={getCategoryBehavior(null)}
        categoryId=""
        categories={[]}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Tilstand" });
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(5);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(group.querySelector("select")).toBeNull();

    const good = screen.getByRole("radio", { name: /Pent brukt/ });
    expect(good.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(good);
    expect(setValue).toHaveBeenCalledWith("condition", "good", { shouldValidate: true });
  });

  it("markerer valgt tilstand med aria-checked", () => {
    render(
      <Condition
        setValue={vi.fn() as unknown as WizardSharedProps["setValue"]}
        condition="new"
        behavior={getCategoryBehavior(null)}
        categoryId=""
        categories={[]}
      />,
    );

    expect(screen.getByRole("radio", { name: /Helt ny/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("bruker kategoriens egne tilstandsvalg uten beskrivelse når behavior har dem", () => {
    const conditionOptions = vi.fn(() => [{ value: "good" as const, label: "Bruktbil" }]);
    render(
      <Condition
        setValue={vi.fn() as unknown as WizardSharedProps["setValue"]}
        condition={null}
        behavior={{ ...getCategoryBehavior(null), conditionOptions }}
        categoryId="c1"
        categories={[{ id: "c1", slug: "bil" } as WizardSharedProps["categories"][number]]}
      />,
    );

    expect(conditionOptions).toHaveBeenCalledWith("bil");
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Bruktbil" })).toBeTruthy();
  });
});
