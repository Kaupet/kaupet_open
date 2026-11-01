// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SITE_SHORT_NAME } from "@/lib/site";
import { EDITION } from "@/lib/edition";
import { PublishedListingDialog } from "./published-listing-dialog";

const availability = vi.hoisted(() => ({ LISTING_CODE_AVAILABLE: true }));
vi.mock("@/components/listing-code-availability", () => availability);

vi.mock("@/lib/qr", () => ({
  QR_SIZE: 320,
  generateBrandedQrDataUrl: vi.fn(() => Promise.resolve("data:image/png;base64,qr")),
}));
vi.mock("@/hooks/use-listing-preview", () => ({
  useListingPreview: () => ({
    listing: {
      title: "Brun skinnsofa",
      price_nok: 5000,
      is_free: false,
      city: "Oslo",
      cover_path: null,
      kaupet_code: "48210937",
    },
    imgUrl: null,
  }),
}));

function renderDialog(handlers: { onPromote?: () => void; onClose?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <PublishedListingDialog
        listingId="listing-1"
        open
        onOpenChange={vi.fn()}
        onView={vi.fn()}
        onPromote={handlers.onPromote ?? vi.fn()}
        onClose={handlers.onClose ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  availability.LISTING_CODE_AVAILABLE = true;
});

describe("PublishedListingDialog", () => {
  it("viser Lappen med formatert annonsekode og uten konfetti", async () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Annonsen er nå publisert" })).toBeTruthy();
    expect(screen.getByText("4821 0937")).toBeTruthy();
    expect(document.querySelector("canvas")).toBeNull();
    await waitFor(() => expect(screen.getByAltText("QR-kode til annonsen")).toBeTruthy());
  });

  it("viser QR uten annonsekode når koden ikke er tilgjengelig", async () => {
    availability.LISTING_CODE_AVAILABLE = false;
    renderDialog();

    await waitFor(() => expect(screen.getByAltText("QR-kode til annonsen")).toBeTruthy());
    expect(screen.queryByText("4821 0937")).toBeNull();
    expect(screen.queryByRole("button", { name: `Kopier ${SITE_SHORT_NAME}-kode` })).toBeNull();
    expect(screen.getByRole("button", { name: /Del annonsen/ })).toBeTruthy();
  });

  it("har «Del annonsen» som primærhandling", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: /Del annonsen/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Se annonsen/ })).toBeTruthy();
  });

  it("kopierer koden ved klikk og viser kortvarig status", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog();
    screen.getByRole("button", { name: `Kopier ${SITE_SHORT_NAME}-kode` }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("48210937"));
    await waitFor(() => expect(screen.getByText("Kopiert")).toBeTruthy());
  });

  it.skipIf(EDITION === "open")("«Kjøp promotering» åpner kjøpet", () => {
    const onPromote = vi.fn();
    renderDialog({ onPromote });

    screen.getByRole("button", { name: /Kjøp promotering/ }).click();
    expect(onPromote).toHaveBeenCalledOnce();
  });

  it("lukking uten valg kaller onClose, som tar brukeren til annonsen", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
