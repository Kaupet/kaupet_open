// kaupet_open-stub. Anmeldelser finnes ikke i kaupet_open.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function reviewSummary(_client: SupabaseClient, _userId: string) {
  return { avg_rating: 0, review_count: 0 };
}

export async function listingHasReviews(
  _client: SupabaseClient,
  _listingId: string,
): Promise<boolean> {
  return false;
}
