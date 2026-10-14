import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/app-context";
import {
  gateWorkPermit,
  getGateOtpStatus,
  lookupWorkPermit,
  sendGateOtp,
} from "@/services/work-permits-api";
import type { WorkPermit } from "@/lib/work-permit";

export const Route = createFileRoute("/ework-permit/security")({
  component: SecurityDesk,
});

function SecurityDesk() {
  const { user } = useApp();
  const queryClient = useQueryClient();
  const [qrValue, setQrValue] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [permit, setPermit] = useState<WorkPermit | null>(null);
  const [gateOtpSent, setGateOtpSent] = useState(false);
  const [gateOtpDestination, setGateOtpDestination] = useState("");
  const [gateOtpBusy, setGateOtpBusy] = useState(false);
  const [cardId, setCardId] = useState("");
  const [consent, setConsent] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const canOperateGate = user?.role === "SECURITY" || user?.role === "ADMIN";
  const gateOtpStatus = useQuery({
    queryKey: ["ewp-gate-otp-status", permit?.id, qrToken],
    queryFn: () => getGateOtpStatus(permit!.id, qrToken),
    enabled: Boolean(permit && qrToken && gateOtpSent && permit.status === "APPROVED"),
    refetchInterval: (query) => (query.state.data?.verified ? false : 2000),
  });
  const gateOtpVerified = gateOtpStatus.data?.verified === true;

  const requestGateOtp = async (permitId: string, token: string) => {
    setGateOtpBusy(true);
    try {
      const result = await sendGateOtp(permitId, token);
      setGateOtpSent(true);
      setGateOtpDestination(result.destination);
      await queryClient.invalidateQueries({
        queryKey: ["ewp-gate-otp-status", permitId, token],
      });
      toast.success(`Check-in code sent to contractor email ${result.destination}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send the contractor check-in code.",
      );
    } finally {
      setGateOtpBusy(false);
    }
  };

  const scan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parts = qrValue.trim().split(":");
    if (parts.length !== 3 || parts[0] !== "FCM-EWP" || !parts[1] || !parts[2]) {
      toast.error("Scan a valid E-Work Permit QR code.");
      return;
    }
    setBusy(true);
    try {
      const result = await lookupWorkPermit(qrValue.trim());
      setPermit(result);
      setQrToken(parts[2]);
      setGateOtpSent(false);
      setGateOtpDestination("");
      setCardId("");
      setConsent(false);
      setRejecting(false);
      setRejectionReason("");
      setRejectionNote("");
      if (result.status === "APPROVED") {
        await requestGateOtp(result.id, parts[2]);
      }
    } catch (error) {
      setPermit(null);
      setQrToken("");
      toast.error(error instanceof Error ? error.message : "Unable to verify this permit QR.");
    } finally {
      setBusy(false);
    }
  };

  const grantEntry = async () => {
    if (!permit || !gateOtpVerified || !cardId.trim() || !consent) {
      toast.error(
        "Verify the contractor's email code, enter the contractor ID, and record consent before granting entry.",
      );
      return;
    }
    setBusy(true);
    try {
      await gateWorkPermit(permit.id, {
        grant: true,
        qrToken,
        contractorIdCard: cardId.trim(),
        consent: true,
      });
      toast.success("Gate entry recorded.");
      setPermit(null);
      setQrValue("");
      setQrToken("");
      setGateOtpSent(false);
      setRejecting(false);
      await queryClient.invalidateQueries({ queryKey: ["ewp-work-permits"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record gate entry.");
    } finally {
      setBusy(false);
    }
  };

  const rejectEntry = async () => {
    if (!permit || !rejectionReason || !rejectionNote.trim()) {
      toast.error("Select a rejection reason and enter a justification note.");
      return;
    }
    setBusy(true);
    try {
      await gateWorkPermit(permit.id, {
        grant: false,
        reason: rejectionReason,
        note: rejectionNote.trim(),
      });
      toast.success("Entry rejection recorded.");
      setPermit(null);
      setQrValue("");
      setQrToken("");
      setGateOtpSent(false);
      setRejecting(false);
      await queryClient.invalidateQueries({ queryKey: ["ewp-work-permits"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reject entry.");
    } finally {
      setBusy(false);
    }
  };

  if (!canOperateGate)
    return (
      <p className="text-muted-foreground">You don&apos;t have access to gate verification.</p>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Work Permit"
        title="Gate verification"
        subtitle="Scan the approved permit QR, verify contractor ID and consent, and grant or reject entry."
      />
      <form onSubmit={scan} className="surface-card space-y-3 p-5">
        <Label htmlFor="permit-qr">Scan permit QR</Label>
        <div className="flex gap-2">
          <Input
            id="permit-qr"
            autoFocus
            value={qrValue}
            onChange={(event) => setQrValue(event.target.value)}
            placeholder="Scan QR with the connected scanner"
          />
          <Button type="submit" disabled={busy || !qrValue.trim()}>
            {busy ? "Verifying…" : "Verify"}
          </Button>
        </div>
      </form>
      {permit ? (
        <section className="surface-card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm font-semibold">{permit.permitNo || permit.id}</span>
            <StatusPill status={permit.status} />
            <span className="text-sm">{permit.permitType.replaceAll("_", " ")}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {permit.contractor} · {permit.building}, {permit.floor}, {permit.wing}, {permit.area} ·{" "}
            {permit.workDate} · {permit.timeFrom}–{permit.timeTo}
          </p>
          <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Workers expected</p>
            <p className="text-sm font-semibold">
              {permit.workmenCount} {permit.workmenCount === 1 ? "worker" : "workers"}
            </p>
          </div>
          {permit.status !== "APPROVED" ? (
            <p role="alert" className="text-sm text-danger">
              This permit is not awaiting initial gate verification.
            </p>
          ) : (
            <>
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Contractor email verification</p>
                    <p className="text-xs text-muted-foreground">
                      {gateOtpVerified
                        ? "Contractor verified the email code. Continue with the gate checks."
                        : gateOtpSent
                          ? `Verification link and code sent to ${gateOtpDestination}. Waiting for the contractor to verify on their phone.`
                          : "A one-time code is sent to the contractor's registered email after scanning."}
                    </p>
                  </div>
                  {gateOtpVerified ? (
                    <span className="text-sm font-semibold text-success">Verified</span>
                  ) : null}
                </div>
                {gateOtpSent && !gateOtpVerified ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={gateOtpBusy}
                      onClick={() => void requestGateOtp(permit.id, qrToken)}
                    >
                      {gateOtpBusy ? "Sending…" : "Resend code"}
                    </Button>
                    {gateOtpStatus.error ? (
                      <p role="alert" className="text-sm text-danger">
                        Unable to check contractor verification status:{" "}
                        {gateOtpStatus.error.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractor-id">Contractor ID</Label>
                <Input
                  id="contractor-id"
                  value={cardId}
                  onChange={(event) => setCardId(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                Contractor consent recorded
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={busy || !gateOtpVerified || !cardId.trim() || !consent}
                  onClick={() => void grantEntry()}
                >
                  {busy ? "Recording…" : "Grant entry"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setRejecting((current) => !current)}
                >
                  {rejecting ? "Cancel rejection" : "Reject entry"}
                </Button>
              </div>
              {rejecting ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm font-semibold">Rejection details</p>
                  <div className="space-y-2">
                    <Label htmlFor="entry-rejection-reason">Reason</Label>
                    <select
                      id="entry-rejection-reason"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                    >
                      <option value="">Select a reason</option>
                      <option value="Contractor ID issue">Contractor ID issue</option>
                      <option value="Worker count mismatch">Worker count mismatch</option>
                      <option value="Required PPE missing">Required PPE missing</option>
                      <option value="Unsafe site conditions">Unsafe site conditions</option>
                      <option value="Outside approved work window">
                        Outside approved work window
                      </option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entry-rejection-note">Justification note</Label>
                    <textarea
                      id="entry-rejection-note"
                      className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={rejectionNote}
                      maxLength={2000}
                      onChange={(event) => setRejectionNote(event.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy || !rejectionReason || !rejectionNote.trim()}
                      onClick={() => void rejectEntry()}
                    >
                      {busy ? "Recording…" : "Confirm rejection"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
