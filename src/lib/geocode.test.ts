import { afterEach, expect, it, vi } from "vitest";
import * as geocode from "./geocode";
import * as serverGeocode from "./geocode.server";

afterEach(() => vi.unstubAllGlobals());

it.each([geocode, serverGeocode])(
  "har ingen nettverksavhengighet for stedsoppslag",
  async (lookup) => {
    const fetch = vi.fn(() => {
      throw new Error("Eksternt nettverk er av");
    });
    vi.stubGlobal("fetch", fetch);
    expect(await lookup.searchPlaces("Oslo", 6)).toEqual([]);
    expect(await lookup.lookupPostalCode("0152")).toBeNull();
    expect(await lookup.geocodeNorwayAddress({ postal_code: "0152", city: "Oslo" })).toBeNull();
    expect(
      await lookup.geocodeStreetAddress({ address_line: "Prinsens gate 1", postal_code: "0152" }),
    ).toBeNull();
    expect(await lookup.reverseGeocodeAddress({ lat: 59.91, lng: 10.75 })).toEqual({
      city: null,
      postal_code: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  },
);
