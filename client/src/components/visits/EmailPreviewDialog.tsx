import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Visit } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrImage } from "@/components/common/QrImage";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/constants/brand";
import { useApp } from "@/context/app-context";
import { formatDate, formatTime } from "@/lib/format";
import { branchName, employeeName, visitorOrigin } from "@/services/vms";
import { resendVisitInvite } from "@/services/visits-api";
import { ApiError } from "@/lib/api";

export function EmailPreviewDialog({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, refresh } = useApp();
  const [portalUrl, setPortalUrl] = useState<string | null>(visit?.portalUrl ?? null);

  useEffect(() => {
    setPortalUrl(visit?.portalUrl ?? null);
  }, [visit?.id, visit?.portalUrl]);

  const send = async () => {
    if (!user || !visit) return;
    try {
      const updated = await resendVisitInvite(visit.id);
      setPortalUrl(updated?.portalUrl ?? null);
      refresh();
      toast.success(`Invitation email sent to ${visit.email}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the invitation.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {visit?.emailSentAt
              ? "Visitor invitation sent"
              : visit?.status === "APPROVED"
                ? "Visitor invitation needs retry"
                : "Visitor invitation"}
          </DialogTitle>
        </DialogHeader>
        {visit ? (
          <div className="space-y-3">
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-[12px] text-muted-foreground">
                {visit.emailSentAt
                  ? `The Visitor ID and secure check-in QR were emailed to ${visit.email}.`
                  : visit.status === "APPROVED"
                    ? `The request is approved, but the email was not sent. Retry delivery to ${visit.email}.`
                    : "Send the Visitor ID and secure check-in QR to the visitor's email."}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px]">
                  <span className="text-muted-foreground">Send to: </span>
                  <span className="font-medium">{visit.email}</span>
                  {visit.phone ? <span className="text-muted-foreground"> · {visit.phone}</span> : null}
                </p>
                <Button type="button" onClick={() => void send()}>
                  <Mail className="size-4" /> Resend invitation
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="badge-gradient px-6 py-5 text-primary-foreground">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary-foreground/20 font-display text-[12px] font-extrabold">
                    V
                  </span>
                  <div className="leading-tight">
                    <p className="font-display text-[15px] font-extrabold">{APP_NAME}</p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-primary-foreground/70">{APP_TAGLINE}</p>
                  </div>
                </div>
                <p className="mt-4 font-display text-[20px] font-extrabold">You're invited to visit us</p>
                <p className="text-[13px] text-primary-foreground/80">
                  {branchName(visit.branchId)} · {formatDate(visit.visitDate)}
                </p>
              </div>

              <div className="space-y-4 bg-card px-6 py-5">
                <p className="text-[13px]">
                  Dear {visit.name}, your visit has been approved. Please carry a photo ID and present the Visitor ID
                  below at the security desk.
                </p>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Visitor ID
                    </p>
                    <p className="font-mono text-[18px] font-semibold">{visit.visitorId ?? "Pending approval"}</p>
                    {portalUrl ? (
                      <p className="mt-1 break-all text-[11px] text-muted-foreground">{portalUrl}</p>
                    ) : null}
                  </div>
                  {portalUrl ? <QrImage value={portalUrl} size={96} /> : null}
                </div>

                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <Row label="Visitor" value={visit.name} />
                  <Row label="Company / Branch" value={visitorOrigin(visit)} />
                  <Row label="Branch" value={branchName(visit.branchId)} />
                  <Row label="Visit date" value={formatDate(visit.visitDate)} />
                  <Row label="Expected arrival" value={formatTime(visit.expectedArrival)} />
                  <Row label="Expected departure" value={formatTime(visit.expectedDeparture)} />
                  <Row label="Host employee" value={employeeName(visit.hostEmployeeId)} />
                  <Row label="Purpose" value={visit.purpose} />
                </dl>

                <div className="rounded-xl border border-border p-4">
                  <p className="text-[12px] font-semibold">Instructions for security</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
                    <li>Verify the Visitor ID against the approved visit record before entry.</li>
                    <li>The visitor checks in from the email pass; issue a card after check-in.</li>
                    <li>Collect and record the returned card. The visitor checks out from the same email pass.</li>
                  </ul>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  This is an automated message from {APP_NAME}. Please do not reply.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
