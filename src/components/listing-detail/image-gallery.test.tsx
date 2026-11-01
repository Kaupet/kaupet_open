// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-auto-hide", () => ({
  useAutoHide: () => [false, vi.fn()],
  autoHideClass: () => "",
}));
vi.mock("@/components/scroll-arrow-row", () => ({
  ScrollArrowRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CarouselPrevious: () => null,
  CarouselNext: () => null,
}));
vi.mock("@/features/listing-edit/edit-mode-context", () => ({ useListingEdit: () => null }));
vi.mock("@/features/listing-edit/use-inline-listing-images", () => ({
  useInlineListingImages: () => ({}),
}));
vi.mock("@/lib/verticals", () => ({ verticals: { Spin360Viewer: () => null } }));
vi.mock("@/components/ai-image-info", () => ({ AiImageBadge: () => null }));

import { ImageGallery } from "./image-gallery";

afterEach(cleanup);

describe("bildegalleri", () => {
  it("viser tomtilstand når annonsen ikke har bilder", () => {
    render(
      <ImageGallery images={[]} imgUrls={{}} activeImage={0} onSelect={vi.fn()} title="Sykkel" />,
    );
    expect(screen.getByText("Ingen bilder")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Vis bilde/ })).toBeNull();
  });

  it("viser beskrivelse og bildetekst, og åpner valgt bilde i fullskjerm", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onImageClick = vi.fn();
    render(
      <ImageGallery
        images={[
          { storage_path: "front.jpg", sort_order: 0, caption: "Forfra", ai_generated: true },
          { storage_path: "side.jpg", sort_order: 1 },
        ]}
        imgUrls={{ "front.jpg": "https://example.test/front.jpg" }}
        activeImage={0}
        onSelect={onSelect}
        onImageClick={onImageClick}
        title="Sykkel"
      />,
    );

    expect(screen.getByRole("img", { name: "Sykkel" }).getAttribute("src")).toBe(
      "https://example.test/front.jpg",
    );
    expect(screen.getByText("Forfra")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Vis bilde 1 av 2 for «Sykkel»" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Vis bilde 2 av 2 for «Sykkel»" }));
    expect(onSelect).toHaveBeenCalledWith(1);
    await user.click(screen.getAllByRole("button", { name: "Se bilde i fullskjerm" })[0]);
    expect(onImageClick).toHaveBeenCalledWith(0);
  });

  it("holder 360-visningen først og forskyver vanlige bildeindekser", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ImageGallery
        images={[{ storage_path: "front.jpg", sort_order: 0 }]}
        imgUrls={{}}
        activeImage={1}
        onSelect={onSelect}
        title="Sykkel"
        spin360={{ frames: [{ storage_path: "spin.jpg", frame_order: 0 }], imgUrls: {} }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Vis 360°-visning" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByRole("img", { name: "Sykkel – bilde 1" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Vis 360°-visning" }));
    expect(onSelect).toHaveBeenCalledWith(0);
    await user.click(screen.getByRole("button", { name: "Vis bilde 1 av 1 for «Sykkel»" }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });
});
