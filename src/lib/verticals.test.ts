// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

import { useVerticalBrands, verticals } from "@/lib/verticals";

// Uten registrert vertikal (kaupet_open): ingen import av src/lib/vehicle/register.
it("har ingen verdilister og henter ingenting uten registrert vertikal", () => {
  expect(verticals.brandModel).toBeUndefined();
  // Ingen QueryClientProvider: et nettverkskall via useQuery ville kastet her.
  const { result } = renderHook(() => useVerticalBrands());
  expect(result.current).toBeUndefined();
});
