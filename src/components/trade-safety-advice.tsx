import { ShieldCheck } from "lucide-react";

type Props =
  { context: "contact"; messageCount?: never } | { context: "conversation"; messageCount: number };

export function TradeSafetyAdvice(props: Props) {
  if (props.context === "conversation" && props.messageCount > 0) return null;

  if (props.context === "conversation") {
    // Kompakt linje i samtalen (retning C), ikke en blokk over tråden.
    return (
      <aside
        role="note"
        aria-label="Råd for trygg handel"
        className="mx-auto mt-3 flex w-fit max-w-full items-start gap-1.5 rounded-2xl bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground"
      >
        <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <p>
          Møt på et offentlig sted, kontroller varen før du betaler og vær forsiktig med
          forskuddsbetaling.
        </p>
      </aside>
    );
  }

  return (
    <aside
      role="note"
      aria-label="Råd for trygg handel"
      className="mx-auto flex max-w-md items-start gap-2 text-xs leading-relaxed text-muted-foreground"
    >
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <p>Vær forsiktig med forskuddsbetaling, særlig ved sending.</p>
    </aside>
  );
}
