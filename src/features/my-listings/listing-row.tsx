import { EDITION } from "@/lib/edition";
import { Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Eye,
  Heart,
  Clock,
  Check,
  Send,
  MoreVertical,
  Info,
  Camera as CameraIcon,
} from "lucide-react";

import { canAddSpin360Capture, spin360OwnerVariant } from "@/lib/spin-capture";
import { signListingImageUrls } from "@/lib/storage";
import { useIsNative } from "@/hooks/use-is-native";
import { useFormFactor } from "@/hooks/use-form-factor";
import { useNativePromotionAllowed } from "@/hooks/use-native-promotion-allowed";
import { hapticImpact } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { verticals } from "@/lib/verticals";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { displayPriceNok, formatPrice } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/constants";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { Skeleton } from "@/components/ui/skeleton";

export type Row = {
  id: string;
  seller_id?: string;
  kaupet_code: string;
  title: string;
  status: keyof typeof STATUS_LABEL;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  category_id: string | null;
  category_slug: string | null;
  attributes: Record<string, unknown> | null;
  description: string | null;
  view_count: number;
  favorite_count: number;
  created_at: string;
  expires_at: string | null;
  cover_path: string | null;
};

function RowImage({ imgUrl, hasCoverPath }: { imgUrl: string | null; hasCoverPath: boolean }) {
  if (imgUrl) {
    return <img src={imgUrl} alt="" className="size-full object-cover" />;
  }
  if (hasCoverPath) {
    return <Skeleton className="size-full rounded-none" />;
  }
  return (
    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
      Ingen bilde
    </div>
  );
}

function daysLeft(expires_at: string | null): number | null {
  if (!expires_at) return null;
  const ms = new Date(expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

type RowActions = {
  onPromote: () => void;
  onMarkSold: () => void;
  onReactivate: () => void;
  onRepublish: () => void;
  onPublishDraft: () => void;
  onDelete: () => void;
};

type ListingRowProps = {
  row: Row;
  /** CategoryBehavior.spin360 for the listing's category — gates the
   * native-only "Legg til 360°-opptak"-valget i overflow-menyen (kun
   * utkast/aktive rader). `editOnly`-rader (bedriftens annonseliste) har ingen
   * overflow-meny og får i stedet en egen 360°-knapp: kamera-opptak i appen,
   * QR-kode i desktop-nettleser. Serveren krever endringsrett på annonsen. */
  spin360: boolean;
  activePromotion: { expires_at: string | null; is_gift: boolean } | null;
  busy: boolean;
  /** Render only the listing link in console surfaces. */
  readOnly?: boolean;
} & (
  | ({ editOnly?: false } & RowActions)
  | ({
      /** Bare «Rediger»: status og sletting håndteres i annonsens redigeringsvisning. */
      editOnly: true;
    } & { [K in keyof RowActions]?: never })
);

export function ListingRow({
  row,
  spin360,
  activePromotion,
  onPromote,
  onMarkSold,
  onReactivate,
  onRepublish,
  onPublishDraft,
  onDelete,
  busy,
  readOnly = false,
  editOnly = false,
}: ListingRowProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [spin360Open, setSpin360Open] = useState(false);
  const native = useIsNative();
  const promotionAllowed = useNativePromotionAllowed();
  const Spin360CaptureLauncher = verticals.Spin360CaptureLauncher;
  const Spin360QrPanel = verticals.Spin360QrPanel;
  const [spin360QrOpen, setSpin360QrOpen] = useState(false);
  const formFactor = useFormFactor();
  const editOnlySpin360 =
    !readOnly && editOnly
      ? spin360OwnerVariant({
          spin360,
          status: row.status,
          listingId: row.id,
          isNative: native,
          isDesktop: formFactor === "desktop",
        })
      : null;

  const imgUrl = row.cover_path ? signListingImageUrls([row.cover_path])[row.cover_path] : null;

  // Same total the ad, search cards and message list show — not the
  // seller's bare price_nok (F4).
  const priceLabel = formatPrice({
    price_nok: displayPriceNok({
      category_slug: row.category_slug,
      price_nok: row.price_nok,
      attributes: row.attributes,
    }),
    is_free: row.is_free,
  });

  const d = daysLeft(row.expires_at);
  const expiryTone =
    d != null && d <= 2
      ? "border-destructive/40 text-destructive"
      : d != null && d <= 7
        ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
        : "border-border text-muted-foreground";

  const statusBadges = (
    <>
      {row.status === "disabled" ? (
        <>
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 h-auto max-w-full gap-2 whitespace-normal px-2 text-left text-sm text-destructive"
            aria-label={`Deaktivert av moderator: ${row.title}. Mer informasjon`}
            onClick={() => setModerationOpen(true)}
          >
            {STATUS_LABEL.disabled}
            <Info className="size-4 shrink-0" aria-hidden="true" />
          </Button>
          <ResponsiveOverlay open={moderationOpen} onOpenChange={setModerationOpen}>
            <ResponsiveOverlayContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Deaktivert av moderator</DialogTitle>
                <DialogDescription>
                  Annonsen «{row.title}» er deaktivert av en moderator og er ikke synlig for andre
                  brukere.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Du kan ikke redigere, reaktivere eller slette annonsen selv mens den er
                  deaktivert.
                </p>
                {EDITION === "open" ? (
                  <p>En moderator eller administrator må aktivere annonsen igjen.</p>
                ) : (
                  <>
                    <p>
                      Les begrunnelsen i samtalen om annonsen under Meldinger. Svar i samtalen for å
                      avklare hva som må endres, få hjelp til retting eller be om en ny vurdering.
                      En moderator eller administrator må aktivere annonsen igjen.
                    </p>
                    <p>
                      Finner du ingen melding? Se Varsler, eller ta kontakt via Hjelp og kontakt.
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {EDITION !== "open" && (
                  <Button asChild>
                    <Link to="/meldinger" onClick={() => setModerationOpen(false)}>
                      Åpne meldinger
                    </Link>
                  </Button>
                )}
              </div>
            </ResponsiveOverlayContent>
          </ResponsiveOverlay>
        </>
      ) : (
        <Badge variant={row.status === "active" ? "default" : "secondary"} className="text-xs">
          {/* En bortgitt gjenstand er ikke "solgt" — samme status, annen sannhet. */}
          {row.status === "sold" && row.is_free ? "Gitt bort" : STATUS_LABEL[row.status]}
        </Badge>
      )}
      {row.status === "active" && d != null && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${expiryTone}`}
        >
          <Clock className="size-3" />
          {d === 0 ? "Utløper i dag" : `${d} ${d === 1 ? "dag" : "dager"} igjen`}
        </span>
      )}
      {row.status === "expired" && (
        <span className="text-xs text-muted-foreground">Publiser på nytt for 30 nye dager</span>
      )}
      {activePromotion && (
        <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs text-brand-text">
          {activePromotion.is_gift ? "Gratis fremhevet" : "Fremhevet"} til{" "}
          {activePromotion.expires_at
            ? new Date(activePromotion.expires_at).toLocaleDateString("nb-NO", {
                day: "2-digit",
                month: "short",
              })
            : ""}
        </span>
      )}
    </>
  );

  const deleteDialog = (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slette annonsen?</AlertDialogTitle>
          <AlertDialogDescription>
            Dette kan ikke angres. Annonsen «{row.title}» blir fjernet permanent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Slett
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (native) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <div
          className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted"
          style={{ width: "5rem", height: "5rem" }}
        >
          <RowImage imgUrl={imgUrl} hasCoverPath={!!row.cover_path} />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to="/$kaupetCode"
            params={{ kaupetCode: row.kaupet_code }}
            className="line-clamp-2 text-sm font-medium leading-snug"
          >
            {row.title}
          </Link>
          <p className="mt-0.5 font-display text-sm">{priceLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">{statusBadges}</div>
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {row.city && <span>{row.city}</span>}
            {!readOnly && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3" /> {row.view_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="size-3" /> {row.favorite_count}
                </span>
              </>
            )}
          </p>
        </div>
        {!readOnly && editOnly && row.status !== "disabled" && (
          <Button size="icon" variant="ghost" className="shrink-0" asChild>
            <Link
              to="/$kaupetCode"
              params={{ kaupetCode: row.kaupet_code }}
              search={{ edit: true }}
              aria-label="Rediger"
            >
              <Pencil className="size-5" />
            </Link>
          </Button>
        )}
        {editOnlySpin360 === "native-capture" && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0"
            aria-label="Legg til 360°-opptak"
            onClick={() => setSpin360Open(true)}
          >
            <CameraIcon className="size-5" />
          </Button>
        )}
        {!readOnly && !editOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0"
                disabled={busy}
                onClick={() => void hapticImpact("light")}
                aria-label="Flere valg"
              >
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {row.status !== "disabled" && (
                <DropdownMenuItem asChild>
                  <Link
                    to="/$kaupetCode"
                    params={{ kaupetCode: row.kaupet_code }}
                    search={{ edit: true }}
                    className="flex items-center gap-2"
                  >
                    <Pencil className="size-4" /> Rediger
                  </Link>
                </DropdownMenuItem>
              )}
              {Spin360CaptureLauncher && spin360 && canAddSpin360Capture(row.status) && (
                <DropdownMenuItem
                  onClick={() => {
                    void hapticImpact("light");
                    setSpin360Open(true);
                  }}
                >
                  <CameraIcon className="size-4" /> Legg til 360°-opptak
                </DropdownMenuItem>
              )}
              {row.status === "active" && (
                <>
                  {!activePromotion && promotionAllowed && (
                    <DropdownMenuItem onClick={onPromote}>Fremhev annonse</DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      void hapticImpact("medium");
                      onMarkSold?.();
                    }}
                  >
                    <CheckCircle2 className="size-4" /> Marker som solgt
                  </DropdownMenuItem>
                </>
              )}
              {row.status === "expired" && (
                <DropdownMenuItem onClick={onRepublish}>
                  <RotateCcw className="size-4" /> Publiser på nytt
                </DropdownMenuItem>
              )}
              {row.status === "draft" && (
                <DropdownMenuItem onClick={onPublishDraft}>
                  <Send className="size-4" /> Publiser
                </DropdownMenuItem>
              )}
              {(row.status === "sold" || row.status === "archived") && (
                <DropdownMenuItem onClick={onReactivate}>
                  <RotateCcw className="size-4" /> Reaktiver
                </DropdownMenuItem>
              )}
              {row.status !== "disabled" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      void hapticImpact("medium");
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="size-4" /> Slett annonse
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!readOnly && !editOnly && deleteDialog}
        {spin360Open && Spin360CaptureLauncher && (
          <Suspense fallback={null}>
            <Spin360CaptureLauncher
              listingId={row.id}
              listingTitle={row.title}
              label="Legg til 360°-opptak"
              autoStart
              onDone={() => setSpin360Open(false)}
            />
          </Suspense>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <div
        className="size-24 shrink-0 overflow-hidden rounded-lg bg-muted"
        style={{ width: "6rem", height: "6rem" }}
      >
        <RowImage imgUrl={imgUrl} hasCoverPath={!!row.cover_path} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/$kaupetCode"
            params={{ kaupetCode: row.kaupet_code }}
            className="truncate text-base font-medium hover:underline"
          >
            {row.title}
          </Link>
          {statusBadges}
        </div>
        <p className="mt-1 font-display text-sm">{priceLabel}</p>
        <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {row.city && <span>{row.city}</span>}
          {!readOnly && (
            <>
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3" /> {row.view_count}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3" /> {row.favorite_count}
              </span>
            </>
          )}
        </p>
      </div>
      {readOnly ? (
        <Link to="/$kaupetCode" params={{ kaupetCode: row.kaupet_code }}>
          <Button size="sm" variant="outline">
            Åpne annonse
          </Button>
        </Link>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {row.status !== "disabled" && (
            <Link
              to="/$kaupetCode"
              params={{ kaupetCode: row.kaupet_code }}
              search={{ edit: true }}
            >
              <Button size="sm" variant="outline" disabled={busy}>
                <Pencil className="size-4" /> Rediger
              </Button>
            </Link>
          )}
          {editOnlySpin360 === "qr" && (
            <Button size="sm" variant="outline" onClick={() => setSpin360QrOpen(true)}>
              <CameraIcon className="size-4" /> Legg til 360°-opptak
            </Button>
          )}
          {editOnly ? null : row.status === "active" ? (
            <>
              {activePromotion ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                >
                  <Check className="size-4" /> Annonse fremhevet
                </Button>
              ) : (
                promotionAllowed && (
                  <Button size="sm" variant="outline" onClick={onPromote} disabled={busy}>
                    Fremhev annonse
                  </Button>
                )
              )}
              <Button size="sm" variant="outline" onClick={onMarkSold} disabled={busy}>
                <CheckCircle2 className="size-4" /> Marker som solgt
              </Button>
            </>
          ) : row.status === "expired" ? (
            <Button size="sm" variant="outline" onClick={onRepublish} disabled={busy}>
              <RotateCcw className="size-4" /> Publiser på nytt
            </Button>
          ) : row.status === "draft" ? (
            <Button size="sm" variant="outline" onClick={onPublishDraft} disabled={busy}>
              <Send className="size-4" /> Publiser
            </Button>
          ) : row.status === "sold" || row.status === "archived" ? (
            <Button size="sm" variant="outline" onClick={onReactivate} disabled={busy}>
              <RotateCcw className="size-4" /> Reaktiver
            </Button>
          ) : null}
          {!editOnly && row.status !== "disabled" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  aria-label="Slett"
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Slette annonsen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dette kan ikke angres. Annonsen «{row.title}» blir fjernet permanent.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Slett
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
      {Spin360QrPanel && (
        <ResponsiveOverlay open={spin360QrOpen} onOpenChange={setSpin360QrOpen}>
          <ResponsiveOverlayContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Legg til 360°-opptak</DialogTitle>
              <DialogDescription>
                Skann QR-koden med mobilen for å ta opptaket av {row.title}.
              </DialogDescription>
            </DialogHeader>
            <Suspense fallback={null}>
              <Spin360QrPanel listingId={row.id} />
            </Suspense>
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      )}
    </li>
  );
}
