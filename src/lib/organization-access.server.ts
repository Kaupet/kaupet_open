// kaupet_open: ingen bedriftsaktør får særtilgang til samtaler.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Samtalene leses uten annonsens bedriftsfelt. */
export const CONVERSATION_ORGANIZATION_RELATION = "";
export type ConversationOrganizationFields = Record<never, never>;

export async function organizationConversationAccess(
  _client: SupabaseClient<Database>,
  _userId: string,
  _conversation: ConversationOrganizationFields,
): Promise<boolean> {
  return false;
}

export function organizationConversationAccessKey(
  _conversation: ConversationOrganizationFields,
): string | null {
  return null;
}
