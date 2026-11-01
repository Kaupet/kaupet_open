// kaupet_open-stub. «Ønskes kjøpt» finnes ikke i kaupet_open. Inngangene er skjult
// via WTB_AVAILABLE; disse svarer tomt for kallsteder som fortsatt finnes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const deleteWtbListing = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async () => {});

export const getMyWtbListings = createServerFn({ method: "GET" }).handler(
  async () =>
    [] as {
      id: string;
      title: string;
      status: string;
      description: string | null;
      categories: { name_nb: string; slug: string } | null;
      max_price_nok: number | null;
      created_at: string;
    }[],
);

export const matchWtbListingsForListing = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ title: z.string() }).passthrough().parse(input))
  .handler(async () => ({ count: 0, maxPrice: null as number | null }));
