// kaupet_open: names live in profiles; there is no private name table.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { toClientError } from "@/lib/to-client-error";
import { publicProfileName, type ProfileName } from "./profile-name";

export async function readOwnProfileName(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .single();
  if (error) throw await toClientError("database", error);
  return {
    ...data,
    first_name: data.display_name,
    last_name: "",
    show_last_name: false,
  };
}

export async function writeOwnProfileName(userId: string, name: ProfileName) {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .update({ display_name: publicProfileName(name) })
    .eq("id", userId)
    .select("id")
    .single();
  if (error) throw await toClientError("database", error);
  return data;
}
