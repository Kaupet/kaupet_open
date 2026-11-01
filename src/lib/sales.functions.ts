// kaupet_open-stub. Bekreftet salg til en kjøper finnes ikke i kaupet_open;
// selgeren merker annonsen som solgt med updateListingStatus.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ClientError } from "@/lib/to-client-error";

export type ListingSale = {
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  conversation_id: string;
  confirmed_at: string;
};

export const getSaleForListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.guid() }).parse(input))
  .handler(async (): Promise<ListingSale | null> => null);

export const confirmBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.guid() }).parse(input))
  .handler(async (): Promise<{ ok: true }> => {
    throw new ClientError("Bekreftet salg er ikke med i denne versjonen.", 404);
  });

export const unconfirmBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ listingId: z.guid() }).parse(input))
  .handler(async (): Promise<{ ok: true }> => {
    throw new ClientError("Bekreftet salg er ikke med i denne versjonen.", 404);
  });

export async function countSalesBySeller(_client: SupabaseClient, _sellerId: string) {
  return 0;
}
