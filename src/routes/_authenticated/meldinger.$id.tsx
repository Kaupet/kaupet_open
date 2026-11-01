import { WTB_CONVERSATION_COLUMN, WTB_CONVERSATION_RELATION } from "@/features/wtb/availability";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import type { ConvSummary } from "@/hooks/use-unread";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent } from "react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useForegroundRefresh } from "@/hooks/use-foreground-refresh";
import {
  signListingImageUrls,
  signMessageAttachmentUrls,
  uploadMessageAttachment,
  validateImages,
  describeImageError,
} from "@/lib/storage";
import { sendMessage } from "@/lib/messages.functions";
import { compressImage } from "@/lib/image-compression";
import { Button } from "@/components/ui/button";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listMyBlocks, listBlocksAgainstMe } from "@/lib/blocks.functions";
import { confirmBuyer, getSaleForListing, unconfirmBuyer } from "@/lib/sales.functions";
import { createReview, getMyReviewForListing } from "@/lib/reviews.functions";
import { formatErrorMessage } from "@/lib/errors";
import {
  conversationMessagesPage,
  mapMessagePages,
  upsertConversationMessage,
  type ConversationMessagesData,
  type MessageCursor,
} from "@/lib/conversation-messages";
import { displayPriceNok, formatNokNumber, formatWtbMaxPrice } from "@/lib/format";
import { useIsNative } from "@/hooks/use-is-native";
import { useFormFactor } from "@/hooks/use-form-factor";
import { InboxPage, type WtbListingRef } from "@/components/inbox-page";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";
import { ConversationErrorBoundary } from "@/components/meldinger/conversation-error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { renderWithDayDividers, type Message } from "@/components/meldinger/message-list";
import { MessageActions } from "@/components/meldinger/message-actions";
import { applyReaction, groupReactions, type Reaction } from "@/components/meldinger/reactions";
import { applyRealtimeQueryUpdate } from "@/lib/realtime-query";
import { isReservedNow } from "@/lib/reservation";
import { ConversationHeader } from "@/components/meldinger/conversation-header";
import { ConversationComposer } from "@/components/meldinger/conversation-composer";
import { TradePanel, type TradePanelProps } from "@/components/meldinger/trade-panel";
import { tradeStep } from "@/components/meldinger/trade-step";
import {
  CONVERSATION_RESERVATION_COLUMN,
  conversationHoldsReservation,
  LISTING_RESERVATION_COLUMN,
  listingReservedUntil,
  TRADE_AVAILABLE,
} from "@/components/meldinger/trade-availability";
import { useConversationOffers } from "@/components/meldinger/use-conversation-offers";
import { messageOfferId, subscribeOfferChanges } from "@/components/meldinger/offers";
import { ReviewForm } from "@/components/meldinger/review-form";
import { cn } from "@/lib/utils";
import { useBusinessMembership } from "@/features/business-account/use-business-membership";
import { conversationOrganizations } from "@/lib/conversation-organizations";
import { LISTING_ORGANIZATION_COLUMN, listingOrganizationId } from "@/lib/listing-business-data";
import { TradeSafetyAdvice } from "@/components/trade-safety-advice";
import { SITE_NAME } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/meldinger/$id")({
  // Ikke gjennomgått for SSR ennå. Forelderen (_authenticated) har SSR på
  // for /mine-annonser; denne ruten beholder klientrendring inntil den er
  // verifisert server-side.
  ssr: false,
  head: () => ({
    meta: [{ title: `Samtale — ${SITE_NAME}` }],
  }),
  validateSearch: z.object({ source: z.literal("business").optional() }),
  component: ConversationPage,
  errorComponent: ConversationErrorBoundary,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Samtalen finnes ikke</h1>
      <Link to="/meldinger">
        <Button className="mt-6" variant="outline">
          Tilbake til meldinger
        </Button>
      </Link>
    </div>
  ),
});

// Poll-fallback når realtime-kanalen for denne samtalen ikke er SUBSCRIBED
// (CHANNEL_ERROR/TIMED_OUT/CLOSED — f.eks. når Supabase realtime svarer 500,
// som i staging per F16). 5s føles "levende" nok for en aktiv samtale, og
// kostnaden er begrenset: det er kun den ene åpne samtalen som poller, og
// kun mens kanalen faktisk er nede.
export const MESSAGES_POLL_INTERVAL_MS = 5_000;

/** Skjuler bunnmenyen mens samtalen er åpen, se `.conversation-open` i
 * styles.css. Samme mønster som NativeContactBar på annonsesiden. */
function ConversationOpen() {
  useEffect(() => {
    document.documentElement.classList.add("conversation-open");
    return () => document.documentElement.classList.remove("conversation-open");
  }, []);
  return null;
}

function ConversationPage() {
  const { data: businessMembership } = useBusinessMembership();
  const isBusinessSuperuser =
    businessMembership?.role === "superuser" ||
    businessMembership?.locations.some((location) => location.permissions.chatAccess === "all");
  const native = useIsNative();
  const formFactor = useFormFactor();
  const isTablet = formFactor === "tablet";
  const isDesktop = formFactor === "desktop";
  const keyboardVisible = useKeyboardVisible();
  const { id } = Route.useParams();
  const { source } = Route.useSearch();
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const listMyBlocksFn = useServerFn(listMyBlocks);
  const listBlocksAgainstMeFn = useServerFn(listBlocksAgainstMe);
  const getSaleFn = useServerFn(getSaleForListing);
  const confirmBuyerFn = useServerFn(confirmBuyer);
  const unconfirmBuyerFn = useServerFn(unconfirmBuyer);
  const getMyReviewFn = useServerFn(getMyReviewForListing);
  const createReviewFn = useServerFn(createReview);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingLatestRef = useRef(true);
  const scrolledConversationRef = useRef<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const sendAttemptRef = useRef<{ clientId: string; attachmentPath: string | null } | null>(null);
  // Uferdig tekst, vedlegg og sendeforsøk hører til samtalen de ble laget i;
  // ruten gjenbrukes ved bytte, så de nullstilles når id endres.
  const [composerConversationId, setComposerConversationId] = useState(id);
  const [panelOpen, setPanelOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  if (composerConversationId !== id) {
    setComposerConversationId(id);
    setPanelOpen(false);
    setActionsFor(null);
    setBody("");
    setAttachment(null);
    setAttachmentPreview(null);
  }
  useEffect(() => {
    sendAttemptRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [id]);
  // Forhåndsvisningen frigis når den byttes ut, fjernes (også ved
  // samtalebytte over) eller siden forlates.
  useEffect(
    () => () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    },
    [attachmentPreview],
  );
  // true når realtime-kanalen for samtalen ikke er SUBSCRIBED — se
  // MESSAGES_POLL_INTERVAL_MS.
  const [realtimeDown, setRealtimeDown] = useState(false);

  const { data: myBlocks } = useQuery({
    queryKey: ["my-blocks"],
    enabled: !!user,
    queryFn: () => listMyBlocksFn(),
  });
  const { data: blocksAgainstMe } = useQuery({
    queryKey: ["blocks-against-me"],
    enabled: !!user,
    queryFn: () => listBlocksAgainstMeFn(),
  });
  const {
    data: conv,
    isLoading: convLoading,
    isError: convIsError,
    error: convError,
  } = useQuery({
    queryKey: ["conversation", id, isBusinessSuperuser],
    enabled: !!user,
    // Leserkvitteringer (buyer/seller_last_read_at) kommer via samme
    // realtime-kanal som meldingene (UPDATE på conversations) — samme
    // polling-fallback dekker derfor begge.
    // Andre samtalers oppheving gir ingen hendelse her. Poll bare mens
    // deres reservasjon hindrer denne kjøperen i å gi bud.
    refetchInterval: (query) =>
      realtimeDown ||
      (!conversationHoldsReservation(query.state.data) &&
        isReservedNow(listingReservedUntil(query.state.data?.listing)))
        ? MESSAGES_POLL_INTERVAL_MS
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, buyer_id, seller_id, listing_id${WTB_CONVERSATION_COLUMN}, buyer_last_read_at, seller_last_read_at${CONVERSATION_RESERVATION_COLUMN},
           listing:listings(id${LISTING_ORGANIZATION_COLUMN}, kaupet_code, title, price_nok, is_free, status, category_id${LISTING_RESERVATION_COLUMN}, attributes, listing_images(storage_path, sort_order), categories(slug))${WTB_CONVERSATION_RELATION}`,
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Samtalen finnes ikke");
      const rawListing = data.listing;
      const listing = Array.isArray(rawListing) ? rawListing[0] : rawListing;
      // Samtaler om kjøpsønsker har et kjøpsønske i stedet for listing_id.
      const rawWtb = (data as unknown as { wtb_listing: WtbListingRef | WtbListingRef[] | null })
        .wtb_listing;
      const wtbListing = (Array.isArray(rawWtb) ? rawWtb[0] : rawWtb) ?? null;
      const orgId = listingOrganizationId(listing);
      const isBusinessSeller = isBusinessSuperuser && businessMembership?.organization.id === orgId;
      const viewerIsSeller = user!.id === data.seller_id || isBusinessSeller;
      const otherId = viewerIsSeller ? data.buyer_id : data.seller_id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, deleted_at")
        .eq("id", otherId)
        .maybeSingle();
      const { data: pendingFlag } = await supabase.rpc("is_user_deletion_pending", {
        _user_id: otherId,
      });
      const otherDeleted = !!profile?.deleted_at;
      const otherPending = !!pendingFlag;
      const organizations = !viewerIsSeller
        ? await conversationOrganizations([orgId])
        : new Map<string, { name: string; avatarUrl: string | null }>();
      const organization = orgId ? organizations.get(orgId) : null;
      const otherOrganization =
        organization && orgId
          ? { id: orgId, name: organization.name, logoUrl: organization.avatarUrl }
          : null;
      return {
        ...data,
        listing,
        wtbListing,
        isBusinessSeller,
        other: profile,
        otherOrganization,
        otherDeleted,
        otherPending,
      };
    },
  });

  const {
    data: messageData,
    isLoading: messagesLoading,
    isError: messagesError,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchMessages,
  } = useInfiniteQuery({
    queryKey: ["messages", id],
    enabled: !!user,
    refetchInterval: realtimeDown ? MESSAGES_POLL_INTERVAL_MS : false,
    initialPageParam: null as MessageCursor | null,
    queryFn: ({ pageParam }) => conversationMessagesPage(id, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const messages = useMemo(() => {
    const byId = new Map(messageData?.pages.flatMap((page) => page.messages).map((m) => [m.id, m]));
    return [...byId.values()].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  }, [messageData]);
  const latestMessage = messages.at(-1);

  // ponytail: henter alle reaksjoner i samtalen, ikke per side; pagineres
  // sammen med meldingene hvis lange tråder får mange reaksjoner.
  const { data: reactionRows } = useQuery({
    queryKey: ["message-reactions", id],
    enabled: !!user,
    refetchInterval: realtimeDown ? MESSAGES_POLL_INTERVAL_MS : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .eq("conversation_id", id)
        .not("emoji", "is", null);
      if (error) throw error;
      return data as Reaction[];
    },
  });
  const reactions = useMemo(() => groupReactions(reactionRows), [reactionRows]);
  const latestSenderId = latestMessage?.sender_id;
  const messagesLoaded = messageData !== undefined;

  // Pågående «Vis eldre meldinger»-henting. Realtime-INSERT venter på den i
  // stedet for å avbryte den, se kanalen under.
  const olderFetchRef = useRef<Promise<unknown> | null>(null);
  async function loadOlderMessages() {
    const el = scrollRef.current;
    const height = el?.scrollHeight ?? 0;
    const top = el?.scrollTop ?? 0;
    const fetching = fetchNextPage();
    olderFetchRef.current = fetching;
    await fetching;
    if (olderFetchRef.current === fetching) olderFetchRef.current = null;
    requestAnimationFrame(() => {
      if (el && el === scrollRef.current) el.scrollTop = top + el.scrollHeight - height;
    });
  }

  // Signerte URL-er for meldingsvedlegg (privat bucket, samme mønster som annonsebilder).
  const signMissingAttachments = useEffectEvent((msgs: typeof messages) => {
    const paths = (msgs ?? [])
      .map((m) => m.attachment_path)
      .filter((p): p is string => !!p && !attachmentUrls[p]);
    if (paths.length === 0) return;
    signMessageAttachmentUrls(paths)
      .then((urls) => setAttachmentUrls((prev) => ({ ...prev, ...urls })))
      .catch(() => {
        // Best-effort — feiler signeringen, vises vedlegget bare uten
        // forhåndsvisning fremfor å knekke resten av samtalen.
      });
  });
  useEffect(() => {
    signMissingAttachments(messages);
  }, [messages]);

  // Bilde av annonsen
  const coverUrl = useMemo(() => {
    const imgs = (conv?.listing?.listing_images ?? [])
      .slice()
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
    const path = imgs[0]?.storage_path;
    return path ? (signListingImageUrls([path])[path] ?? null) : null;
  }, [conv?.listing?.listing_images]);

  // Markér samtalen som lest i databasen for innlogget bruker.
  // lastMarkedRef hindrer at samme (eller eldre) tidsstempel skrives på nytt
  // for hver realtime-INSERT eller cache-oppdatering.
  const lastMarkedRef = useRef<string | null>(null);
  // Nullstill guarden når man navigerer til en annen samtale, ellers kan et
  // nyere tidsstempel fra forrige samtale blokkere lest-markering av denne.
  useEffect(() => {
    lastMarkedRef.current = null;
  }, [id]);
  const markReadMutation = useMutation({
    mutationFn: async ({
      readAt,
      conv: readConv,
      user: readUser,
    }: {
      readAt: string;
      conv: NonNullable<typeof conv>;
      user: NonNullable<typeof user>;
    }) => {
      const update =
        readConv.seller_id === readUser.id || readConv.isBusinessSeller
          ? { seller_last_read_at: readAt }
          : { buyer_last_read_at: readAt };
      const { error } = await supabase.from("conversations").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Oppdater cachen direkte for å unngå race condition mot INSERT-refetch
      queryClient.setQueryData<ConvSummary[]>(
        ["unread-conversations", user?.id],
        (prev) =>
          prev?.map((c) =>
            c.id === id ? { ...c, my_last_read_at: new Date().toISOString() } : c,
          ) ?? prev,
      );
      queryClient.invalidateQueries({ queryKey: ["unread-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages-preview"] });
    },
    onError: (e: Error) => {
      lastMarkedRef.current = null;
      showErrorToast(formatErrorMessage(e, "Kunne ikke markere samtalen som lest"));
    },
  });

  // Realtime
  useEffect(() => {
    // Slås av i cleanup: supabase.removeChannel(...) er asynkron, så den
    // gamle kanalens sene CLOSED-status kan komme inn etter at en ny kanal
    // (for neste samtale) allerede har meldt SUBSCRIBED. Uten denne sjekken
    // overskriver den sene CLOSED-en realtimeDown til true permanent.
    let active = true;
    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        async (payload) => {
          const m = payload.new as Message;
          // En henting som startet før meldingen kom, kan overskrive den. En
          // fetchNextPage bygger pages fra sidene som fantes da den startet,
          // så vent til den er ferdig fremfor å avbryte bakoverpagineringen.
          // Andre hentinger (polling, refetch) avbrytes.
          const olderFetch = olderFetchRef.current;
          if (olderFetch) await olderFetch.catch(() => {});
          else await queryClient.cancelQueries({ queryKey: ["messages", id] });
          if (!active) return;
          // Selgermeldinger kan endre fristen uten å endre om samtalen holder reservasjonen.
          // Hent også for egne meldinger fra en annen enhet eller bedriftskollega.
          const convCache = queryClient.getQueriesData<{
            buyer_id: string;
            listing_id: string | null;
          }>({ queryKey: ["conversation", id] })[0]?.[1];
          if (!messageOfferId(m) && convCache?.listing_id && m.sender_id !== convCache.buyer_id)
            void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
          const cached = queryClient.getQueryData(["messages", id]);
          if (cached) {
            queryClient.setQueryData<ConversationMessagesData>(["messages", id], (prev) =>
              upsertConversationMessage(prev, m),
            );
          } else {
            void queryClient.invalidateQueries({ queryKey: ["messages", id] });
          }
          // Markér som lest når brukeren er inne i samtalen
          if (conv && user && !(lastMarkedRef.current && m.created_at <= lastMarkedRef.current)) {
            lastMarkedRef.current = m.created_at;
            markReadMutation.mutate({ readAt: m.created_at, conv, user });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          // Sletting er en UPDATE (deleted_at): motparten må se den uten
          // refresh.
          const m = payload.new as Message;
          queryClient.setQueryData<ConversationMessagesData>(["messages", id], (prev) =>
            mapMessagePages(prev, (page) => page.map((x) => (x.id === m.id ? { ...x, ...m } : x))),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          // Fjernet reaksjon er en UPDATE til emoji = null, aldri DELETE.
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Reaction & { emoji: string | null };
          if (!row?.message_id) return;
          void applyRealtimeQueryUpdate<Reaction[]>(
            queryClient,
            ["message-reactions", id],
            (prev) => applyReaction(prev, row),
            () => active,
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as {
            buyer_last_read_at: string | null;
            seller_last_read_at: string | null;
          };
          let reservationChanged = false;
          // Prefiks: den aktive nøkkelen inneholder også isBusinessSuperuser.
          queryClient.setQueriesData<typeof conv>({ queryKey: ["conversation", id] }, (prev) => {
            if (!prev) return prev;
            if (conversationHoldsReservation(prev) !== conversationHoldsReservation(updated))
              reservationChanged = true;
            return {
              ...prev,
              buyer_last_read_at: updated.buyer_last_read_at,
              seller_last_read_at: updated.seller_last_read_at,
            };
          });
          // Selgeren reserverte eller opphevet: hent reservasjonsfristen på nytt.
          if (reservationChanged)
            void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
        },
      );
    subscribeOfferChanges(channel, id, queryClient, () => active);
    channel.subscribe((status) => {
      if (!active) return;
      // SUBSCRIBED = kanalen virker → ingen polling. Alt annet
      // (CHANNEL_ERROR/TIMED_OUT/CLOSED) → slå på poll-fallback.
      setRealtimeDown(status !== "SUBSCRIBED");
    });
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queryClient, userId]);

  // Fallback: refresh samtale + meldinger når fanen/appen får fokus igjen
  // (i tilfelle realtime ikke leverer) — samme mønster som use-unread.ts.
  useForegroundRefresh(() => {
    queryClient.invalidateQueries({ queryKey: ["messages", id] });
    queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    queryClient.invalidateQueries({ queryKey: ["message-reactions", id] });
    queryClient.invalidateQueries({ queryKey: ["offers", id] });
  }, !!user);

  const markRead = useEffectEvent((vars: Parameters<typeof markReadMutation.mutate>[0]) =>
    markReadMutation.mutate(vars),
  );

  // Behold leseposisjonen i historikken; følg nye meldinger ved bunnen og egen sending.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !messagesLoaded) return;
    const firstLoad = scrolledConversationRef.current !== id;
    scrolledConversationRef.current = id;
    const ownMessage = latestSenderId !== undefined && latestSenderId === userId;
    if (!firstLoad && !followingLatestRef.current && !ownMessage) return;
    // Utsett scroll til etter DOM-paint (viktig på Capacitor WebView).
    const frame = requestAnimationFrame(() => {
      if (el !== scrollRef.current) return;
      el.scrollTop = el.scrollHeight;
      followingLatestRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessage?.id, latestSenderId, id, userId, messagesLoaded]);

  useEffect(() => {
    if (messagesLoaded && conv && user) {
      const readAt = latestMessage?.created_at ?? new Date().toISOString();
      if (!(lastMarkedRef.current && readAt <= lastMarkedRef.current)) {
        lastMarkedRef.current = readAt;
        markRead({ readAt, conv, user });
      }
    }
  }, [latestMessage?.id, latestMessage?.created_at, id, conv, user, messagesLoaded]);

  const sendMessageFn = useServerFn(sendMessage);

  const sendMutation = useMutation({
    mutationFn: async ({
      text,
      file,
      attempt,
      conversationId,
    }: {
      text: string;
      file: File | null;
      attempt: { clientId: string; attachmentPath: string | null };
      // Samtalen meldingen ble skrevet i; ruten kan ha byttet før svaret kommer.
      conversationId: string;
    }) => {
      const trimmed = text.trim();
      if (!trimmed && !file) throw new Error("Tom melding");
      if (trimmed.length > 4000) throw new Error("Meldingen er for lang");
      if (file && !attempt.attachmentPath) {
        const compressed = await compressImage(file, "listing");
        attempt.attachmentPath = await uploadMessageAttachment({
          conversationId,
          file: compressed,
        });
      }
      const data = await sendMessageFn({
        data: {
          conversationId,
          body: trimmed,
          attachmentPath: attempt.attachmentPath,
          clientId: attempt.clientId,
        },
      });
      return data as Message;
    },
    // conversations.last_message_at oppdateres nå atomisk av en
    // databasetrigger (messages_bump_conversation_last_message_at_trg)
    // for å unngå at feltet kan drifte fra faktisk siste melding.
    // Optimistisk: vis meldingen og tøm feltet umiddelbart; rull tilbake ved feil.
    onMutate: async ({ text, file, conversationId }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const trimmed = text.trim();
      if ((!trimmed && !file) || trimmed.length > 4000) return {};
      const previewUrl = file ? URL.createObjectURL(file) : undefined;
      const optimistic: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        conversation_id: conversationId,
        sender_id: user!.id,
        body: trimmed,
        created_at: new Date().toISOString(),
        deleted_at: null,
        pending: true,
        attachmentPreviewUrl: previewUrl,
      };
      queryClient.setQueryData<ConversationMessagesData>(["messages", conversationId], (prev) =>
        upsertConversationMessage(prev, optimistic),
      );
      setBody("");
      clearAttachment();
      return { optimisticId: optimistic.id, previousBody: text, previewUrl };
    },
    onSuccess: (m, vars, context) => {
      queryClient.setQueryData<ConversationMessagesData>(
        ["messages", vars.conversationId],
        (prev) => upsertConversationMessage(prev, m, context?.optimisticId),
      );
      void queryClient.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      if (context?.previewUrl) URL.revokeObjectURL(context.previewUrl);
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
      void import("@/lib/haptics").then((m) => m.hapticSelection());
      if (sendAttemptRef.current === vars.attempt) sendAttemptRef.current = null;
    },
    onError: (e: Error, vars, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<ConversationMessagesData>(
          ["messages", vars.conversationId],
          (prev) =>
            mapMessagePages(prev, (page) => page.filter((x) => x.id !== context.optimisticId)),
        );
        if (sendAttemptRef.current === vars.attempt) {
          setBody((curr) => (curr.trim() ? curr : (context.previousBody ?? "")));
          if (vars.file) {
            setAttachment((current) => current ?? vars.file);
            setAttachmentPreview((current) => current ?? URL.createObjectURL(vars.file!));
          }
        }
      }
      if (context?.previewUrl) URL.revokeObjectURL(context.previewUrl);
      void queryClient.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      showErrorToast(formatErrorMessage(e, "Meldingen ble ikke sendt. Prøv igjen."));
    },
  });

  function sendCurrentMessage() {
    const attempt = sendAttemptRef.current ?? {
      clientId: crypto.randomUUID(),
      attachmentPath: null,
    };
    sendAttemptRef.current = attempt;
    sendMutation.mutate({
      text: body,
      file: attachment,
      attempt,
      conversationId: id,
    });
  }

  function clearAttachment() {
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAttachmentChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImages([file]);
    if (err) {
      showErrorToast(describeImageError(err));
      e.target.value = "";
      return;
    }
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
    sendAttemptRef.current = null;
  }

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (error) throw error;
      return messageId;
    },
    onSuccess: (messageId) => {
      queryClient.setQueryData<ConversationMessagesData>(["messages", id], (prev) =>
        mapMessagePages(prev, (page) =>
          page.map((m) =>
            m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m,
          ),
        ),
      );
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette meldingen")),
  });

  const reactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string | null }) => {
      const { error } = await supabase.rpc("set_message_reaction", {
        _message_id: messageId,
        _emoji: emoji,
      });
      if (error) throw error;
    },
    onMutate: async ({ messageId, emoji }) => {
      // En henting som allerede er i gang ville ellers vist den gamle reaksjonen.
      await queryClient.cancelQueries({ queryKey: ["message-reactions", id] });
      queryClient.setQueryData<Reaction[]>(["message-reactions", id], (prev) =>
        applyReaction(prev, { message_id: messageId, user_id: user!.id, emoji }),
      );
    },
    onError: (e: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["message-reactions", id] });
      showErrorToast(
        e.message === "rate_limited"
          ? "Du har endret mange reaksjoner på kort tid. Vent litt og prøv igjen."
          : formatErrorMessage(e, "Kunne ikke lagre reaksjonen"),
      );
    },
  });

  // Same number as the ad and the search cards: for a vehicle where the buyer
  // pays the re-registration fee, every price shown to them is the total.
  const conversationPriceKr = conv?.listing
    ? displayPriceNok({
        category_slug:
          (Array.isArray(conv.listing.categories)
            ? conv.listing.categories[0]
            : conv.listing.categories
          )?.slug ?? null,
        price_nok: conv.listing.price_nok,
        attributes: (conv.listing.attributes ?? null) as Record<string, unknown> | null,
      })
    : null;
  const priceLabel =
    !conv?.listing && conv?.wtbListing
      ? conv.wtbListing.max_price_nok != null
        ? formatWtbMaxPrice(conv.wtbListing.max_price_nok, "Ønskes kjøpt · maks ")
        : "Ønskes kjøpt"
      : conv?.listing?.is_free
        ? "Gis bort"
        : conversationPriceKr != null
          ? `${formatNokNumber(conversationPriceKr)} kr`
          : "Pris ved henvendelse";
  const isBusinessSeller = !!conv?.isBusinessSeller;
  const otherId = conv
    ? conv.seller_id === user?.id || isBusinessSeller
      ? conv.buyer_id
      : conv.seller_id
    : null;
  const isSeller = !!(conv && user && (conv.seller_id === user.id || isBusinessSeller));
  const personalSellerControlsDisabled = isBusinessSeller && conv?.seller_id !== user?.id;
  const listingId = conv?.listing_id ?? null;

  const { data: sale, refetch: refetchSale } = useQuery({
    queryKey: ["listing-sale", listingId],
    enabled: TRADE_AVAILABLE && !!listingId,
    queryFn: () => getSaleFn({ data: { listingId: listingId! } }),
  });

  const saleIsForThisConversation = !!(sale && sale.conversation_id === id);
  const saleConfirmedForOtherBuyer = !!(sale && !saleIsForThisConversation);
  const iAmInSale = !!(sale && user && (sale.buyer_id === user.id || sale.seller_id === user.id));

  const { data: myReview, refetch: refetchMyReview } = useQuery({
    queryKey: ["my-review", listingId],
    enabled: !!listingId && iAmInSale,
    queryFn: () => getMyReviewFn({ data: { listingId: listingId! } }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmBuyerFn({ data: { conversationId: id } }),
    onSuccess: () => {
      showSuccessToast("Kjøper bekreftet");
      refetchSale();
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      queryClient.invalidateQueries({ queryKey: ["my-conversations"] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke bekrefte kjøper")),
  });

  const unconfirmMutation = useMutation({
    mutationFn: () => unconfirmBuyerFn({ data: { listingId: listingId! } }),
    onSuccess: () => {
      showSuccessToast("Salget er angret");
      refetchSale();
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke angre salget")),
  });

  const iBlockedAll = !!(
    otherId && myBlocks?.some((b) => b.scope === "all" && b.blocked_id === otherId)
  );
  const iBlockedConv = !!myBlocks?.some(
    (b) => b.scope === "conversation" && b.conversation_id === id,
  );
  const iBlocked = iBlockedAll || iBlockedConv;
  const theyBlockedMe = !!(
    otherId &&
    blocksAgainstMe?.some(
      (b) => b.blocker_id === otherId && (b.scope === "all" || b.conversation_id === id),
    )
  );
  const disabled = !!conv?.otherDeleted || !!conv?.otherPending || iBlocked || theyBlockedMe;
  const disabledPlaceholder =
    conv?.otherDeleted || conv?.otherPending
      ? "Du kan ikke svare denne brukeren"
      : iBlocked
        ? "Du har blokkert denne samtalen"
        : theyBlockedMe
          ? "Du kan ikke sende meldinger i denne samtalen"
          : "Skriv en melding…";

  const otherName =
    conv?.otherOrganization?.name ??
    (conv?.otherDeleted ? "Slettet bruker" : (conv?.other?.display_name ?? "Ukjent bruker"));
  const offerListing = conv?.listing
    ? {
        id: conv.listing.id,
        status: conv.listing.status,
        is_free: conv.listing.is_free,
        category_id: conv.listing.category_id,
        reserved_until: listingReservedUntil(conv.listing),
        holdsReservation: conversationHoldsReservation(conv),
      }
    : null;
  const offers = useConversationOffers({
    conversationId: id,
    userId,
    buyerId: conv?.buyer_id,
    isSeller,
    otherName,
    listing: offerListing,
    priceNok: conversationPriceKr,
    canAct: !disabled,
    sold: !!sale,
    desktop: isDesktop,
    pollMs: realtimeDown ? MESSAGES_POLL_INTERVAL_MS : false,
    confettiCanvasRef,
    onOpenActions: setActionsFor,
  });

  if (convIsError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Samtalen finnes ikke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatErrorMessage(convError, "Kunne ikke laste samtalen.")}
        </p>
        <Link to="/meldinger">
          <Button className="mt-6" variant="outline">
            Tilbake til meldinger
          </Button>
        </Link>
      </div>
    );
  }

  const step =
    TRADE_AVAILABLE && conv?.listing_id
      ? tradeStep({
          hasMessages: messages.length > 0,
          agreed: offers.agreed,
          soldInThisConversation: saleIsForThisConversation,
        })
      : undefined;
  const tradePanel: TradePanelProps | null = conv
    ? {
        subject: conv.listing
          ? {
              kind: "listing",
              kaupetCode: (conv.listing as { kaupet_code: string }).kaupet_code,
              title: conv.listing.title,
            }
          : conv.wtbListing
            ? { kind: "wtb", id: conv.wtbListing.id, title: conv.wtbListing.title }
            : null,
        coverUrl,
        priceLabel,
        other: otherId
          ? {
              id: otherId,
              name: otherName,
              avatarUrl: conv.other?.avatar_url ?? null,
              deleted: !!conv.otherDeleted,
            }
          : null,
        otherOrganization: conv.otherOrganization,
        // Salg finnes bare for salgsannonser, ikke kjøpsønsker.
        sale:
          TRADE_AVAILABLE && conv.listing_id && !personalSellerControlsDisabled
            ? {
                isSeller,
                hasMessages: messages.length > 0,
                sale: sale ?? null,
                saleConfirmedForOtherBuyer,
                otherName,
                otherDeleted: !!conv.otherDeleted,
                hasReviewed: !!myReview,
                onConfirm: () => confirmMutation.mutate(),
                onUnconfirm: () => unconfirmMutation.mutate(),
                confirming: confirmMutation.isPending,
                unconfirming: unconfirmMutation.isPending,
              }
            : null,
        conversationId: id,
        showBlockMenu:
          !!otherId && !conv.otherDeleted && !theyBlockedMe && !personalSellerControlsDisabled,
      }
    : null;
  const showReviewForm =
    !!conv?.listing_id &&
    saleIsForThisConversation &&
    iAmInSale &&
    (!conv.otherDeleted || !!conv.otherOrganization) &&
    !personalSellerControlsDisabled;

  const thread = (
    <div
      className={cn("flex min-w-0 flex-col", !isDesktop && "mx-auto max-w-2xl")}
      style={{
        // Bunnmenyen er skjult i en åpen samtale (ConversationOpen), så native
        // bruker hele den synlige høyden — også når tastaturet er oppe.
        height: native ? "var(--vvh, 100vh)" : "calc(100dvh - var(--site-header-h))",
      }}
    >
      <ConversationHeader
        native={native}
        loading={convLoading}
        title={conv?.listing?.title ?? conv?.wtbListing?.title ?? null}
        coverUrl={coverUrl}
        priceLabel={priceLabel}
        other={{
          id: conv?.otherDeleted ? null : otherId,
          name: otherName,
          avatarUrl: conv?.other?.avatar_url ?? null,
          deleted: !!conv?.otherDeleted,
        }}
        otherOrganization={conv?.otherOrganization ?? null}
        backTo={isTablet || isDesktop ? null : source === "business" ? "/bedrift" : "/meldinger"}
        onOpenPanel={tradePanel && !isDesktop ? () => setPanelOpen(true) : undefined}
        step={isDesktop || (native && keyboardVisible) ? undefined : step}
      />

      {conv && (conv.otherDeleted || conv.otherPending) && (
        <p className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          {conv.otherDeleted
            ? "Denne brukeren har slettet kontoen sin. Du kan ikke lenger sende meldinger i denne samtalen."
            : "Denne brukeren har bedt om å få slettet kontoen sin. Du kan ikke sende nye meldinger."}
        </p>
      )}

      {conv && iBlocked && (
        <p className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          {iBlockedAll
            ? `Du har blokkert ${conv.other?.display_name ?? "denne brukeren"}. Du kan oppheve blokkeringen under «Blokker og rapporter» ved annonsen eller fra profilen din.`
            : "Du har blokkert denne samtalen. Du kan oppheve blokkeringen under «Blokker og rapporter» ved annonsen eller fra profilen din."}
        </p>
      )}

      {conv && theyBlockedMe && !iBlocked && (
        <p className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          Du kan ikke sende meldinger i denne samtalen.
        </p>
      )}

      {offers.banner}

      <canvas
        ref={confettiCanvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 size-full"
      />

      <div
        key={id}
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          followingLatestRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
        }}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="mx-auto flex"
            disabled={isFetchingNextPage}
            onClick={() => void loadOlderMessages()}
          >
            {isFetchingNextPage ? "Henter eldre meldinger…" : "Vis eldre meldinger"}
          </Button>
        )}
        {isFetchNextPageError && <p role="alert">Kunne ikke hente eldre meldinger. Prøv igjen.</p>}
        {messagesError && !messageData ? (
          <div role="alert">
            <p>Kunne ikke hente meldingene.</p>
            <Button variant="outline" onClick={() => void refetchMessages()}>
              Prøv igjen
            </Button>
          </div>
        ) : messagesLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {conv
              ? `Send den første meldingen til ${otherName}${conv.listing?.title ? ` om «${conv.listing.title}»` : ""}.`
              : "Send den første meldingen for å starte samtalen."}
          </p>
        ) : (
          renderWithDayDividers(
            messages,
            user?.id ?? "",
            conv && user
              ? conv.buyer_id === user.id
                ? conv.seller_last_read_at
                : conv.buyer_last_read_at
              : null,
            attachmentUrls,
            {
              reactions,
              otherName,
              canReact: !disabled,
              onOpenActions: setActionsFor,
              onReact: (m, emoji) => reactMutation.mutate({ messageId: m.id, emoji }),
              renderOffer: offers.renderOffer,
            },
          )
        )}
        {showReviewForm && (
          <div className="mx-auto mt-4 max-w-md">
            <ReviewForm
              myReview={myReview ?? null}
              otherName={otherName}
              onSubmit={async (rating, comment) => {
                await createReviewFn({ data: { listingId: listingId!, rating, comment } });
                showSuccessToast("Takk for vurderingen!");
                refetchMyReview();
                void queryClient.invalidateQueries({ queryKey: ["organization-reviews"] });
                void queryClient.invalidateQueries({ queryKey: ["user-reviews"] });
                void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
              }}
            />
          </div>
        )}
        {!messagesLoading && conv && !listingOrganizationId(conv.listing) && (
          <TradeSafetyAdvice context="conversation" messageCount={messages.length} />
        )}
      </div>

      <ConversationComposer
        body={body}
        onBodyChange={(value) => {
          sendAttemptRef.current = null;
          setBody(value);
        }}
        attachmentPreview={attachmentPreview}
        onRemoveAttachment={() => {
          sendAttemptRef.current = null;
          clearAttachment();
        }}
        fileInputRef={fileInputRef}
        onAttachmentChange={handleAttachmentChange}
        disabled={disabled}
        placeholder={disabledPlaceholder}
        canSend={!sendMutation.isPending && !!(body.trim() || attachment)}
        hasAttachment={!!attachment}
        onSend={sendCurrentMessage}
        native={native}
        keyboardVisible={keyboardVisible}
        onOffer={offers.canOffer ? offers.startOffer : undefined}
      />

      {offers.sheets}

      <MessageActions
        message={actionsFor}
        onClose={() => setActionsFor(null)}
        myId={user?.id ?? ""}
        myReaction={
          (actionsFor &&
            reactions.get(actionsFor.id)?.find((r) => r.user_id === user?.id)?.emoji) ??
          null
        }
        canReact={!disabled && !(actionsFor && messageOfferId(actionsFor))}
        reportUserId={otherId && !conv?.otherDeleted ? otherId : null}
        onReact={(m, emoji) => reactMutation.mutate({ messageId: m.id, emoji })}
        onDelete={(messageId) => deleteMessageMutation.mutate(messageId)}
      />

      {tradePanel && !isDesktop && (
        <ResponsiveOverlay open={panelOpen} onOpenChange={setPanelOpen}>
          <ResponsiveOverlayContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Om handelen</DialogTitle>
              <DialogDescription className="sr-only">
                Annonsen, motparten og valg for samtalen.
              </DialogDescription>
            </DialogHeader>
            <TradePanel {...tradePanel} />
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      )}
    </div>
  );

  // Native telefon: skrivefeltet tar bunnmenyens plass.
  const conversationOpen = native && !isTablet && <ConversationOpen />;

  // Desktop: innboks, samtale og handelspanel side om side. Handelspanelet
  // erstatter annonsearket.
  if (isDesktop) {
    return (
      <div className="flex" style={{ height: "calc(100dvh - var(--site-header-h))" }}>
        <aside className="w-80 shrink-0 overflow-y-auto overscroll-contain border-r border-border">
          <InboxPage />
        </aside>
        <div className="min-w-0 flex-1">{thread}</div>
        <aside
          aria-label="Om handelen"
          className="w-80 shrink-0 overflow-y-auto overscroll-contain border-l border-border p-5"
        >
          {tradePanel ? (
            <TradePanel {...tradePanel} step={step} />
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
        </aside>
      </div>
    );
  }

  // Nettbrett (fase 10 / tiltak 22): liste + tråd side om side. Begge er
  // eksisterende komponenter — dette er et layoutgrep, ikke ny meldingslogikk.
  if (!isTablet)
    return (
      <>
        {conversationOpen}
        {thread}
      </>
    );
  return (
    <div className="flex">
      <aside
        className="w-80 shrink-0 overflow-y-auto overscroll-contain border-r border-border"
        style={{ height: keyboardVisible ? "var(--vvh, 100vh)" : "100vh" }}
      >
        <InboxPage />
      </aside>
      <div className="min-w-0 flex-1">{thread}</div>
    </div>
  );
}
