import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VisitorPhoto } from "@/components/visits/VisitorPhoto";
import { APP_NAME } from "@/constants/brand";
import { printVisitorPass } from "@/lib/print-visitor-pass";
import type { VisitRequest } from "@/services/visitor-requests";
import { QrImage } from "@/components/common/QrImage";
import { getVisitorCardPhoto, saveVisitorCardPhoto } from "@/services/visitor-card-local";
import { toast } from "sonner";
import { getVisitorPassLink, issueVisitorGuestPass } from "@/services/visits-api";

export function VisitorPassDialog({
  visit,
  onClose,
  onIssued,
}: {
  visit: VisitRequest | null;
  onClose: () => void;
  onIssued?: (visitId: string) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);
  const { data: passLink } = useQuery({
    queryKey: ["visitor-pass-link", visit?.id],
    queryFn: () => getVisitorPassLink(visit!.id),
    enabled: Boolean(visit && ["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(visit.status)),
    retry: false,
  });

  useEffect(() => {
    setPhoto(visit ? getVisitorCardPhoto(visit.id) : null);
    setIssued(visit?.status === "CARD_ISSUED");
    setIssuing(false);
  }, [visit]);

  const capturePhoto = (dataUrl: string) => {
    if (!visit) return;
    try {
      saveVisitorCardPhoto(visit.id, dataUrl);
      setPhoto(dataUrl);
      toast.success("Visitor photo saved on this browser");
    } catch {
      toast.error("Unable to save the photo in this browser. Free some storage and try again.");
    }
  };

  const issueGuestCard = async () => {
    if (!visit || visit.status !== "APPROVED" || issued) {
      toast.error("Only approved visits without an issued guest card can be issued.");
      return;
    }
    setIssuing(true);
    try {
      await issueVisitorGuestPass(visit.id);
      setIssued(true);
      onIssued?.(visit.id);
      toast.success("Guest card issued.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to issue the visitor guest card.",
      );
    } finally {
      setIssuing(false);
    }
  };

  const printGuestCard = async () => {
    if (!visit || !["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(visit.status)) {
      toast.error("Only approved visits can be issued as a printable guest card.");
      return;
    }
    setPrinting(true);
    try {
      await printVisitorPass();
      toast.success("Guest card printed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to print the visitor guest card.",
      );
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={!!visit} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Printable visitor guest card</DialogTitle>
        </DialogHeader>
        {visit ? (
          <div className="space-y-3">
            <div className="visitor-pass-print visitor-pass-print-area overflow-hidden rounded-2xl border border-border">
              <div className="badge-gradient px-5 py-4 text-primary-foreground">
                <p className="text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70">
                  {APP_NAME}
                </p>
                <p className="font-display text-[20px] font-extrabold">{visit.visitor_name}</p>
                <p className="text-[13px] text-primary-foreground/80">{visit.company}</p>
              </div>
              <div className="flex flex-col items-center gap-3 bg-card p-5">
                <VisitorPhoto name={visit.visitor_name} src={photo} onCapture={capturePhoto} />
                <p className="font-mono text-[22px] font-semibold tracking-widest">
                  {visit.visitor_code}
                </p>
                <dl className="grid w-full grid-cols-2 gap-2 text-[13px]">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Date</dt>
                    <dd className="font-medium">{visit.visit_date}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Time</dt>
                    <dd className="font-medium">
                      {visit.expected_arrival}–{visit.expected_departure}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Host</dt>
                    <dd className="font-medium">{visit.host_name || visit.requested_by_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Status</dt>
                    <dd className="font-medium">
                      {issued || visit.status === "CARD_ISSUED" ? "Card Issued" : visit.status}
                    </dd>
                  </div>
                </dl>
                {passLink?.portalUrl ? (
                  <QrImage
                    value={passLink.portalUrl}
                    label="Visitor pass and guest card QR"
                    size={128}
                  />
                ) : (
                  <p className="text-center text-[11px] text-muted-foreground">
                    The secure QR is unavailable. Resend the invitation to refresh this pass.
                  </p>
                )}
                <p className="text-center text-[11px] text-muted-foreground">
                  This printable pass and QR are the visitor guest card.
                </p>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground print:hidden">
              A separate inventory card is not required. The visitor can use this QR pass to check
              in and check out. Photo upload is optional and is saved only in this browser.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 print:hidden">
              {visit.status === "APPROVED" ? (
                <Button disabled={issuing || issued} onClick={() => void issueGuestCard()}>
                  {issuing ? "Issuing card…" : issued ? "Card issued" : "Issue card"}
                </Button>
              ) : visit.status === "CARD_ISSUED" ? (
                <Button disabled variant="outline">
                  Card issued
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={printing || !passLink?.portalUrl}
                onClick={() => void printGuestCard()}
              >
                <Printer className="size-4" />
                {printing ? "Preparing guest card…" : "Print guest card"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
