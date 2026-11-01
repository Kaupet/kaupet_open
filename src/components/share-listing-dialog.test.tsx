// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE_SHORT_NAME, SITE_URL } from "@/lib/site";
import { ShareListingDialog } from "./share-listing-dialog";

const availability = vi.hoisted(() => ({ LISTING_CODE_AVAILABLE: true }));
vi.mock("@/components/listing-code-availability", () => availability);

const generate = vi.fn<(url: string) => Promise<string>>();
vi.mock("@/lib/qr", () => ({
  QR_SIZE: 256,
  generateBrandedQrDataUrl: (url: string) => generate(url),
}));
vi.mock("@/lib/native", () => ({ isNative: () => false, shareContent: vi.fn() }));

window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

afterEach(() => {
  cleanup();
  generate.mockReset();
  availability.LISTING_CODE_AVAILABLE = true;
});

const props = { onOpenChange: () => {}, kaupetCode: "ABC123", title: "Sykkel" };

describe("ShareListingDialog: QR", () => {
  it("viser QR etter generering, og genererer på nytt med spinner ved gjenåpning", async () => {
    generate.mockResolvedValueOnce("data:first");
    const { rerender } = render(<ShareListingDialog open {...props} />);
    expect(generate).toHaveBeenCalledWith(`${SITE_URL}/ABC123`);
    expect((await screen.findByAltText("QR-kode til annonsen")).getAttribute("src")).toBe(
      "data:first",
    );

    rerender(<ShareListingDialog open={false} {...props} />);
    let resolve!: (v: string) => void;
    generate.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    rerender(<ShareListingDialog open {...props} />);
    expect(screen.queryByAltText("QR-kode til annonsen")).toBeNull();
    resolve("data:second");
    expect((await screen.findByAltText("QR-kode til annonsen")).getAttribute("src")).toBe(
      "data:second",
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("viser feilmelding når generering feiler", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValueOnce(new Error("boom"));
    render(<ShareListingDialog open {...props} />);
    expect(await screen.findByText("Kunne ikke generere QR-kode")).toBeTruthy();
  });
});

describe("ShareListingDialog: annonsekode", () => {
  it("viser koden med kopiknapp når annonsekoden er tilgjengelig", () => {
    generate.mockResolvedValue("data:qr");
    render(<ShareListingDialog open {...props} />);
    expect(screen.getByText("ABC123")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Kopier ${SITE_SHORT_NAME}-kode` })).toBeTruthy();
  });

  it("deler bare lenke og QR når annonsekoden ikke er tilgjengelig", () => {
    availability.LISTING_CODE_AVAILABLE = false;
    generate.mockResolvedValue("data:qr");
    render(<ShareListingDialog open {...props} />);
    expect(screen.getByText("Del annonsen med lenke eller QR-kode.")).toBeTruthy();
    expect(screen.queryByText("ABC123")).toBeNull();
    expect(screen.queryByRole("button", { name: `Kopier ${SITE_SHORT_NAME}-kode` })).toBeNull();
    expect(screen.getByRole("button", { name: "Kopier lenke" })).toBeTruthy();
  });
});
