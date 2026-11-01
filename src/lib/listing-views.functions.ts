// kaupet_open-stub. Visningsstatistikk finnes ikke i kaupet_open.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const logListingView = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ listingId: z.string() }).passthrough().parse(input))
  .handler(async () => {});
