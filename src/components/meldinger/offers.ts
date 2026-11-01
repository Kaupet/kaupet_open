// kaupet_open-stub. Bud finnes ikke i kaupet_open; samtalen kjenner bare
// typen, og ingen meldinger har bud.
import type { PostgrestError, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";

export type Offer = {
  id: string;
  conversation_id: string;
  listing_id: string;
  from_user_id: string;
  amount_nok: number;
  fee_included: boolean | null;
  comment: string | null;
  status: "pending" | "accepted" | "declined" | "countered" | "withdrawn" | "closed" | "revoked";
  responds_to: string | null;
  expires_at: string;
  created_at: string;
  responded_at: string | null;
};

export function applyOffer(prev: Offer[] | undefined, _row: Offer): Offer[] | undefined {
  return prev;
}

export function subscribeOfferChanges(
  _channel: RealtimeChannel,
  _conversationId: string,
  _queryClient: QueryClient,
  _isActive: () => boolean,
) {}

export const MESSAGE_OFFER_COLUMN = "";

export function messageOfferId(_message: object): string | null {
  return null;
}

export async function fetchOfferComment(
  _client: SupabaseClient,
  _message: { offer_id: string; conversation_id: string; sender_id: string },
): Promise<{ data: { comment: string | null } | null; error: PostgrestError | null }> {
  return { data: null, error: null };
}
