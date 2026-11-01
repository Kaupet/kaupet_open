import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  updatedRows: [{ id: "listing-1" }] as unknown[],
  update: vi.fn(),
}));
const updateListingAttributes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/listings.functions", () => ({ updateListingAttributes }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.single = async () => ({ data: { attributes: db.current }, error: null });
      query.update = (value: unknown) => {
        db.update(value);
        return {
          eq: () => ({ select: async () => ({ data: db.updatedRows, error: null }) }),
        };
      };
      return query;
    },
  },
}));

import { saveListingField } from "./save-listing-field";

const behavior = { requiresDeliveryMethod: true } as never;

beforeEach(() => {
  db.current = { color: "red", seats: 5, lookup_snapshot: "{}" };
  db.updatedRows = [{ id: "listing-1" }];
  db.update.mockReset();
  updateListingAttributes.mockReset();
});

// Attributter skrives via serveren, som validerer tall- og datoformat.
it("sender attributter og tømte nøkler til serverfunksjonen", async () => {
  await saveListingField(
    "listing-1",
    { group: "attributes", attributes: { seats: 7 }, removedKeys: ["color"] },
    { behavior },
  );
  expect(updateListingAttributes).toHaveBeenCalledWith({
    data: { id: "listing-1", attributes: { seats: 7 }, removedKeys: ["color"] },
  });
  expect(db.update).not.toHaveBeenCalled();
});

it("sender tilstand og leveringsvalg til den autoriserte serverfunksjonen", async () => {
  await saveListingField("listing-1", { group: "condition", condition: "good" }, { behavior });
  await saveListingField("listing-1", { group: "delivery", can_ship: true }, { behavior });
  expect(updateListingAttributes).toHaveBeenNthCalledWith(1, {
    data: { id: "listing-1", attributes: {}, condition: "good" },
  });
  expect(updateListingAttributes).toHaveBeenNthCalledWith(2, {
    data: { id: "listing-1", attributes: {}, can_ship: true },
  });
  expect(db.update).not.toHaveBeenCalled();
});

it("feiler når oppdateringen ikke traff annonsen", async () => {
  db.updatedRows = [];
  await expect(
    saveListingField("listing-1", { group: "title", title: "Ny tittel" }, { behavior }),
  ).rejects.toThrow("Endringen ble ikke lagret");
});
