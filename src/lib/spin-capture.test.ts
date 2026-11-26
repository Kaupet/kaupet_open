import { describe, expect, it } from "vitest";

import { canAddSpin360Capture, spin360OwnerVariant } from "./spin-capture";

describe("canAddSpin360Capture", () => {
  it.each(["draft", "active"])("tillater opptak for %s", (status) => {
    expect(canAddSpin360Capture(status)).toBe(true);
  });

  it.each(["sold", "expired", "disabled", "deleted", null, undefined])(
    "tillater ikke opptak for %s",
    (status) => {
      expect(canAddSpin360Capture(status)).toBe(false);
    },
  );
});

describe("spin360OwnerVariant", () => {
  const base = {
    spin360: true,
    status: "active",
    listingId: "l1",
    isNative: false,
    isDesktop: true,
  };

  it("gir kamera-opptak på native og QR på web", () => {
    expect(spin360OwnerVariant({ ...base, isNative: true })).toBe("native-capture");
    expect(spin360OwnerVariant(base)).toBe("qr");
  });

  it("viser ikke QR-koden i smal nettleser, men native er uavhengig av bredde", () => {
    expect(spin360OwnerVariant({ ...base, isDesktop: false })).toBeNull();
    expect(spin360OwnerVariant({ ...base, isDesktop: false, isNative: true })).toBe(
      "native-capture",
    );
  });

  it("viser ingenting for kategorier uten spin360", () => {
    expect(spin360OwnerVariant({ ...base, spin360: false })).toBeNull();
  });

  it("viser ingenting for solgte, utløpte eller deaktiverte annonser", () => {
    for (const status of ["sold", "expired", "disabled"]) {
      expect(spin360OwnerVariant({ ...base, status })).toBeNull();
      expect(spin360OwnerVariant({ ...base, status, isNative: true })).toBeNull();
    }
  });

  it("viser ingenting før annonsen har en id", () => {
    expect(spin360OwnerVariant({ ...base, listingId: undefined })).toBeNull();
  });
});
