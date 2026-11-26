// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NativeComposerDeck } from "./native-composer-deck";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function swipe(target: Element, fromX: number, toX: number, toY = 0) {
  fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: fromX, clientY: 0 });
  fireEvent.pointerMove(target, { pointerId: 1, isPrimary: true, clientX: toX, clientY: toY });
  fireEvent.pointerUp(target, { pointerId: 1, isPrimary: true, clientX: toX, clientY: toY });
}

describe("NativeComposerDeck", () => {
  it("beholder webinnhold uten kort- eller gest-wrapper", () => {
    render(
      <NativeComposerDeck enabled={false} onForward={vi.fn()}>
        Webinnhold
      </NativeComposerDeck>,
    );
    expect(screen.getByText("Webinnhold")).toBeTruthy();
    expect(screen.queryByTestId("native-composer-deck")).toBeNull();
  });

  it("fyller kortet som flex-kolonne med fill, uten fast høyde", () => {
    render(
      <NativeComposerDeck onForward={vi.fn()} fill>
        <p>Beskrivelse</p>
      </NativeComposerDeck>,
    );
    const deck = screen.getByTestId("native-composer-deck");
    const card = screen.getByTestId("native-composer-card");
    expect(deck.className).toContain("min-h-full");
    expect(deck.className).toContain("flex-col");
    expect(card.className).toContain("flex-1");
    expect(deck.style.height).toBe("");
  });

  it("legger ikke på fyll-layout uten fill", () => {
    render(
      <NativeComposerDeck onForward={vi.fn()}>
        <p>Vanlig steg</p>
      </NativeComposerDeck>,
    );
    expect(screen.getByTestId("native-composer-deck").className).not.toContain("min-h-full");
  });

  it("bruker samme fremoverhandling for swipe og lar bakoverswipe gå tilbake", async () => {
    const onForward = vi.fn().mockResolvedValue("advanced");
    const onBack = vi.fn();
    render(
      <NativeComposerDeck onForward={onForward} onBack={onBack}>
        <p>Aktivt kort</p>
      </NativeComposerDeck>,
    );
    const card = screen.getByTestId("native-composer-card");

    swipe(card, 120, 20);
    await waitFor(() => expect(onForward).toHaveBeenCalledOnce());
    swipe(card, 20, 120);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("kaprer ikke vertikal scroll eller gester fra interaktive kontroller", () => {
    const onForward = vi.fn().mockResolvedValue("advanced");
    render(
      <NativeComposerDeck onForward={onForward}>
        <textarea aria-label="Beskrivelse" />
        <div data-composer-no-swipe>Bildeflate</div>
      </NativeComposerDeck>,
    );

    swipe(screen.getByTestId("native-composer-card"), 100, 20, 100);
    swipe(screen.getByRole("textbox", { name: "Beskrivelse" }), 100, 0);
    swipe(screen.getByText("Bildeflate"), 100, 0);
    expect(onForward).not.toHaveBeenCalled();
  });

  it("fjerner translasjon ved redusert bevegelse", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(
      <NativeComposerDeck onForward={vi.fn().mockResolvedValue("advanced")}>
        Kort
      </NativeComposerDeck>,
    );
    const card = screen.getByTestId("native-composer-card");

    fireEvent.pointerDown(card, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, isPrimary: true, clientX: 20, clientY: 0 });
    expect((card as HTMLElement).style.transform).toBe("");
  });

  it("blokkerer et nytt swipe mens fremovernavigasjon pågår", async () => {
    let resolve!: (value: "advanced") => void;
    const onForward = vi.fn(() => new Promise<"advanced">((done) => (resolve = done)));
    render(<NativeComposerDeck onForward={onForward}>Kort</NativeComposerDeck>);
    const card = screen.getByTestId("native-composer-card");

    swipe(card, 100, 0);
    await waitFor(() => expect(card.getAttribute("aria-busy")).toBe("true"));
    swipe(card, 100, 0);
    expect(onForward).toHaveBeenCalledOnce();
    resolve("advanced");
  });

  it("starter neste kort fra motsatt side etter godkjent swipe", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    render(
      <NativeComposerDeck onForward={vi.fn().mockResolvedValue("advanced")}>
        Kort
      </NativeComposerDeck>,
    );
    const card = screen.getByTestId("native-composer-card");

    swipe(card, 120, 20);
    await waitFor(() => expect((card as HTMLElement).style.transform).toContain("48px"));
  });
});
