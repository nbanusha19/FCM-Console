import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { QrImage } from "@/components/common/QrImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_NAME, APP_TAGLINE } from "@/constants/brand";
import { formatDate, formatTime } from "@/lib/format";
import { getVisitorPassLink } from "@/services/visits-api";
import { resendVisitorInvitation, type VisitRequest } from "@/services/visitor-requests";

export function VisitorInvitationDialog({
  visit,
  open,
  onOpenChange,
}: {
  visit: VisitRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sending, setSending] = useState(false);
  const {
    data: passLink,
    isLoading: loadingPassLink,
    error: passLinkError,
  } = useQuery({
    queryKey: ["visitor-pass-link", visit?.id],
    queryFn: () => getVisitorPassLink(visit!.id),
    enabled:
      open && Boolean(visit && ["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(visit.status)),
    retry: false,
  });

  const resend = async () => {
    if (!visit) return;
    setSending(true);
    try {
      await resendVisitorInvitation(visit.id);
      toast.success(`Invitation email sent to ${visit.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the invitation.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send visitor invitation</DialogTitle>
        </DialogHeader>
        {visit ? (
          <div className="space-y-3">
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-[12px] text-muted-foreground">
                Resend the Visitor ID and secure check-in link to the visitor&apos;s email.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px]">
                  <span className="text-muted-foreground">Send to: </span>
                  <span className="font-medium">{visit.email}</span>
                  {visit.phone ? (
                    <span className="text-muted-foreground"> · {visit.phone}</span>
                  ) : null}
                </p>
                <Button type="button" disabled={sending} onClick={() => void resend()}>
                  <Mail className="size-4" /> {sending ? "Sending…" : "Resend invitation"}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="badge-gradient px-5 py-4 text-primary-foreground">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary-foreground/20 font-display text-[12px] font-extrabold">
                    V
                  </span>
                  <div className="leading-tight">
                    <p className="font-display text-[15px] font-extrabold">{APP_NAME}</p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-primary-foreground/70">
                      {APP_TAGLINE}
                    </p>
                  </div>
                </div>
                <p className="mt-3 font-display text-lg font-extrabold">
                  You&apos;re invited to visit us
                </p>
                <p className="text-[12px] text-primary-foreground/80">
                  {visit.location} · {formatDate(visit.visit_date)}
                </p>
              </div>

              <div className="space-y-3 bg-card px-5 py-4">
                <p className="text-[12px]">
                  Dear {visit.visitor_name}, your visit has been approved. Please carry a photo ID
                  and present the Visitor ID below at the security desk.
                </p>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted p-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Visitor ID
                    </p>
                    <p className="font-mono text-[16px] font-semibold">
                      {visit.visitor_code || visit.request_no}
                    </p>
                    {passLink?.portalUrl ? (
                      <p className="mt-1 break-all text-[10px] text-muted-foreground">
                        {passLink.portalUrl}
                      </p>
                    ) : loadingPassLink ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">Loading secure link…</p>
                    ) : passLinkError ? (
                      <p role="alert" className="mt-1 text-[10px] text-danger">
                        Unable to load the secure check-in link.
                      </p>
                    ) : null}
                  </div>
                  {passLink?.portalUrl ? <QrImage value={passLink.portalUrl} size={88} /> : null}
                </div>

                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <Row label="Visitor" value={visit.visitor_name} />
                  <Row label="Company / Branch" value={visit.company || visit.location} />
                  <Row label="Branch" value={visit.location} />
                  <Row label="Visit date" value={formatDate(visit.visit_date)} />
                  <Row label="Expected arrival" value={formatTime(visit.expected_arrival)} />
                  <Row label="Expected departure" value={formatTime(visit.expected_departure)} />
                  <Row label="Host employee" value={visit.host_name} />
                  <Row label="Purpose" value={visit.purpose} />
                </dl>

                <div className="rounded-xl border border-border p-3">
                  <p className="text-[11px] font-semibold">Instructions for security</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                    <li>Verify the Visitor ID against the approved visit record before entry.</li>
                    <li>The visitor checks in from the secure email link.</li>
                    <li>Collect the visitor card at check-out and record the exit time.</li>
                  </ul>
                </div>
                <p className="text-[10px] text-muted-foreground">
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

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value?.trim() || "—"}</dd>
    </div>
  );
}
