// kaupet_open-utgave. Uten bekreftet salg til en kjøper merker selgeren bare
// annonsen som solgt.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { formatErrorMessage } from "@/lib/errors";
import { updateListingStatus } from "@/lib/listings.functions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
};

export function MarkSoldDialog({ open, onOpenChange, listingId }: Props) {
  const queryClient = useQueryClient();
  const updateStatusFn = useServerFn(updateListingStatus);
  const markSold = useMutation({
    mutationFn: () => updateStatusFn({ data: { id: listingId, status: "sold" } }),
    onSuccess: () => {
      showSuccessToast("Annonsen er merket som solgt");
      queryClient.invalidateQueries({ queryKey: ["listing"] });
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      onOpenChange(false);
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere status")),
  });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !markSold.isPending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Er du sikker på at du vil sette annonsen som solgt?</AlertDialogTitle>
          <AlertDialogDescription>
            Annonsen vises som solgt og kan ikke lenger kjøpes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={markSold.isPending}>Avbryt</AlertDialogCancel>
          <Button disabled={markSold.isPending} onClick={() => markSold.mutate()}>
            {markSold.isPending && <Loader2 className="size-4 animate-spin" />}
            Merk som solgt
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
