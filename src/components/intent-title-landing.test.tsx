// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WTB_AVAILABLE } from "@/features/wtb/availability";
import { IntentTitleLanding } from "./intent-title-landing";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

afterEach(cleanup);

beforeEach(() => {
  mocks.navigate.mockReset();
});

describe("IntentTitleLanding", () => {
  it("viser bare overskriften og valgene", () => {
    render(<IntentTitleLanding />);

    expect(screen.getByRole("heading", { name: "Hva vil du opprette?" })).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((b) => b.querySelector("span.font-semibold")?.textContent),
    ).toEqual(
      ["Jeg vil selge", "Jeg leter etter", "Jeg vil gi bort"].filter(
        (label) => WTB_AVAILABLE || label !== "Jeg leter etter",
      ),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(
    (
      [
        ["Jeg vil selge", { to: "/ny-annonse", search: { type: "sell", start: "bilder" } }],
        ["Jeg vil gi bort", { to: "/ny-annonse", search: { type: "free", start: "bilder" } }],
        ["Jeg leter etter", { to: "/ny-ok-annonse" }],
      ] as [string, object][]
    ).filter(([label]) => WTB_AVAILABLE || label !== "Jeg leter etter"),
  )("«%s» starter annonseflyten direkte", (label, target) => {
    const onNavigate = vi.fn();
    render(<IntentTitleLanding onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));

    expect(mocks.navigate).toHaveBeenCalledWith(target);
    expect(onNavigate).toHaveBeenCalled();
  });
});
