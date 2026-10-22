import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/context/app-context";
import { ApiError } from "@/lib/api";
import { VisitorInvitationDialog } from "@/components/visits/VisitorInvitationDialog";
import { approveVisitRequest, canDecide, listVisitorTypes, listVisitRequests, rejectVisitRequest, type VisitRequest } from "@/services/visitor-requests";

export const Route = createFileRoute("/vms-approvals")({
  head: () => ({
    meta: [
      { title: "Visitor approvals — FCM Console" },
      { name: "description", content: "Hosts review visitor requests sent to them and approve or reject them." },
      { property: "og:title", content: "Visitor approvals — FCM Console" },
      { property: "og:description", content: "Approve or reject visitors who want to meet you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER"]}>
      <Approvals />
    </AppPage>
  ),
});

function Approvals() {
  const { user } = useApp();
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["visit-requests"], queryFn: listVisitRequests });
  const { data: types = [] } = useQuery({ queryKey: ["visitor-types"], queryFn: listVisitorTypes });
  const [rejecting, setRejecting] = useState<VisitRequest | null>(null);
  const [invitation, setInvitation] = useState<VisitRequest | null>(null);
  const [reason, setReason] = useState("");
  const pending = data.filter((v) => v.status === "PENDING" && canDecide(user, v) && (v.host_id === user?.id || user?.role !== "EMPLOYEE"));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await qc.invalidateQueries(); }
    catch (e) {
      await qc.invalidateQueries({ queryKey: ["visit-requests"] });
      toast.error(e instanceof Error ? e.message : "Action failed.");
    }
  };
  const approve = async (visit: VisitRequest) => {
    if (!user) return;
    try {
      const approvedVisit = await approveVisitRequest(visit.id, user, setInvitation);
      setInvitation(approvedVisit);
      toast.success(
        approvedVisit.invitation_sent_at
          ? `${visit.visitor_name} approved - invitation sent`
          : `${visit.visitor_name} approved - invitation screen opened`,
      );
      await qc.invalidateQueries();
    } catch (error) {
      await qc.invalidateQueries({ queryKey: ["visit-requests"] });
      const emailFailed =
        error instanceof ApiError &&
        error.status === 502 &&
        error.message.includes("Visit approved");
      try {
        const requests = await listVisitRequests();
        const approvedVisit = requests.find(
          (item) =>
            item.id === visit.id && ["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(item.status),
        );
        if (approvedVisit) {
          setInvitation(approvedVisit);
          toast.error(
            emailFailed
              ? "The request was approved, but its email failed. Retry from the invitation screen."
              : "The request was approved, but a follow-up step failed. The invitation screen was opened.",
          );
          return;
        }
      } catch {
        if (emailFailed) {
          toast.error(
            "The request was approved, but its email failed. Refresh the visitor list and resend the invitation.",
          );
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : "Could not approve this request.");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Visitor Management" title="Approvals" subtitle="Visitors waiting for your decision. Approving issues their visit QR." />
      <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[12px] text-muted-foreground">
        <MessageCircle className="size-4" /> WhatsApp notifications are simulated for now — new requests appear here and in the visit activity log.
      </p>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : pending.length === 0 ? (
        <div className="surface-card p-10 text-center text-muted-foreground">No requests are waiting for you.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map((v) => (
            <article key={v.id} className="surface-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[16px] font-semibold">{v.visitor_name}</h3>
                  <p className="text-[12px] text-muted-foreground">{v.request_no}{v.source === "WALK_IN" ? " · Walk-in" : ""}</p>
                </div>
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">Pending</span>
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[13px]">
                {[
                  ["Company", v.company], ["Phone", v.phone], ["Email", v.email], ["Host", v.host_name],
                  ["Visit date", v.visit_date], ["Visit time", `${v.expected_arrival}–${v.expected_departure}`],
                  ["Purpose", v.purpose], ["Visitor type", types.find((t) => t.code === v.visitor_type)?.label ?? v.visitor_type],
                  ["Location", v.location], ["Remarks", v.remarks],
                ].map(([k, val]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{val || "—"}</dd></div>)}
              </dl>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void approve(v)}><CheckCircle2 className="size-4" /> Approve</Button>
                <Button className="flex-1" variant="outline" onClick={() => { setReason(""); setRejecting(v); }}><XCircle className="size-4" /> Reject</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {rejecting?.visitor_name}</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="destructive" disabled={reason.trim().length < 3} onClick={() => { const v = rejecting!; setRejecting(null); void run(() => rejectVisitRequest(v.id, reason.trim(), user!), "Request rejected"); }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VisitorInvitationDialog
        visit={invitation}
        open={!!invitation}
        onOpenChange={(open) => !open && setInvitation(null)}
      />
    </div>
  );
}
