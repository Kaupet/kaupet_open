import { useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Flag, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReportDialog, USER_REPORT_REASONS } from "@/components/report-dialog";
import { useOverlayHistory } from "@/hooks/use-overlay-history";
import { submitUserReport } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type { Message } from "./message-list";
import { REACTIONS } from "./reactions";

export function ReactionBar({
  current,
  onPick,
  className,
}: {
  current: string | null;
  /** null fjerner reaksjonen (trykk på den man allerede har valgt). */
  onPick: (emoji: string | null) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Reager"
      className={cn("flex gap-0.5 rounded-full border bg-popover p-1 shadow-lg", className)}
    >
      {REACTIONS.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-label={`Reager med ${r.label}`}
          aria-pressed={current === r.emoji}
          onClick={() => {
            void import("@/lib/haptics").then((h) => h.hapticSelection());
            onPick(current === r.emoji ? null : r.emoji);
          }}
          className="flex size-11 items-center justify-center rounded-full text-2xl transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent"
        >
          {r.emoji}
        </button>
      ))}
    </div>
  );
}

type Props = {
  /** Meldingen menyen er åpen for, eller null når den er lukket. */
  message: Message | null;
  onClose: () => void;
  myId: string;
  myReaction: string | null;
  canReact: boolean;
  /** Motparten som rapporteres; null når rapportering ikke er mulig. */
  reportUserId: string | null;
  onReact: (message: Message, emoji: string | null) => void;
  onDelete: (messageId: string) => void;
};

/** Hold-inne-meny: uskarp bakgrunn, reaksjonslinje over boblen og handlinger
 * under. Sletting og rapportering lever videre etter at menyen lukkes. */
export function MessageActions({
  message,
  onClose,
  myId,
  myReaction,
  canReact,
  reportUserId,
  onReact,
  onDelete,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reportOf, setReportOf] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reportFn = useServerFn(submitUserReport);
  useOverlayHistory(!!message, onClose);

  const reportMut = useMutation({
    mutationFn: (m: Message) =>
      reportFn({
        data: {
          // Avsenderen, ikke samtalens motpart: i bedriftssamtaler kan det være en kollega.
          reportedUserId: m.sender_id,
          reason: reportReason,
          comment: reportComment.trim() || undefined,
          // Moderatoren ser ikke samtalen; serveren siterer meldingen.
          messageId: m.id,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Rapporten er sendt inn");
      setReportOf(null);
      setReportReason("");
      setReportComment("");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke sende inn rapporten")),
  });

  const mine = message?.sender_id === myId;
  // Plasser stabelen ved boblen i samtalen (forhåndsvisningen over originalen),
  // holdt innenfor skjermen. Uten boble (f.eks. budkort) blir den sentrert.
  const placeStack = (el: HTMLDivElement | null) => {
    if (!el || !message) return;
    const bubble = document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    const parent = el.parentElement;
    if (!bubble || !parent) return;
    const rect = bubble.getBoundingClientRect();
    el.style.position = "absolute";
    if (mine) el.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
    else el.style.left = `${Math.max(16, rect.left)}px`;
    const preview = el.querySelector("[data-message-preview]");
    if (preview instanceof HTMLElement) preview.style.maxWidth = `${rect.width}px`;
    const pad = getComputedStyle(parent);
    const min = Math.max(16, parseFloat(pad.paddingTop) || 0);
    const max =
      window.innerHeight - el.offsetHeight - Math.max(16, parseFloat(pad.paddingBottom) || 0);
    const offset = preview instanceof HTMLElement ? preview.offsetTop : 0;
    el.style.top = `${Math.max(min, Math.min(rect.top - offset, max))}px`;
  };
  const itemClass =
    "flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

  return (
    <>
      <DialogPrimitive.Root open={!!message} onOpenChange={(open) => !open && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-background/60 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            onOpenAutoFocus={() => {
              returnFocusRef.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocusRef.current?.focus();
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
            className={cn(
              "fixed inset-0 z-[10000] flex flex-col justify-center gap-2 px-4 pb-safe pt-safe outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95",
              mine ? "items-end" : "items-start",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Valg for meldingen</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Reager på meldingen eller velg en handling.
            </DialogPrimitive.Description>
            {message && (
              <div
                ref={placeStack}
                className={cn(
                  "flex max-w-[calc(100%-2rem)] flex-col gap-2",
                  mine ? "items-end" : "items-start",
                )}
              >
                {canReact && (
                  <ReactionBar
                    current={myReaction}
                    onPick={(emoji) => {
                      onReact(message, emoji);
                      onClose();
                    }}
                  />
                )}
                <div
                  data-message-preview
                  className={cn(
                    "max-h-[40vh] max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 text-sm shadow-lg",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  <p className="line-clamp-[12] whitespace-pre-wrap break-words">
                    {message.body || "📷 Bilde"}
                  </p>
                </div>
                <div className="w-56 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
                  {message.body && (
                    <button
                      type="button"
                      className={itemClass}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(message.body)
                          .then(() => showSuccessToast("Kopiert"))
                          .catch(() => showErrorToast("Kunne ikke kopiere meldingen"));
                        onClose();
                      }}
                    >
                      Kopier <Copy className="size-4" aria-hidden />
                    </button>
                  )}
                  {mine ? (
                    <button
                      type="button"
                      className={cn(itemClass, "text-destructive")}
                      onClick={() => {
                        setConfirmDelete(message.id);
                        onClose();
                      }}
                    >
                      Slett <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : (
                    reportUserId && (
                      <button
                        type="button"
                        className={cn(itemClass, "text-destructive")}
                        onClick={() => {
                          setReportOf(message);
                          onClose();
                        }}
                      >
                        Rapporter <Flag className="size-4" aria-hidden />
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett melding</AlertDialogTitle>
            <AlertDialogDescription>
              Meldingen erstattes med «Melding slettet» for begge parter. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && onDelete(confirmDelete)}>
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportDialog
        open={!!reportOf}
        onOpenChange={(open) => !open && setReportOf(null)}
        title="Rapporter melding"
        description="Fortell oss hvorfor du rapporterer denne meldingen. Meldingen sendes med rapporten."
        reasons={USER_REPORT_REASONS}
        reason={reportReason}
        onReasonChange={setReportReason}
        comment={reportComment}
        onCommentChange={setReportComment}
        onSubmit={() => reportOf && reportMut.mutate(reportOf)}
        pending={reportMut.isPending}
      />
    </>
  );
}
