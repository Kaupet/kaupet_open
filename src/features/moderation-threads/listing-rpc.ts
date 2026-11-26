// kaupet_open-stubb: annonsemoderering bruker systemvarsler, ikke samtaler.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const disableListing = (client: SupabaseClient<Database>, id: string, reason: string) =>
  client.rpc("admin_disable_listing", { _id: id, _reason: reason });

export const disableListingWithMessage = (
  client: SupabaseClient<Database>,
  id: string,
  reason: string,
  message: string,
) =>
  client.rpc("admin_disable_listing_with_message", {
    _id: id,
    _reason: reason,
    _message: message,
  });

export const enableListing = (client: SupabaseClient<Database>, id: string) =>
  client.rpc("admin_enable_listing", { _id: id });
