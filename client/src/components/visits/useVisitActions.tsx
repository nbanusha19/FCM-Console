import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Visit } from "@/lib/types";
import { useApp } from "@/context/app-context";
import { approveVisitRequest, cancelVisitRequest, listVisits, rejectVisitRequest } from "@/services/visits-api";
import { ApiError } from "@/lib/api";
import { RejectDialog } from "@/components/visits/RejectDialog";
import { EmailPreviewDialog } from "@/components/visits/EmailPreviewDialog";
import { PrintCardDialog } from "@/components/visits/PrintCardDialog";
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

/** Shared approve / reject / cancel / print / email-preview behaviour with all dialogs. */
export function useVisitActions() {
  const { user, refresh } = useApp();
  const [rejecting, setRejecting] = useState<Visit | null>(null);
  const [cancelling, setCancelling] = useState<Visit | null>(null);
  const [emailing, setEmailing] = useState<Visit | null>(null);
  const [printing, setPrinting] = useState<Visit | null>(null);

  const onApprove = async (visit: Visit) => {
    if (!user) return;
    try {
      const result = await approveVisitRequest(visit.id);
      refresh();
      setEmailing(result);
      toast.success(
        result.emailSentAt
          ? `Request approved and invitation emailed to ${result.email}`
          : "Request approved",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 502 && err.message.includes("Visit approved")) {
        try {
          const approvedVisit = (await listVisits()).find((item) => item.id === visit.id);
          if (approvedVisit) setEmailing(approvedVisit);
          refresh();
          toast.error(
            approvedVisit
              ? "The request was approved, but its email failed. Retry from the invitation screen."
              : "The request was approved, but its email failed. Refresh the visitor list and resend the invitation.",
          );
          return;
        } catch {
          toast.error("The request was approved, but its email failed. Refresh the visitor list and resend the invitation.");
          refresh();
          return;
        }
      }
      toast.error(err instanceof ApiError ? err.message : "Could not approve this request.");
    }
  };

  const dialogs: ReactNode = (
    <>
      <RejectDialog
        open={!!rejecting}
        visitorName={rejecting?.name}
        onOpenChange={(open) => !open && setRejecting(null)}
        onConfirm={(reason) => {
          if (!user || !rejecting) return;
          void rejectVisitRequest(rejecting.id, reason)
            .then(() => {
              setRejecting(null);
              refresh();
              toast.success("Request rejected");
            })
            .catch((err) => {
              toast.error(err instanceof ApiError ? err.message : "Could not reject this request.");
            });
        }}
      />
      <EmailPreviewDialog visit={emailing} open={!!emailing} onOpenChange={(o) => !o && setEmailing(null)} />
      <PrintCardDialog visit={printing} open={!!printing} onOpenChange={(o) => !o && setPrinting(null)} />
      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this visit?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling?.name}'s visit on {cancelling?.visitDate} will be cancelled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep visit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!user || !cancelling) return;
                void cancelVisitRequest(cancelling.id)
                  .then(() => {
                    setCancelling(null);
                    refresh();
                    toast.success("Visit cancelled");
                  })
                  .catch((err) => {
                    toast.error(err instanceof ApiError ? err.message : "Could not cancel this visit.");
                  });
              }}
            >
              Cancel visit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // Only branch managers and admins may approve or reject requests.
  const canDecide = user?.role === "ADMIN" || user?.role === "BRANCH_MANAGER";
  const canCancel = user?.role !== "SECURITY";

  return {
    onApprove: canDecide ? onApprove : undefined,
    onReject: canDecide ? setRejecting : undefined,
    onCancel: canCancel ? setCancelling : undefined,
    onEmail: setEmailing,
    onPrint: setPrinting,
    dialogs,
  };
}
