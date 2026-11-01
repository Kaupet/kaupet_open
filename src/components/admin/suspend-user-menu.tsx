// kaupet_open: grunnmoderering uten privat suspensjonsflyt.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { useIsAdmin } from "@/hooks/use-user-roles";
import { adminBanUser } from "@/lib/admin-moderation.functions";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export function AdminUserActions({ userId, displayName }: { userId: string; displayName: string }) {
  const { data: isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const banFn = useServerFn(adminBanUser);
  const ban = useMutation({
    mutationFn: () => banFn({ data: { userId, reason: reason.trim() } }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      void qc.invalidateQueries();
      showSuccessToast(`${displayName} er utestengt`);
    },
    onError: (error: Error) =>
      showErrorToast(formatErrorMessage(error, "Kunne ikke utestenge brukeren")),
  });
  if (!isAdmin) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Utesteng bruker
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Utesteng {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Brukeren mister tilgang til å opprette annonser og sende meldinger. Aktive annonser
              deaktiveres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label htmlFor="ban-reason">Begrunnelse</Label>
          <Textarea
            id="ban-reason"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ban.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim() || ban.isPending}
              onClick={(event) => {
                event.preventDefault();
                ban.mutate();
              }}
            >
              Utesteng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
