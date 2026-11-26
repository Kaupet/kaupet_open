// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListingComposerShell } from "./listing-composer-shell";

vi.mock("@/components/native-page-header", () => ({
  NativePageHeader: ({ right, center }: { right?: ReactNode; center?: ReactNode }) => (
    <header>
      {center ?? "Ny annonse"}
      {right}
    </header>
  ),
}));

const { hapticNotification, hapticSelection } = vi.hoisted(() => ({
  hapticNotification: vi.fn(),
  hapticSelection: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ hapticNotification, hapticSelection }));

const keyboard = vi.hoisted(() => ({ visible: false }));
vi.mock("@/hooks/use-keyboard-visible", () => ({ useKeyboardVisible: () => keyboard.visible }));

function renderShell({
  firstStep = false,
  footer = "Fortsett",
  native = true,
  preview = null,
  previewSection,
  strength = null,
}: {
  firstStep?: boolean;
  footer?: string;
  native?: boolean;
  preview?: ReactNode;
  previewSection?: string;
  strength?: ReactNode;
} = {}) {
  const onBack = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <ListingComposerShell
      title="Ny annonse"
      pageKey="title"
      pageTitle="Tittel"
      native={native}
      onBack={onBack}
      onCancel={onCancel}
      footer={<button type="button">{footer}</button>}
      firstStep={firstStep}
      preview={preview}
      previewSection={previewSection}
      strength={strength}
    >
      Innhold
    </ListingComposerShell>,
  );
  return { onBack, onCancel, ...result };
}

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  keyboard.visible = false;
  cleanup();
  vi.clearAllMocks();
});

describe("ListingComposerShell", () => {
  it("beholder fokus når brukeren begynner å skrive før stegets fokusramme kjører", () => {
    let focusPage: FrameRequestCallback | undefined;
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      focusPage = callback;
      return 1;
    });
    try {
      render(
        <ListingComposerShell
          title="Ønskes kjøpt"
          pageKey="details"
          pageTitle="Siste detaljer"
          native={false}
          onCancel={vi.fn()}
          firstStep={false}
          footer={null}
        >
          <label htmlFor="price">Maks pris</label>
          <input id="price" type="number" />
        </ListingComposerShell>,
      );
      const input = screen.getByLabelText("Maks pris");
      input.focus();
      fireEvent.input(input, { target: { value: "1" } });
      focusPage?.(0);
      expect(document.activeElement).toBe(input);
    } finally {
      frame.mockRestore();
    }
  });

  it("flytter fokus til sidetittelen når første steg åpnes", () => {
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    renderShell();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Tittel", hidden: true }),
    );
    requestAnimationFrame.mockRestore();
  });

  it("viser fremdrift og kategoristi fast i native-headeren, uten bytte ved scroll", () => {
    const onEditCategory = vi.fn();
    render(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="title"
        pageTitle="Tittel"
        native
        onCancel={vi.fn()}
        progress={<span>Steg 2 av 5</span>}
        categoryLabel="Kjøretøy › Bil"
        onEditCategory={onEditCategory}
        footer={null}
        firstStep={false}
      >
        Innhold
      </ListingComposerShell>,
    );
    const header = screen.getByRole("banner");
    expect(header.textContent).toContain("Steg 2 av 5");
    expect(header.textContent).toContain("Kjøretøy › Bil");
    expect(header.textContent).not.toContain("Ny annonse");
    expect(screen.getAllByText("Steg 2 av 5")).toHaveLength(1);
    expect(screen.getAllByText("Kjøretøy › Bil")).toHaveLength(1);

    const card = screen.getByTestId("composer-page-title");
    card.scrollTop = 40;
    fireEvent.scroll(card);
    expect(header.textContent).toContain("Steg 2 av 5");

    fireEvent.click(screen.getByRole("button", { name: "Kjøretøy › Bil" }));
    expect(onEditCategory).toHaveBeenCalledOnce();
  });

  it("skjuler Forrige på første native steg", () => {
    const { container } = renderShell({ firstStep: true });
    expect(container.querySelector('button[aria-hidden="true"]')?.getAttribute("tabindex")).toBe(
      "-1",
    );
  });

  it("viser Forrige/Fortsett i footeren og Avbryt i headeren på et mellomsteg", () => {
    const { onBack, onCancel } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Forrige" }));
    fireEvent.click(screen.getByRole("button", { name: "Avbryt annonseopprettelse" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Fortsett" })).toBeTruthy();
  });

  it("holder Turnstile-utfordringen i rulleområdet og Neste i footeren", () => {
    const { container } = render(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="photos"
        pageTitle="Bilder"
        native
        onCancel={vi.fn()}
        footer={<button type="button">Neste</button>}
        challenge={<div role="group" aria-label="Cloudflare-verifisering" />}
        firstStep={false}
      >
        Bilder
      </ListingComposerShell>,
    );
    const scroll = container.querySelector('[data-composer-scroll="true"]');
    const footer = container.querySelector('[data-composer-footer="native"]');
    expect(scroll?.contains(screen.getByRole("group", { name: "Cloudflare-verifisering" }))).toBe(
      true,
    );
    expect(footer?.contains(screen.getByRole("button", { name: "Neste" }))).toBe(true);
  });

  it("gir ett lett valgsignal når native-kortet skifter", () => {
    const { rerender } = renderShell();
    rerender(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="description"
        pageTitle="Beskrivelse"
        native
        onBack={vi.fn()}
        onCancel={vi.fn()}
        footer={<button type="button">Fortsett</button>}
        firstStep={false}
      >
        Innhold
      </ListingComposerShell>,
    );
    expect(hapticSelection).toHaveBeenCalledOnce();
  });

  it("viser publisering i høyre posisjon på siste steg", () => {
    renderShell({ footer: "Publiser" });
    expect(screen.getByRole("button", { name: "Publiser" })).toBeTruthy();
  });

  it("viser Tilbake-chevron i webtoppstripa på et mellomsteg, ikke på første steg", () => {
    const { onBack, rerender } = renderShell({ native: false });
    fireEvent.click(screen.getByRole("button", { name: "Tilbake" }));
    expect(onBack).toHaveBeenCalledOnce();

    rerender(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="title"
        pageTitle="Tittel"
        native={false}
        onBack={vi.fn()}
        onCancel={vi.fn()}
        footer={<button type="button">Fortsett</button>}
        firstStep
      >
        Innhold
      </ListingComposerShell>,
    );
    expect(screen.queryByRole("button", { name: "Tilbake" })).toBeNull();
  });

  it("lar webfooteren være uten native kontrollrad, men viser lukk-knapp i toppstripa", () => {
    const { onCancel } = renderShell({ native: false });
    fireEvent.click(screen.getByRole("button", { name: "Avbryt annonseopprettelse" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Fortsett" })).toBeTruthy();
  });

  it("gjør webfooteren sticky under desktop og statisk fra desktop", () => {
    const { container } = renderShell({ native: false });
    const footer = container.querySelector('[data-composer-footer="web"]');
    expect(footer?.classList.contains("sticky")).toBe(true);
    expect(footer?.classList.contains("bottom-0")).toBe(true);
    expect(footer?.classList.contains("lg:static")).toBe(true);
  });
  it("åpner forhåndsvisningen fra stegraden i et eget panel og gir fokus tilbake ved lukking", async () => {
    const { container } = renderShell({
      native: false,
      preview: <div>Kjøpervisning</div>,
      strength: <div>2 opplysninger må fylles ut</div>,
    });
    const toolbar = container.querySelector('[data-composer-toolbar="desktop"]');
    const trigger = screen.getByRole("button", { name: "Forhåndsvis" });
    expect(toolbar?.contains(trigger)).toBe(true);
    expect(toolbar?.textContent).toContain("2 opplysninger må fylles ut");
    expect(toolbar?.classList.contains("lg:flex")).toBe(true);
    expect(trigger.classList.contains("dock:hidden")).toBe(true);

    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Slik ser kjøperen annonsen" });
    expect(panel.textContent).toContain("Kjøpervisning");

    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("viser forhåndsvisningen fast i telefonrammen og scroller rammen til delen steget redigerer", () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const { container } = renderShell({
        native: false,
        preview: <p data-preview-section="price">1 800 kr</p>,
        previewSection: "price",
      });
      const layout = container.querySelector('[data-composer-layout="preview-dock"]');
      const dock = container.querySelector("[data-composer-preview-dock]");
      expect(layout?.contains(dock)).toBe(true);
      expect(dock?.classList.contains("dock:block")).toBe(true);
      expect(dock?.querySelector("[inert]")?.textContent).toBe("1 800 kr");
      expect(scrollTo).toHaveBeenCalledOnce();
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("scroller telefonrammen til delen som endres når brukeren redigerer skjemaet", async () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const { container } = renderShell({
        native: false,
        preview: (
          <>
            <p data-preview-section="price">1 800 kr</p>
            <p data-testid="shipping">Frakt: 99 kr</p>
          </>
        ),
        previewSection: "price",
      });
      const shipping = screen.getByTestId("shipping");
      shipping.getBoundingClientRect = () =>
        ({ top: 900, bottom: 920, width: 200, height: 20 }) as DOMRect;
      scrollTo.mockClear();

      // Endringer i forhåndsvisningen uten redigering (f.eks. bilder som lastes) flytter ikke rammen.
      shipping.textContent = "Frakt: 129 kr";
      await Promise.resolve();
      expect(scrollTo).not.toHaveBeenCalled();

      fireEvent.input(container.querySelector('[data-testid="composer-page-title"]')!);
      shipping.textContent = "Frakt: 149 kr";
      await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce());
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("scroller endrede felt fram over den faste bunnlinjen, ikke bak den", async () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const { container } = renderShell({
        native: false,
        preview: (
          <>
            <p data-testid="location">Oslo</p>
            <div data-preview-sticky-bottom>1 800 kr</div>
          </>
        ),
      });
      const frame = container.querySelector<HTMLElement>("[data-phone-frame] > div")!;
      frame.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 }) as DOMRect;
      const sticky = container.querySelector<HTMLElement>("[data-preview-sticky-bottom]")!;
      Object.defineProperty(sticky, "offsetHeight", { value: 60 });
      // Innenfor rammen, men bak bunnlinjen (540–600).
      const location = screen.getByTestId("location");
      location.getBoundingClientRect = () =>
        ({ top: 560, bottom: 580, width: 200, height: 20 }) as DOMRect;

      fireEvent.input(container.querySelector('[data-testid="composer-page-title"]')!);
      location.textContent = "Bergen";
      await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce());
      // 580 − (600 − 60) + 16
      expect(scrollTo.mock.calls[0][0]).toMatchObject({ top: 56 });

      // Prisen i bunnlinjen er alltid synlig og flytter ikke rammen.
      scrollTo.mockClear();
      fireEvent.input(container.querySelector('[data-testid="composer-page-title"]')!);
      sticky.textContent = "1 900 kr";
      await Promise.resolve();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("utelater forhåndsvisning og annonsestyrke i native og beholder én kolonne", () => {
    const { container } = renderShell({
      native: true,
      preview: <div>Kjøpervisning</div>,
      strength: <div>Klar til publisering</div>,
    });
    expect(container.querySelector('[data-composer-toolbar="desktop"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Forhåndsvis" })).toBeNull();
    expect(container.querySelector('[data-composer-layout="single-column"]')).toBeTruthy();
    expect(
      container.querySelector('[data-composer-footer="native"]')?.classList.contains("pb-safe"),
    ).toBe(true);
  });

  it("bevarer native safe area og minst 48 piksler treffområde i composerfooteren", () => {
    const { container } = renderShell();
    const footer = container.querySelector('[data-composer-footer="native"]');
    expect(footer?.classList.contains("pb-safe")).toBe(true);
    expect(footer?.classList.contains("sticky")).toBe(false);
    expect(footer?.classList.contains("[&_button]:min-h-12")).toBe(true);
    expect(footer?.classList.contains("[&_button]:min-w-12")).toBe(true);
  });

  it("gir også mobilweb-knappene minst 48 piksler treffområde", () => {
    const { container } = renderShell({ native: false });
    const footer = container.querySelector('[data-composer-footer="web"]');
    expect(footer?.classList.contains("[&_button]:min-h-12")).toBe(true);
    expect(footer?.classList.contains("[&_button]:min-w-12")).toBe(true);
  });

  it("viser og nullstiller native valideringsrespons ved animationend", async () => {
    const { rerender } = renderShell();
    rerender(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="title"
        pageTitle="Tittel"
        native
        onBack={vi.fn()}
        onCancel={vi.fn()}
        errorSummary="Fyll inn tittelen før du fortsetter."
        validationAttempt={1}
        footer={<button type="button">Fortsett</button>}
        firstStep={false}
      >
        Innhold
      </ListingComposerShell>,
    );

    const page = screen.getByTestId("composer-page-title");
    await waitFor(() => expect(page.getAttribute("aria-invalid")).toBe("true"));
    expect(hapticNotification).toHaveBeenCalledWith("error");
    page.dispatchEvent(new Event("webkitAnimationEnd", { bubbles: true }));
    await waitFor(() => expect(page.getAttribute("aria-invalid")).toBeNull());
  });

  it("markerer native-skallet når tastaturet er åpent, så header og bunnlinje kan skjules", () => {
    keyboard.visible = true;
    const { container } = renderShell();
    const shell = container.querySelector(".native-composer-shell");
    expect(shell?.hasAttribute("data-keyboard-open")).toBe(true);
    // Headeren ligger i et data-composer-chrome-omslag; kortet gjør ikke det.
    expect(screen.getByRole("banner").closest("[data-composer-chrome]")).not.toBeNull();
    expect(screen.getByTestId("composer-page-title").closest("[data-composer-chrome]")).toBeNull();
  });

  describe("scroll til fokusert felt (native)", () => {
    function renderWithFields({ native = true }: { native?: boolean } = {}) {
      const ui = () => (
        <ListingComposerShell
          title="Ny annonse"
          pageKey="description"
          pageTitle="Beskrivelse"
          native={native}
          onCancel={vi.fn()}
          firstStep={false}
          footer={null}
        >
          <label htmlFor="mileage">Kilometerstand</label>
          <input id="mileage" />
          <section data-scroll-anchor data-testid="anchor">
            <label htmlFor="description">Beskrivelse</label>
            <textarea id="description" />
          </section>
        </ListingComposerShell>
      );
      const result = render(ui());
      return { rerender: () => result.rerender(ui()) };
    }

    /** jsdom har ingen layout: gir kortet og målene faste posisjoner. */
    function mockRects(rects: Map<() => Element, { top: number; height: number }>) {
      const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
      ) {
        for (const [get, { top, height }] of rects) {
          if (get() === this)
            return { top, height, bottom: top + height, left: 0, right: 0, width: 0 } as DOMRect;
        }
        return { top: 0, height: 0, bottom: 0, left: 0, right: 0, width: 0 } as DOMRect;
      });
      return () => spy.mockRestore();
    }
    const card = () => screen.getByTestId("composer-page-description");

    function runFrames() {
      const frames: FrameRequestCallback[] = [];
      const spy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      return {
        flush: () => {
          while (frames.length) frames.shift()?.(0);
        },
        restore: () => spy.mockRestore(),
      };
    }

    beforeEach(() => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
      Element.prototype.scrollIntoView = vi.fn();
    });

    it("scroller seksjonen med data-scroll-anchor til toppen, som eneste scroll", () => {
      const frames = runFrames();
      try {
        renderWithFields();
        const textarea = screen.getByLabelText("Beskrivelse", { selector: "textarea" });
        textarea.focus();
        frames.flush();
        const anchor = screen.getByTestId("anchor");
        expect(anchor.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
        const calls = vi.mocked(Element.prototype.scrollIntoView).mock.contexts;
        expect(calls.every((el) => el === anchor)).toBe(true);
      } finally {
        frames.restore();
      }
    });

    it("sentrerer felt uten anker som før", () => {
      const frames = runFrames();
      try {
        renderWithFields();
        const input = screen.getByLabelText("Kilometerstand");
        input.focus();
        frames.flush();
        expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(input);
        expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({
          behavior: "smooth",
          block: "center",
        });
      } finally {
        frames.restore();
      }
    });

    it("scroller ankeret på nytt når tastaturet åpnes", () => {
      const frames = runFrames();
      try {
        const { rerender } = renderWithFields();
        screen.getByLabelText("Beskrivelse", { selector: "textarea" }).focus();
        frames.flush();
        vi.mocked(Element.prototype.scrollIntoView).mockClear();

        keyboard.visible = true;
        rerender();
        frames.flush();

        const anchor = screen.getByTestId("anchor");
        expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toEqual([anchor]);
        expect(anchor.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      } finally {
        frames.restore();
      }
    });

    it("scroller ikke på web når tastaturet rapporteres åpent", () => {
      const frames = runFrames();
      try {
        keyboard.visible = true;
        renderWithFields({ native: false });
        screen.getByLabelText("Beskrivelse", { selector: "textarea" }).focus();
        frames.flush();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      } finally {
        frames.restore();
      }
    });

    it("lar ankeret stå når det allerede er øverst i kortet", () => {
      const frames = runFrames();
      const restore = mockRects(
        new Map([
          [card, { top: 0, height: 600 }],
          [() => screen.getByTestId("anchor"), { top: 0, height: 500 }],
        ]),
      );
      try {
        const { rerender } = renderWithFields();
        screen.getByLabelText("Beskrivelse", { selector: "textarea" }).focus();
        keyboard.visible = true;
        rerender();
        frames.flush();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      } finally {
        restore();
        frames.restore();
      }
    });

    it("lar et helt synlig felt stå, og sentrerer et felt utenfor synsfeltet", () => {
      const frames = runFrames();
      const mileage = () => screen.getByLabelText("Kilometerstand");
      const visible = mockRects(
        new Map([
          [card, { top: 0, height: 600 }],
          [mileage, { top: 100, height: 56 }],
        ]),
      );
      try {
        renderWithFields();
        mileage().focus();
        frames.flush();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      } finally {
        visible();
      }

      const hidden = mockRects(
        new Map([
          [card, { top: 0, height: 300 }],
          [mileage, { top: 320, height: 56 }],
        ]),
      );
      try {
        mileage().blur();
        mileage().focus();
        frames.flush();
        expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toEqual([mileage()]);
      } finally {
        hidden();
        frames.restore();
      }
    });
  });

  it("markerer ikke webskallet når tastaturet rapporteres åpent", () => {
    keyboard.visible = true;
    const { container } = renderShell({ native: false });
    expect(container.querySelector("[data-keyboard-open]")).toBeNull();
  });
});
