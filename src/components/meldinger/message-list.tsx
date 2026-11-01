import * as React from "react";
import { CheckCheck } from "lucide-react";

import type { ConversationMessage as Message } from "@/lib/conversation-messages";
import { MessageBubble } from "./message-bubble";
import type { Reaction } from "./reactions";
export type { ConversationMessage as Message } from "@/lib/conversation-messages";

export type MessageInteraction = {
  reactions: Map<string, Reaction[]>;
  otherName: string;
  canReact: boolean;
  onOpenActions: (m: Message) => void;
  onReact: (m: Message, emoji: string | null) => void;
  /** Budkort i stedet for boble for meldinger med offer_id; null gir vanlig boble. */
  renderOffer?: (m: Message) => React.ReactElement | null;
};

/** Meldinger fra samme avsender innen dette vinduet slås sammen til en gruppe. */
const GROUP_WINDOW_MS = 5 * 60_000;

function dayKey(d: Date) {
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
}

/** Siste boble i en gruppe får «hale» og klokkeslett. */
export function endsGroup(m: Message, next: Message | undefined) {
  if (!next || next.sender_id !== m.sender_id) return true;
  if (!!next.deleted_at !== !!m.deleted_at) return true;
  const a = new Date(m.created_at);
  const b = new Date(next.created_at);
  return dayKey(a) !== dayKey(b) || b.getTime() - a.getTime() > GROUP_WINDOW_MS;
}

export function renderWithDayDividers(
  messages: Message[],
  myId: string,
  otherLastReadAt?: string | null,
  attachmentUrls?: Record<string, string>,
  interaction?: MessageInteraction,
) {
  const out: React.ReactElement[] = [];
  let lastDay = "";
  let lastMineId: string | null = null;
  for (const m of messages) {
    if (m.sender_id === myId && !m.deleted_at) lastMineId = m.id;
  }
  messages.forEach((m, i) => {
    const d = new Date(m.created_at);
    const day = dayKey(d);
    const startsGroup = i === 0 || endsGroup(messages[i - 1], m);
    const lastInGroup = endsGroup(m, messages[i + 1]);
    if (day !== lastDay) {
      out.push(
        <div
          key={`d-${m.id}`}
          className="mb-2 mt-4 text-center text-xs font-medium text-muted-foreground first:mt-0"
        >
          {day}
        </div>,
      );
      lastDay = day;
    }
    const mine = m.sender_id === myId;
    const deleted = !!m.deleted_at;
    const isReadByOther =
      !!otherLastReadAt && new Date(m.created_at).getTime() <= new Date(otherLastReadAt).getTime();
    const showReadReceipt = mine && !deleted && m.id === lastMineId && isReadByOther;
    const offerCard = interaction?.renderOffer?.(m);
    out.push(
      offerCard ?? (
        <MessageBubble
          key={m.id}
          message={m}
          myId={myId}
          startsGroup={startsGroup}
          lastInGroup={lastInGroup}
          attachmentUrl={
            m.attachmentPreviewUrl ??
            (m.attachment_path ? attachmentUrls?.[m.attachment_path] : undefined)
          }
          interaction={deleted || m.pending ? undefined : interaction}
        />
      ),
    );
    if (showReadReceipt) {
      out.push(
        <p
          key={`r-${m.id}`}
          className="mr-1 mt-0.5 flex items-center justify-end gap-0.5 text-xs text-primary"
        >
          <CheckCheck className="size-3.5" aria-hidden />
          <span>Lest</span>
        </p>,
      );
    }
  });
  return out;
}
