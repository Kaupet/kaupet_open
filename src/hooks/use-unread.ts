import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useForegroundRefresh } from "@/hooks/use-foreground-refresh";
import { isUnread } from "@/lib/unread";
import { lastConversationMessages } from "@/lib/conversation-messages";

export type ConvSummary = {
  id: string;
  last_message_at: string;
  last_sender_id: string | null;
  my_last_read_at: string | null;
};

/**
 * Henter en lett oppsummering av brukerens samtaler og beregner antall uleste.
 * Lytter også til realtime-innsettinger i `messages` for å holde tellingen frisk.
 */
export function useUnreadConversationsCount(): number {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["unread-conversations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConvSummary[]> => {
      const { data: convs, error } = await supabase
        .from("conversations")
        .select(
          "id, last_message_at, buyer_id, seller_id, buyer_last_read_at, seller_last_read_at, buyer_deleted_at, seller_deleted_at",
        )
        .or(
          `and(buyer_id.eq.${user!.id},buyer_deleted_at.is.null),and(seller_id.eq.${user!.id},seller_deleted_at.is.null)`,
        );
      if (error) throw error;
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const messages = await lastConversationMessages(ids);
      return (convs ?? []).map((c) => ({
        id: c.id,
        last_message_at: c.last_message_at,
        last_sender_id: messages.get(c.id)?.sender_id ?? null,
        my_last_read_at: c.buyer_id === user!.id ? c.buyer_last_read_at : c.seller_last_read_at,
      }));
    },
  });

  // Realtime: refetch når nye meldinger kommer inn for denne brukeren
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  // Fallback: refresh når fanen får fokus igjen (i tilfelle realtime ikke leverer)
  useForegroundRefresh(() => qc.invalidateQueries({ queryKey: ["unread-conversations"] }), !!user);

  return (data ?? []).filter((c) =>
    isUnread(c.last_message_at, c.last_sender_id, user?.id, c.my_last_read_at),
  ).length;
}

/**
 * Antall uleste systemmeldinger (fra teamet). Egen telling, adskilt fra
 * samtale-uleste — en fane-badge skal love at fanen inneholder noe uåpnet av
 * den typen fanen heter, og systemmeldinger er ikke samtaler. Vises i stedet
 * på Meg-fanen sammen med varsler, se useUnreadNotificationsCount.
 */
export function useUnreadSystemMessagesCount(): number {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["system-messages-unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("system_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  useForegroundRefresh(
    () => qc.invalidateQueries({ queryKey: ["system-messages-unread"] }),
    !!user,
  );

  return data ?? 0;
}

export { useUnreadNotificationsCount } from "@/hooks/use-notification-unread";
