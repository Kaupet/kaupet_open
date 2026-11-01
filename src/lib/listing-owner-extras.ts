// kaupet_open: egne favorittall beholdes, analyse og promotering er private.
import { supabase } from "@/integrations/supabase/client";
export async function listingOwnerStats(
  listingId: string,
): Promise<{ total_views: number; favorite_count: number }> {
  const { data, error } = await supabase.rpc("my_listing_counts");
  if (error) throw error;
  return {
    total_views: 0,
    favorite_count: Number(data?.find((row) => row.listing_id === listingId)?.favorite_count ?? 0),
  };
}
export async function listingActivePromotion(
  _listingId: string,
): Promise<{ id: string; status: string; expires_at: string | null } | null> {
  return null;
}
