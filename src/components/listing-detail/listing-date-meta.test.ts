import { describe, expect, it } from "vitest";

import { getListingDateMeta } from "./listing-date-meta";

describe("getListingDateMeta", () => {
  it("grenseverdi: viser redigering over norsk midnatt selv på samme UTC-dag", () => {
    expect(
      getListingDateMeta(
        "active",
        "2026-09-30T21:30:00Z",
        "2026-09-30T21:30:00Z",
        "2026-09-30T22:30:00Z",
      ),
    ).toEqual({ label: "Sist redigert", dateStr: "1. oktober 2026" });
  });

  it("viser publiseringsdato når redigeringen skjer samme norske dag", () => {
    expect(
      getListingDateMeta(
        "active",
        "2026-09-30T22:30:00Z",
        "2026-09-30T22:30:00Z",
        "2026-10-01T00:30:00Z",
      ),
    ).toEqual({ label: "Publisert", dateStr: "1. oktober 2026" });
  });

  it("viser norsk opprettelsesdato for utkast", () => {
    expect(getListingDateMeta("draft", null, "2026-09-30T22:30:00Z", null)).toEqual({
      label: "Opprettet",
      dateStr: "1. oktober 2026",
    });
  });
});
