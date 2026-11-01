import type { ChangeEvent, RefObject } from "react";
import { ArrowUp, HandCoins, ImagePlus, Plus, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { IMAGE_ACCEPT } from "@/lib/storage";
import { cn } from "@/lib/utils";

type Props = {
  body: string;
  onBodyChange: (value: string) => void;
  attachmentPreview: string | null;
  onRemoveAttachment: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachmentChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
  placeholder: string;
  /** Det finnes tekst eller vedlegg, og ingen sending pågår. */
  canSend: boolean;
  hasAttachment: boolean;
  onSend: () => void;
  native: boolean;
  /** Tastaturet er oppe: safe area i bunnen dekkes allerede av tastaturet. */
  keyboardVisible: boolean;
  /** Satt når kjøperen kan gi bud: + åpner da en meny med bilde og bud. */
  onOffer?: () => void;
};

/** Skrivefeltet som pille: + (bilde, og bud når det er mulig), tekst og send-pil. */
export function ConversationComposer({
  body,
  onBodyChange,
  attachmentPreview,
  onRemoveAttachment,
  fileInputRef,
  onAttachmentChange,
  disabled,
  placeholder,
  canSend,
  hasAttachment,
  onSend,
  native,
  keyboardVisible,
  onOffer,
}: Props) {
  const plusClass =
    "flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/70 disabled:opacity-50";
  const pickImage = () => fileInputRef.current?.click();
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-background px-3 pt-2",
        native && !keyboardVisible ? "pb-safe" : "pb-2",
      )}
    >
      {attachmentPreview && (
        <div className="relative mb-2 ml-11 w-fit">
          <img
            src={attachmentPreview}
            alt="Vedlegg som skal sendes"
            className="max-h-24 rounded-lg border border-border object-contain"
          />
          <button
            type="button"
            aria-label="Fjern vedlegg"
            onClick={onRemoveAttachment}
            className="absolute -right-2 -top-2 flex size-12 items-center justify-center rounded-full bg-foreground/80 text-background"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend && !disabled) onSend();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={onAttachmentChange}
          disabled={disabled}
        />
        {onOffer && !disabled ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Bilde eller bud" className={plusClass}>
                <Plus className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem onSelect={onOffer}>
                <HandCoins className="size-4" aria-hidden />
                Gi bud
              </DropdownMenuItem>
              <DropdownMenuItem disabled={hasAttachment} onSelect={pickImage}>
                <ImagePlus className="size-4" aria-hidden />
                Legg ved bilde
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            aria-label="Legg ved bilde"
            disabled={disabled || hasAttachment}
            onClick={pickImage}
            className={plusClass}
          >
            <Plus className="size-5" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-end rounded-3xl border border-input bg-card pl-4 pr-1 focus-within:ring-1 focus-within:ring-ring">
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter-for-å-sende er en tastatursnarvei for fysisk tastatur
              // (desktop/web), der Shift+Enter gir linjeskift. Native
              // mobiltastaturer har ingen pålitelig Shift-tilstand å skille
              // på, og retur-tasten er brukerens eneste måte å skrive en
              // flerlinjers melding på - der skal Enter derfor gi linjeskift
              // som normalt, og send-pilen sender.
              if (native) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend && !disabled) onSend();
              }
            }}
            placeholder={placeholder}
            aria-label="Melding"
            rows={1}
            maxLength={4000}
            disabled={disabled}
            // field-sizing vokser med teksten der motoren støtter det; ellers
            // står feltet på én linje og ruller.
            className="max-h-32 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-base [field-sizing:content] placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend || disabled}
            className="my-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:bg-muted disabled:text-muted-foreground"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
