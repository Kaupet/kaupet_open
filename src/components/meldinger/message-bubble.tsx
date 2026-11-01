import * as React from "react";
import { Ellipsis, SmilePlus } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";

import { ReactionBar } from "./message-actions";
import type { Message, MessageInteraction } from "./message-list";
import { reactionLabel, type Reaction } from "./reactions";

export function MessageBubble({
  message: m,
  myId,
  startsGroup,
  lastInGroup,
  attachmentUrl,
  interaction,
}: {
  message: Message;
  myId: string;
  startsGroup: boolean;
  lastInGroup: boolean;
  attachmentUrl?: string;
  /** Mangler for slettede og usendte meldinger: de har ingen meny. */
  interaction?: MessageInteraction;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const lastPointer = React.useRef<string | null>(null);
  const open = () => interaction?.onOpenActions(m);
  const longPress = useLongPress(() => {
    void import("@/lib/haptics").then((h) => h.hapticImpact("light"));
    open();
  });
  const mine = m.sender_id === myId;
  const deleted = !!m.deleted_at;
  const time = new Date(m.created_at).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const tail = lastInGroup ? (mine ? "rounded-br-md" : "rounded-bl-md") : "";
  const reactions = interaction?.reactions.get(m.id) ?? [];
  const myReaction = reactions.find((r) => r.user_id === myId)?.emoji ?? null;

  // Desktop: reaksjon og «…» ved hover/fokus. Skjult på berøringsskjerm,
  // der hold inne gjør samme jobb.
  const toolbar = interaction && (
    <div className="mb-1 hidden shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-fine:flex">
      {interaction.canReact && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Reager på meldingen"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <SmilePlus className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-auto border-0 bg-transparent p-0 shadow-none">
            <ReactionBar
              current={myReaction}
              onPick={(emoji) => {
                interaction.onReact(m, emoji);
                setPickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        aria-label="Flere valg"
        onClick={open}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Ellipsis className="size-4" />
      </button>
    </div>
  );

  return (
    <div
      className={cn(
        "group flex items-end gap-1",
        mine ? "justify-end" : "justify-start",
        startsGroup ? "mt-3" : "mt-0.5",
        reactions.length > 0 && "mb-3",
      )}
    >
      {mine && toolbar}
      <div className={cn("relative flex max-w-[75%] flex-col", mine ? "items-end" : "items-start")}>
        <div
          {...(interaction && {
            ...longPress,
            onPointerDown: (e: React.PointerEvent) => {
              lastPointer.current = e.pointerType;
              longPress.onPointerDown(e);
            },
            role: "button",
            tabIndex: 0,
            "aria-haspopup": "dialog" as const,
            // Trykk (og skjermleserens aktivering) åpner menyen. Mus bruker
            // «…»/høyreklikk, så klikk og dobbeltklikk kan markere tekst.
            onClick: () => {
              const pointer = lastPointer.current;
              lastPointer.current = null;
              if (pointer === "mouse" || !window.getSelection()?.isCollapsed) return;
              open();
            },
            onContextMenu: (e: React.MouseEvent) => {
              e.preventDefault();
              open();
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" ||
                  e.key === " " ||
                  e.key === "ContextMenu" ||
                  (e.shiftKey && e.key === "F10"))
              ) {
                e.preventDefault();
                open();
              }
            },
          })}
          data-message-id={m.id}
          title={time}
          className={cn(
            "rounded-2xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
            tail,
            deleted
              ? "bg-muted/40 italic text-muted-foreground"
              : mine
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            m.pending && "opacity-60",
          )}
        >
          {!deleted && attachmentUrl && (
            <img
              src={attachmentUrl}
              alt="Vedlegg"
              className="mb-1 max-h-64 max-w-full rounded-lg object-contain"
            />
          )}
          {(deleted || m.body) && (
            <p className="whitespace-pre-wrap break-words">
              {deleted ? "Melding slettet" : m.body}
            </p>
          )}
          {(lastInGroup || m.pending) && (
            <p
              className={cn(
                "mt-0.5 text-right text-[11px]",
                mine && !deleted ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {m.pending ? "Sender…" : time}
            </p>
          )}
        </div>
        {reactions.length > 0 && interaction && (
          <ReactionBadge
            reactions={reactions}
            myId={myId}
            otherName={interaction.otherName}
            mine={mine}
          />
        )}
      </div>
      {!mine && toolbar}
    </div>
  );
}

function ReactionBadge({
  reactions,
  myId,
  otherName,
  mine,
}: {
  reactions: Reaction[];
  myId: string;
  otherName: string;
  mine: boolean;
}) {
  const emojis = [...new Set(reactions.map((r) => r.emoji))];
  const description = reactions
    .map((r) => `${r.user_id === myId ? "Du" : otherName} reagerte med ${reactionLabel(r.emoji)}`)
    .join(". ");
  return (
    <span
      className={cn(
        "absolute -bottom-3.5 flex items-center gap-0.5 rounded-full border border-background bg-muted px-1.5 py-0.5 text-sm leading-none shadow-sm",
        mine ? "right-2" : "left-2",
      )}
    >
      <span aria-hidden>{emojis.join("")}</span>
      {reactions.length > 1 && emojis.length < reactions.length && (
        <span aria-hidden className="text-xs text-muted-foreground">
          {reactions.length}
        </span>
      )}
      <span className="sr-only">{description}</span>
    </span>
  );
}
