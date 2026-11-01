import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, User as UserIcon } from "lucide-react";

import { BlockConversationMenu } from "@/components/block-conversation-menu";
import { SaleActions, type SaleActionsProps } from "@/components/meldinger/sale-panel";
import { TradeSteps } from "@/components/meldinger/trade-steps";
import type { TradeStep } from "@/components/meldinger/trade-step";
import { StarRating } from "@/components/star-rating";
import { getPublicProfile } from "@/lib/profile.functions";

export type ConversationSubject =
  | { kind: "listing"; kaupetCode: string; title: string }
  | { kind: "wtb"; id: string; title: string }
  | null;

export type TradePanelProps = {
  subject: ConversationSubject;
  coverUrl: string | null;
  priceLabel: string;
  /** Vises bare i handelspanelet på desktop; på smal skjerm står den i toppen. */
  step?: TradeStep | null;
  other: { id: string; name: string; avatarUrl: string | null; deleted: boolean } | null;
  otherOrganization: { id: string; name: string; logoUrl: string | null } | null;
  sale: SaleActionsProps | null;
  conversationId: string;
  /** Blokker/rapporter; av når motparten har blokkert meg eller er slettet. */
  showBlockMenu: boolean;
};

/**
 * Innholdet i annonsearket (smal skjerm) og handelspanelet (desktop): annonsen,
 * motparten, salget og blokker/rapporter samlet bak samtaletoppen.
 */
export function TradePanel({
  subject,
  coverUrl,
  priceLabel,
  step,
  other,
  otherOrganization,
  sale,
  conversationId,
  showBlockMenu,
}: TradePanelProps) {
  const getProfileFn = useServerFn(getPublicProfile);
  const { data: profile } = useQuery({
    queryKey: ["public-profile", other?.id],
    enabled: !!other && !other.deleted && !otherOrganization,
    queryFn: () => getProfileFn({ data: { userId: other!.id } }),
  });

  const subjectCard = (
    <div className="flex items-center gap-3">
      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {coverUrl && <img src={coverUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium">
          {subject?.title ?? (
            <span className="italic text-muted-foreground">
              Annonsen er ikke lenger tilgjengelig
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{priceLabel}</p>
      </div>
      {subject && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );
  const subjectLinkClass = "block rounded-xl transition hover:opacity-80";

  return (
    <div className="space-y-5">
      {subject?.kind === "listing" ? (
        <Link
          to="/$kaupetCode"
          params={{ kaupetCode: subject.kaupetCode }}
          className={subjectLinkClass}
          aria-label={`Se annonsen ${subject.title}`}
        >
          {subjectCard}
        </Link>
      ) : subject?.kind === "wtb" ? (
        <Link
          to="/ok/$id"
          params={{ id: subject.id }}
          className={subjectLinkClass}
          aria-label={`Se kjøpsønsket ${subject.title}`}
        >
          {subjectCard}
        </Link>
      ) : (
        subjectCard
      )}

      {step !== undefined && <TradeSteps step={step} orientation="vertical" />}

      {sale && <SaleActions {...sale} />}

      <div className="border-t border-border pt-4">
        {otherOrganization ? (
          <Link
            to="/bedrift/$organizationId"
            params={{ organizationId: otherOrganization.id }}
            className={`${subjectLinkClass} flex items-center gap-3`}
          >
            {otherOrganization.logoUrl && (
              <img
                src={otherOrganization.logoUrl}
                alt=""
                className="size-10 rounded-full object-cover"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{otherOrganization.name}</span>
              <span className="block text-xs text-muted-foreground">
                Se bedriftsprofil og vurderinger
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ) : other && !other.deleted ? (
          <Link
            to="/bruker/$id"
            params={{ id: other.id }}
            className={`${subjectLinkClass} flex items-center gap-3`}
          >
            {other.avatarUrl ? (
              <img src={other.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                <UserIcon className="size-4 text-muted-foreground" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{other.name}</span>
              {profile && profile.review_count > 0 ? (
                <span
                  className="flex items-center gap-1"
                  aria-label={`${profile.avg_rating.toFixed(1)} av 5 stjerner, basert på ${profile.review_count} vurderinger`}
                >
                  <StarRating value={profile.avg_rating} readOnly size={12} />
                  <span className="text-xs text-muted-foreground">({profile.review_count})</span>
                </span>
              ) : (
                <span className="block text-xs text-muted-foreground">Se profil</span>
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            {other?.deleted ? "Slettet bruker" : "Ukjent bruker"}
          </p>
        )}
      </div>

      {showBlockMenu && other && (
        <section aria-label="Blokker og rapporter" className="border-t border-border pt-2">
          <BlockConversationMenu
            targetUserId={other.id}
            conversationId={conversationId}
            targetName={other.name}
          />
        </section>
      )}
    </div>
  );
}
