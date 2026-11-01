// kaupet_open-stub. Nøkkelordforslag fra andre annonser finnes ikke i kaupet_open.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const suggestKeywordsForListing = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ title: z.string(), category_id: z.string() }).parse(input),
  )
  .handler(async (): Promise<{ word: string; listing_count: number }[]> => []);
