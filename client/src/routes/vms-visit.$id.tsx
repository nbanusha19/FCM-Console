import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer, Send } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { QrImage } from "@/components/common/QrImage";
import { VisitorPhoto } from "@/components/visits/VisitorPhoto";
import { VisitorPassDialog } from "@/components/visits/VisitorPassDialog";
import { useApp } from "@/context/app-context";
import { fmtTime, getVisit, canIssueVisitorCard, canOpenVisitorCardDialog, listGuestCards, listVisitEvents, listVisitorTypes, visitDuration, type VisitRequest } from "@/services/visitor-requests";
import { getVisitorPassLink, resendVisitInvite } from "@/services/visits-api";
import { getVisitorCardPhoto, saveVisitorCardPhoto } from "@/services/visitor-card-local";
import { printVisitorPass } from "@/lib/print-visitor-pass";

export const Route = createFileRoute("/vms-visit/$id")({
  head: () => ({
    meta: [
      { title: "Visit details — FCM Console" },
      { name: "description", content: "Visitor, visit, host, guest card and QR details for one visit." },
      { property: "og:title", content: "Visit details — FCM Console" },
      { property: "og:description", content: "Full details and activity for a visitor request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"]}>
      <VisitDetails />
    </AppPage>
  ),
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface-card p-5">
      <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-[13px]">{children}</dl>
    </section>
  );
}
const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="font-medium">{v || "—"}</dd>
  </>
);

function VisitDetails() {
  const { id } = Route.useParams();
  const { user } = useApp();
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [issuingVisit, setIssuingVisit] = useState<VisitRequest | null>(null);
  const { data: v, isLoading } = useQuery({ queryKey: ["visit", id], queryFn: () => getVisit(id) });
  const { data: cards = [] } = useQuery({ queryKey: ["guest-cards"], queryFn: listGuestCards });
  const { data: types = [] } = useQuery({ queryKey: ["visitor-types"], queryFn: listVisitorTypes });
  const { data: events = [] } = useQuery({ queryKey: ["visit-events", id], queryFn: () => listVisitEvents(id) });
  const { data: passLink, refetch: reloadPassLink } = useQuery({
    queryKey: ["visitor-pass-link", id],
    queryFn: () => getVisitorPassLink(id),
    enabled: Boolean(id),
    retry: false,
  });
  useEffect(() => setPhoto(getVisitorCardPhoto(id)), [id]);
  if (isLoading) return <p className="py-10 text-center text-muted-foreground">Loading visit…</p>;
  if (!v) return <p className="py-10 text-center text-muted-foreground">Visit not found, or you don't have access to it.</p>;
  const card = cards.find((c) => c.id === v.guest_card_id);
  const checkInQrUrl = passLink?.portalUrl ?? null;
  const capturePhoto = (dataUrl: string) => {
    try {
      saveVisitorCardPhoto(id, dataUrl);
      setPhoto(dataUrl);
      toast.success("Visitor photo saved on this browser");
    } catch {
      toast.error("Unable to save the photo in this browser. Free some storage and try again.");
    }
  };
  const resendInvitation = async () => {
    setSendingInvite(true);
    try {
      await resendVisitInvite(id);
      await reloadPassLink();
      await queryClient.invalidateQueries({ queryKey: ["visit", id] });
      toast.success(`Invitation and check-in QR sent to ${v.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send the visitor invitation.");
    } finally {
      setSendingInvite(false);
    }
  };
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Visitor Management · ${v.request_no}`}
        title={v.visitor_name}
        subtitle={`${v.company} · ${v.visit_date}`}
        actions={<Button variant="outline" asChild><Link to="/visitors"><ArrowLeft className="size-4" /> Back</Link></Button>}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <div className="space-y-4">
          <Section title="Visitor information">
            <Row k="Visitor ID" v={<span className="font-mono">{v.visitor_code}</span>} />
            <Row k="Visitor type" v={types.find((t) => t.code === v.visitor_type)?.label ?? v.visitor_type} />
            <Row k="Company / branch" v={v.company} />
            <Row k="Email" v={v.email} />
            <Row k="Phone" v={v.phone} />
            <Row k="Designation" v={v.designation} />
          </Section>
          <Section title="Visit information">
            <Row k="Request ID" v={v.request_no} />
            <Row k="Visit ID" v={<span className="font-mono text-[11px]">{v.id}</span>} />
            <Row k="Status" v={<StatusPill status={v.status} />} />
            <Row k="Visit date" v={v.visit_date} />
            <Row k="Expected window" v={`${v.expected_arrival} – ${v.expected_departure}`} />
            <Row k="Location" v={v.location} />
            <Row k="Purpose" v={v.purpose} />
            <Row k="Check-in" v={v.checked_in_at ? `${fmtTime(v.checked_in_at)}${v.arrival_gate ? ` · ${v.arrival_gate}` : ""}` : ""} />
            <Row k="Check-out" v={v.checked_out_at ? fmtTime(v.checked_out_at) : ""} />
            <Row k="Duration" v={visitDuration(v)} />
            <Row k="Created" v={new Date(v.created_at).toLocaleString()} />
            {v.remarks ? <Row k="Remarks" v={v.remarks} /> : null}
          </Section>
          <Section title="Host information">
            <Row k="Host" v={v.host_name} />
            <Row k="Department" v={v.host_department} />
            <Row k="Raised by" v={v.requested_by_name} />
            <Row k="Reviewed by" v={v.reviewed_by_name} />
          </Section>
          <Section title="Guest card & invitation">
            <Row k="Issued card" v={card?.code} />
            <Row k="Card status" v={card ? <StatusPill status={card.status} /> : ""} />
            <Row
              k="Invitation email"
              v={v.invitation_sent_at
                ? `Sent to ${v.email} · ${new Date(v.invitation_sent_at).toLocaleString()}`
                : v.status === "APPROVED"
                  ? "Pending — resend from the visitor register"
                  : "Sent automatically after approval"}
            />
          </Section>
        </div>
        <section className="visitor-pass-print-area visitor-pass-print overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-br from-blue-600 to-indigo-700 p-4 text-white shadow-lg">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
            <span>VMS visitor</span>
            <span className="font-mono tracking-normal">{v.visitor_code}</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <VisitorPhoto
              name={v.visitor_name}
              src={photo}
              onCapture={capturePhoto}
              size="sm"
              tone="badge"
            />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{v.visitor_name}</p>
              <p className="truncate text-xs text-white/75">{v.company || v.designation}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-2 text-xs">
            <BadgeRow label="Host" value={v.host_name} />
            <BadgeRow label="Branch" value={v.location} />
            <BadgeRow label="Visit date" value={v.visit_date} />
            <BadgeRow label="Check-in" value={v.checked_in_at ? fmtTime(v.checked_in_at) : "Not checked in"} />
            <BadgeRow label="Valid until" value={v.expected_departure} />
          </dl>
          <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-4">
            <div>
              <p className="font-mono text-xs">{card?.code ?? (v.status === "CARD_ISSUED" ? v.visitor_code : "Card not issued")}</p>
              <p className="mt-1 text-[10px] text-white/70">{card ? card.status.replaceAll("_", " ") : "Guest card"}</p>
            </div>
            {checkInQrUrl ? (
              <QrImage value={checkInQrUrl} label="Check-in QR" size={88} />
            ) : (
              <span className="max-w-24 text-right text-[10px] text-white/75">
                {["APPROVED", "CARD_ISSUED"].includes(v.status) ? "Check-in QR needs refresh" : "QR available after approval"}
              </span>
            )}
          </div>
          {["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(v.status) && !checkInQrUrl ? (
            <Button
              className="mt-3 w-full border-white/30 bg-white/15 text-white hover:bg-white/25 print:hidden"
              disabled={sendingInvite}
              onClick={() => void resendInvitation()}
            >
              <Send className="size-4" /> {sendingInvite ? "Sending invitation…" : "Resend invitation and QR"}
            </Button>
          ) : null}
          {checkInQrUrl ? (
            <Button
              className="mt-3 w-full border-white/30 bg-white/15 text-white hover:bg-white/25 print:hidden"
              onClick={() =>
                void printVisitorPass().catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Unable to print the visitor pass."),
                )
              }
            >
              <Printer className="size-4" /> Print visitor pass
            </Button>
          ) : null}
          {canOpenVisitorCardDialog(user, v) ? (
            <Button
              className="mt-3 w-full border-white/30 bg-white/15 text-white hover:bg-white/25 print:hidden"
              onClick={() => setIssuingVisit(v)}
            >
              Issue physical visitor card
            </Button>
          ) : null}
        </section>
      </div>
      <section className="surface-card p-5">
        <h2 className="mb-3 text-[14px] font-semibold">Activity</h2>
        {events.length === 0 ? <p className="text-[13px] text-muted-foreground">No activity recorded yet.</p> : (
          <ol className="space-y-2 text-[13px]">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-40 shrink-0 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                <span><StatusPill status={e.event} /> {e.note} {e.actor_name ? <span className="text-muted-foreground">· {e.actor_name}</span> : null}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <VisitorPassDialog
        visit={issuingVisit}
        onClose={() => setIssuingVisit(null)}
        onIssued={() => {
          void queryClient.invalidateQueries({ queryKey: ["visit", id] });
          void queryClient.invalidateQueries({ queryKey: ["visit-events", id] });
          void queryClient.invalidateQueries({ queryKey: ["guest-cards"] });
        }}
      />
    </div>
  );
}

function BadgeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/65">{label}</dt>
      <dd className="text-right font-semibold">{value || "—"}</dd>
    </div>
  );
}
