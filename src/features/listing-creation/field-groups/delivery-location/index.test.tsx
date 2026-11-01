// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { DeliveryLocation } from "./index";
import type { ListingFormShape, WizardSharedProps } from "../types";

vi.mock("@/lib/location-availability", () => ({ MAPS_AVAILABLE: false }));
vi.mock("@/features/business-account/use-business-membership", () => ({
  useBusinessMembership: () => ({ data: null }),
}));
afterEach(cleanup);

it("lar brukeren fylle ut postnummer og sted uten kart eller oppslag", () => {
  function ManualLocation() {
    const {
      register,
      formState: { errors },
    } = useForm<ListingFormShape>();
    return (
      <DeliveryLocation {...({ register, errors } as WizardSharedProps)} showDelivery={false} />
    );
  }
  render(<ManualLocation />);
  fireEvent.change(screen.getByLabelText("Sted", { selector: "input" }), {
    target: { value: "Bergen" },
  });
  fireEvent.change(screen.getByLabelText("Postnummer"), { target: { value: "0152" } });
  expect((screen.getByLabelText("Sted", { selector: "input" }) as HTMLInputElement).value).toBe(
    "Bergen",
  );
  expect((screen.getByLabelText("Postnummer") as HTMLInputElement).value).toBe("0152");
  expect(screen.queryByRole("button", { name: "Bruk min posisjon" })).toBeNull();
});
