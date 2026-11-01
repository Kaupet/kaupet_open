import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

export type SaleActionsProps = {
  /** Samtalen har minst én melding — før det er det ingen å selge til. */
  hasMessages: boolean;
  isSeller: boolean;
  sale: { listing_id: string; buyer_id: string; seller_id: string; conversation_id: string } | null;
  saleConfirmedForOtherBuyer: boolean;
  otherName: string;
  otherDeleted: boolean;
  /** Selgeren har vurdert kjøperen; da kan salget ikke angres. */
  hasReviewed: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
  confirming: boolean;
  unconfirming: boolean;
};

/**
 * Salgsstatus og -handlinger i annonsearket/handelspanelet. Vurderingen etter
 * salget vises i tråden, ikke her.
 */
export function SaleActions(props: SaleActionsProps) {
  const {
    isSeller,
    hasMessages,
    sale,
    saleConfirmedForOtherBuyer,
    otherName,
    otherDeleted,
    hasReviewed,
    onConfirm,
    onUnconfirm,
    confirming,
    unconfirming,
  } = props;

  if (otherDeleted) return null;

  if (!sale) {
    if (!isSeller || !hasMessages) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Marker som solgt for å låse annonsen og åpne for vurdering av kjøperen.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full gap-2" disabled={confirming}>
              {confirming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Bekreft {otherName} som kjøper
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bekreft kjøper</AlertDialogTitle>
              <AlertDialogDescription>
                {`Marker ${otherName} som kjøper av denne annonsen? Annonsen settes til «solgt» og kan ikke vises som aktiv igjen før salget eventuelt angres.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>Bekreft</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (saleConfirmedForOtherBuyer) {
    return (
      <p className="text-sm text-muted-foreground">
        Denne annonsen er allerede markert som solgt til en annen kjøper.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="size-4 text-primary" />
        {isSeller ? `Solgt til ${otherName}` : "Du er bekreftet som kjøper"}
      </p>
      {isSeller && !hasReviewed && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onUnconfirm}
          disabled={unconfirming}
          className="text-xs"
        >
          {unconfirming && <Loader2 className="size-3 animate-spin" />}
          Angre salg
        </Button>
      )}
    </div>
  );
}
