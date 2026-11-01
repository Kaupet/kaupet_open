import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, User as UserIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { TradeSteps } from "@/components/meldinger/trade-steps";
import type { TradeStep } from "@/components/meldinger/trade-step";
import { cn } from "@/lib/utils";

type Props = {
  loading: boolean;
  title: string | null;
  coverUrl: string | null;
  priceLabel: string;
  other: { id: string | null; name: string; avatarUrl: string | null; deleted: boolean };
  otherOrganization: { id: string; name: string; logoUrl: string | null } | null;
  /** null skjuler tilbakeknappen (innboksen står ved siden av). */
  backTo: "/meldinger" | "/bedrift" | null;
  /** Åpner annonsearket. Uten den (desktop, der handelspanelet står fremme)
   * er tittelen ren tekst. */
  onOpenPanel?: () => void;
  /** undefined skjuler stegindikatoren (kjøpsønsker, desktop). */
  step?: TradeStep | null;
  native: boolean;
};

/**
 * Samtaletoppen (retning C): annonsen er identiteten, motparten står under.
 * På native erstatter den NativePageHeader og eier safe area øverst.
 */
export function ConversationHeader({
  loading,
  title,
  coverUrl,
  priceLabel,
  other,
  otherOrganization,
  backTo,
  onOpenPanel,
  step,
  native,
}: Props) {
  const identity = (
    <>
      <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {coverUrl && <img src={coverUrl} alt="" className="size-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1">
          <span
            className={cn(
              "truncate text-sm font-semibold",
              !title && "font-normal italic text-muted-foreground",
            )}
          >
            {title ?? "Annonsen er ikke lenger tilgjengelig"}
          </span>
          {onOpenPanel && (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          med {otherOrganization?.name ?? other.name} · {priceLabel}
        </span>
      </span>
    </>
  );

  const avatarUrl = otherOrganization ? otherOrganization.logoUrl : other.avatarUrl;
  const avatar = avatarUrl ? (
    <img src={avatarUrl} alt="" className="size-9 rounded-full object-cover" />
  ) : (
    <span className="flex size-9 items-center justify-center rounded-full bg-muted">
      <UserIcon className="size-4 text-muted-foreground" />
    </span>
  );

  return (
    <header
      className={cn(
        "shrink-0 border-b border-border bg-background/95 backdrop-blur",
        native && "pt-safe pl-safe pr-safe",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-2">
        {backTo && (
          <Link
            to={backTo}
            aria-label={backTo === "/bedrift" ? "Tilbake til bedriften" : "Alle meldinger"}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted"
          >
            <ChevronLeft className="size-6" />
          </Link>
        )}
        {loading ? (
          <span className="flex min-w-0 flex-1 items-center gap-3 px-1">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <span className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </span>
          </span>
        ) : onOpenPanel ? (
          <button
            type="button"
            onClick={onOpenPanel}
            aria-haspopup="dialog"
            aria-label={`${title ?? "Annonsen"}, åpne annonsevalg`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 transition hover:bg-muted/60"
          >
            {identity}
          </button>
        ) : (
          <h1 className="flex min-w-0 flex-1 items-center gap-3 px-1">{identity}</h1>
        )}
        {otherOrganization ? (
          <Link
            to="/bedrift/$organizationId"
            params={{ organizationId: otherOrganization.id }}
            aria-label={`Se profilen til ${otherOrganization.name}`}
            className="shrink-0 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-primary"
          >
            {avatar}
          </Link>
        ) : other.id && !other.deleted ? (
          <Link
            to="/bruker/$id"
            params={{ id: other.id }}
            aria-label={`Se profilen til ${other.name}`}
            className="shrink-0 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-primary"
          >
            {avatar}
          </Link>
        ) : (
          <span className="shrink-0">{avatar}</span>
        )}
      </div>
      {step !== undefined && <TradeSteps step={step} className="px-4 pb-2" />}
    </header>
  );
}
