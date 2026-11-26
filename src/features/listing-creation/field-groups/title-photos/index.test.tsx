// @vitest-environment jsdom

import type * as PersonvernContentModule from "@/components/legal/personvern-content";
import type * as ReactRouter from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { EDITION } from "@/lib/edition";

import type { WizardSharedProps } from "../types";
import { PhotosGroup, TitleGroup } from ".";

const policy = vi.hoisted(() => ({ fail: false }));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/components/legal/personvern-content", async (importOriginal) => {
  const actual = await importOriginal<typeof PersonvernContentModule>();
  return {
    PersonvernContent: () => {
      if (policy.fail) throw new Error("Failed to fetch dynamically imported module");
      return <actual.PersonvernContent />;
    },
  };
});

vi.mock("@/hooks/use-form-factor", () => ({ useIsNarrow: () => false }));

const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => {
  cleanup();
  policy.fail = false;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const image = {
  id: "1",
  file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
  thumbFile: new File(["x"], "a.jpg", { type: "image/jpeg" }),
  previewUrl: "blob:fake",
} satisfies WizardSharedProps["images"][number];

const noopPhotoSuggestionProps = {
  setValue: vi.fn(),
  title: "",
  photoSuggestionEnabled: false,
  photoSuggestionDisabled: false,
  photoSuggestionStatus: "idle" as const,
  analyzePhotos: vi.fn(),
  photoTitleSuggestion: null,
  applyPhotoTitleSuggestion: vi.fn(),
};

describe("PhotosGroup", () => {
  it("deaktiverer en ferdig analysert bildeserie", () => {
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        photoSuggestionDisabled
        photoSuggestionStatus="ok"
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Fyll ut tittel og kategori for meg",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it.each([false, true])(
    "scroller kun når utfylt tittel er utenfor synlig område (synlig=%s)",
    async (visible) => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(
        <div data-composer-scroll>
          <input id="title" aria-label="Tittel" />
          <PhotosGroup
            images={[image]}
            setImages={vi.fn()}
            uploadProgress={null}
            noImageConfirmPending={false}
            {...noopPhotoSuggestionProps}
            photoSuggestionEnabled
            photoTitleSuggestion="Grå sofa i stoff"
          />
        </div>,
      );
      const field = screen.getByRole("textbox", { name: "Tittel" });
      vi.spyOn(field.parentElement!, "getBoundingClientRect").mockReturnValue({
        top: 100,
        bottom: 600,
      } as DOMRect);
      vi.spyOn(field, "getBoundingClientRect").mockReturnValue({
        top: visible ? 200 : 700,
        bottom: visible ? 248 : 748,
      } as DOMRect);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(scrollIntoView).toHaveBeenCalledTimes(visible ? 0 : 1);
      if (!visible)
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
      expect(document.activeElement).not.toBe(field);
    },
  );

  it("åpner personvern over skjemaet og lar brukeren fortsette etter lukking", async () => {
    const user = userEvent.setup();
    const analyzePhotos = vi.fn();
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PhotosGroup
          images={[image]}
          setImages={vi.fn()}
          uploadProgress={null}
          noImageConfirmPending={false}
          {...noopPhotoSuggestionProps}
          photoSuggestionEnabled
          analyzePhotos={analyzePhotos}
        />
      </form>,
    );
    const privacyButton = screen.getByRole("button", { name: "personvernerklæringen" });
    const url = window.location.href;
    const scrollIntoView = vi.fn(function (this: Element) {
      expect(this.id).toBe("bildeforslag");
    });
    Element.prototype.scrollIntoView = scrollIntoView;
    await user.click(privacyButton);
    expect(screen.getByRole("dialog", { name: "Personvernerklæring" })).toBeTruthy();
    if (EDITION === "open") {
      // Open supplies no legal text; the overlay must still open and close normally.
      await waitFor(() => expect(screen.queryByText("Laster personvernerklæringen …")).toBeNull());
      expect(screen.queryByRole("heading", { name: "Forslag fra bildene dine (KI)" })).toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } else {
      expect(
        await screen.findByRole("heading", { name: "Forslag fra bildene dine (KI)" }),
      ).toBeTruthy();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    }
    expect(window.location.href).toBe(url);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(analyzePhotos).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(privacyButton);
    await user.click(screen.getByRole("button", { name: "Fyll ut tittel og kategori for meg" }));
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
  });

  it("beholder skjemaet når personvernteksten ikke kan lastes", async () => {
    const user = userEvent.setup();
    policy.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        analyzePhotos={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "personvernerklæringen" }));
    const link = await screen.findByRole("link", { name: "Les den i en ny fane" });
    expect(link.getAttribute("href")).toBe("/personvern#bildeforslag");
    expect(
      screen.getByRole("button", { name: "Fyll ut tittel og kategori for meg", hidden: true }),
    ).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("viser ikke bekreftelsesmeldingen før Neste er trykket uten bilder", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
      />,
    );
    expect(screen.queryByText(/Annonser med bilder får flere henvendelser/)).toBeNull();
  });

  it("viser en inline melding (role=status) etter første Neste uten bilder", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending
        {...noopPhotoSuggestionProps}
      />,
    );
    const message = screen.getByText(/Annonser med bilder får flere henvendelser/);
    expect(message.getAttribute("role")).toBe("status");
  });

  it("skjuler meldingen igjen når et bilde er lagt til", () => {
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending
        {...noopPhotoSuggestionProps}
      />,
    );
    expect(screen.queryByText(/Annonser med bilder får flere henvendelser/)).toBeNull();
  });

  it("skjuler «Foreslå kategori og detaljer»-knappen når funksjonen er av", () => {
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled={false}
      />,
    );
    expect(screen.queryByTestId("photo-suggestion-button")).toBeNull();
  });

  it("deaktiverer knappen når det ikke er noen bilder ennå, selv om funksjonen er på", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
      />,
    );
    expect((screen.getByTestId("photo-suggestion-button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/Legg til minst ett bilde først/)).toBeTruthy();
  });

  it("ber om Cloudflare-verifisering uten å kalle det en bildefeil", () => {
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        photoSuggestionStatus="verification-required"
      />,
    );
    expect(screen.getByText(/Bekreft Cloudflare-sjekken/).getAttribute("role")).toBe("status");
    expect(screen.queryByText(/Vi fikk dessverre ikke til å analysere bildene/)).toBeNull();
  });

  it("fyller en tom tittel direkte med forslaget fra bildene", () => {
    const setValue = vi.fn();
    const applyPhotoTitleSuggestion = vi.fn();
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        setValue={setValue}
        applyPhotoTitleSuggestion={applyPhotoTitleSuggestion}
        photoTitleSuggestion="Grå sofa i stoff"
      />,
    );
    expect(setValue).toHaveBeenCalledWith("title", "Grå sofa i stoff", { shouldValidate: true });
    expect(applyPhotoTitleSuggestion).toHaveBeenCalledWith("Grå sofa i stoff");
  });
});

describe("TitleGroup", () => {
  const titleProps = {
    register: (() => ({ name: "title" })) as unknown as WizardSharedProps["register"],
    errors: {},
    touchedFields: {},
    title: "",
    titleExample: null,
  };

  it("skjuler feltet bak «Jeg vil fylle ut tittel selv» og viser det ved trykk", () => {
    render(<TitleGroup {...titleProps} titleCollapsible />);
    expect(screen.queryByTestId("listing-title-input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jeg vil fylle ut tittel selv" }));
    expect(document.activeElement).toBe(screen.getByTestId("listing-title-input"));
  });

  it("viser feltet direkte når det har innhold", () => {
    render(<TitleGroup {...titleProps} title="Sofa" titleCollapsible />);
    expect(screen.getByTestId("listing-title-input")).toBeTruthy();
  });

  it("starter analysen ved trykk og lenker til personvernerklæringen", () => {
    const analyzePhotos = vi.fn();
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        analyzePhotos={analyzePhotos}
      />,
    );
    expect(screen.getByText("personvernerklæringen")).toBeTruthy();
    fireEvent.click(screen.getByTestId("photo-suggestion-button"));
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
  });
});
