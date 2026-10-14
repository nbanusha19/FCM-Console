import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/app-context";
import { qrDataUrl } from "@/lib/qr";
import {
  approveWorkPermit,
  confirmWorkPermitClosure,
  fesSignoffWorkPermit,
  getWorkPermit,
  rejectWorkPermit,
  resendWorkPermitApprovalEmail,
  sendBackWorkPermit,
  closeWorkPermit,
} from "@/services/work-permits-api";
import type { WorkPermit } from "@/lib/work-permit";

const REVIEW_BLOCKS = [
  ["SCOPE", "Scope and location"],
  ["SAFETY", "Safety checklist and PPE"],
  ["PEOPLE", "Contractor and supervisor"],
] as const;

export const Route = createFileRoute("/ework-permit/$id")({
  component: PermitDetail,
});

function PermitDetail() {
  const { id } = Route.useParams();
  const { user } = useApp();
  const client = useQueryClient();
  const {
    data: permit,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ewp-work-permit", id],
    queryFn: () => getWorkPermit(id),
  });
  const { data: qrImage } = useQuery({
    queryKey: ["ewp-qr-image", permit?.qrValue],
    queryFn: async () => {
      if (!permit?.qrValue) throw new Error("The approved permit does not have a QR value.");
      return qrDataUrl(permit.qrValue);
    },
    enabled: Boolean(permit?.qrValue),
  });
  const [validation, setValidation] = useState<Record<string, { verdict: string; note: string }>>(
    {},
  );
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [extensionDate, setExtensionDate] = useState("");
  const [extensionStart, setExtensionStart] = useState("");
  const [extensionEnd, setExtensionEnd] = useState("");
  const [fireWatchChecks, setFireWatchChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ewp-work-permit", id] }),
        client.invalidateQueries({ queryKey: ["ewp-work-permits"] }),
        client.invalidateQueries({ queryKey: ["permits"] }),
      ]);
    } catch (actionError) {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ewp-work-permit", id] }),
        client.invalidateQueries({ queryKey: ["ewp-work-permits"] }),
      ]);
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "Unable to complete the permit action.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading work permit…</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    );
  if (!permit) return <p className="text-muted-foreground">Work permit not found.</p>;

  const isHse = user?.role === "HSE" || user?.role === "ADMIN";
  const canApproveExtension = user?.role === "HSE";
  const isRequester = user?.id === permit.raisedById;
  const canApprove = isHse && permit.status === "PENDING_HSE";
  const hseValidation = Object.fromEntries(
    REVIEW_BLOCKS.map(([key]) => [key, validation[key] ?? { verdict: "", note: "" }]),
  );
  const approve = () => {
    if (REVIEW_BLOCKS.some(([key]) => !hseValidation[key]?.verdict)) {
      toast.error("Record an OK or NC verdict for every HSE review block.");
      return;
    }
    void runAction(
      () => approveWorkPermit(id, hseValidation as WorkPermit["hseValidation"]),
      "Permit approved.",
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Work Permit"
        title={`Permit ${permit.permitNo || permit.id}`}
        subtitle={`${permit.permitType.replaceAll("_", " ")} · Raised by ${permit.raisedByName}`}
        actions={<StatusPill status={permit.status} />}
      />
      <section className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Work date" value={permit.workDate} />
        <Info label="Approved window" value={`${permit.timeFrom}–${permit.timeTo}`} />
        <Info
          label="Location"
          value={[permit.building, permit.floor, permit.wing, permit.area]
            .filter(Boolean)
            .join(" · ")}
        />
        <Info label="Contractor" value={permit.contractor} />
        <Info label="Supervisor" value={`${permit.supervisorName} · ${permit.supervisorMobile}`} />
        <Info label="Workers" value={String(permit.workmenCount)} />
        <Info label="JSA reference" value={permit.jsaRef} />
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <p className="text-xs text-muted-foreground">Work description</p>
          <p className="whitespace-pre-wrap text-sm">{permit.workDescription}</p>
        </div>
      </section>

      <section className="surface-card space-y-3 p-5">
        <h2 className="font-display text-base font-bold">Safety checklist</h2>
        {permit.checklist.map((item, index) => (
          <div
            key={`${item.item}-${index}`}
            className="flex justify-between gap-4 border-b border-border py-2 text-sm"
          >
            <span>{item.item}</span>
            <strong>{item.answer || "—"}</strong>
          </div>
        ))}
        {Object.keys(permit.nightWork?.answers ?? {}).length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">Night work safety checks</h3>
            {Object.entries(permit.nightWork?.answers ?? {}).map(([key, answer]) => (
              <div key={key} className="flex justify-between gap-4 text-sm">
                <span>{key.replaceAll("_", " ").toLowerCase()}</span>
                <strong>{answer}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {permit.ppe?.items?.length ? (
          <p className="text-sm">PPE: {permit.ppe.items.join(", ")}</p>
        ) : null}
        {permit.permitType === "HOT_WORK" ? (
          <p className="text-sm">
            Fire Watch: {permit.fireWatch?.nominee || "—"} · valid until{" "}
            {permit.fireWatch?.validTill || "—"}
          </p>
        ) : null}
        {permit.permitType === "HEIGHT" ? (
          <p className="text-sm">
            Fall height:{" "}
            {String((permit as WorkPermit & { fallHeightMeters?: number }).fallHeightMeters ?? "—")}{" "}
            m
          </p>
        ) : null}
      </section>

      {permit.qrValue ? (
        <section className="surface-card space-y-2 p-5">
          <h2 className="font-display text-base font-bold">Approved gate QR value</h2>
          {qrImage ? (
            <img
              src={qrImage}
              alt={`Gate QR for permit ${permit.permitNo || permit.id}`}
              className="size-48"
            />
          ) : null}
          <code className="block break-all text-xs">{permit.qrValue}</code>
          <p className="text-xs text-muted-foreground">
            Security verifies this permit and records contractor ID and consent at the gate.
          </p>
        </section>
      ) : null}
      {isHse && permit.status === "APPROVED" ? (
        <section className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm">The contractor can receive the approved QR pass by email.</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void runAction(() => resendWorkPermitApprovalEmail(id), "Contractor QR email sent.")
            }
          >
            Resend QR email
          </Button>
        </section>
      ) : null}

      {canApprove ? (
        <section className="surface-card space-y-4 p-5 print:hidden">
          <h2 className="font-display text-base font-bold">HSE review</h2>
          {permit.permitType === "HOT_WORK" && permit.gates["fes"] !== "DONE" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-soft p-3 text-sm">
              <span>Hot Work requires FES sign-off before HSE approval.</span>
              {user?.role === "HSE" || user?.role === "ADMIN" ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void runAction(() => fesSignoffWorkPermit(id), "FES sign-off recorded.")
                  }
                >
                  Record FES sign-off
                </Button>
              ) : null}
            </div>
          ) : null}
          {REVIEW_BLOCKS.map(([key, label]) => (
            <div key={key} className="grid gap-3 sm:grid-cols-[180px_160px_1fr] sm:items-center">
              <Label>{label}</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={validation[key]?.verdict ?? ""}
                onChange={(event) =>
                  setValidation((current) => ({
                    ...current,
                    [key]: { ...(current[key] ?? { note: "" }), verdict: event.target.value },
                  }))
                }
              >
                <option value="">Choose verdict</option>
                <option value="OK">OK</option>
                <option value="NC">NC</option>
              </select>
              <Input
                aria-label={`${label} review note`}
                placeholder="Review note (optional)"
                value={validation[key]?.note ?? ""}
                onChange={(event) =>
                  setValidation((current) => ({
                    ...current,
                    [key]: { ...(current[key] ?? { verdict: "" }), note: event.target.value },
                  }))
                }
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="review-note">Clarification / rejection reason</Label>
            <Textarea
              id="review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy || note.trim().length < 3}
              onClick={() =>
                void runAction(
                  () => sendBackWorkPermit(id, note, hseValidation as WorkPermit["hseValidation"]),
                  "Permit sent back to requester.",
                )
              }
            >
              Send back
            </Button>
            <Button
              variant="outline"
              disabled={busy || note.trim().length < 3}
              onClick={() =>
                void runAction(
                  () => rejectWorkPermit(id, note, hseValidation as WorkPermit["hseValidation"]),
                  "Permit rejected.",
                )
              }
            >
              Reject
            </Button>
            <Button
              disabled={
                busy || (permit.permitType === "HOT_WORK" && permit.gates["fes"] !== "DONE")
              }
              onClick={approve}
            >
              Approve permit
            </Button>
          </div>
        </section>
      ) : null}

      {isRequester && permit.status === "ACTIVE" ? (
        <section className="surface-card space-y-4 p-5 print:hidden">
          <h2 className="font-display text-base font-bold">Close or extend active permit</h2>
          <div className="space-y-2">
            <Label htmlFor="completion-feedback">Completion feedback</Label>
            <Textarea
              id="completion-feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={2}
            />
          </div>
          {permit.permitType === "HOT_WORK" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4].map((hour) => (
                <label
                  key={hour}
                  className="flex items-center gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={fireWatchChecks[`hour${hour}`] ?? false}
                    onChange={(event) =>
                      setFireWatchChecks((current) => ({
                        ...current,
                        [`hour${hour}`]: event.target.checked,
                      }))
                    }
                  />
                  Fire Watch check at hour {hour}
                </label>
              ))}
            </div>
          ) : null}
          <Button
            variant="outline"
            disabled={
              busy ||
              feedback.trim().length < 3 ||
              (permit.permitType === "HOT_WORK" &&
                [1, 2, 3, 4].some((hour) => !fireWatchChecks[`hour${hour}`]))
            }
            onClick={() =>
              void runAction(
                () =>
                  closeWorkPermit(id, {
                    action: "FINAL_CLOSURE",
                    payload: { ownerEvaluation: { feedback: feedback.trim() }, fireWatchChecks },
                  }),
                "Closure request sent to HSE.",
              )
            }
          >
            Request closure
          </Button>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="extension-date">Extension date</Label>
              <Input
                id="extension-date"
                type="date"
                value={extensionDate}
                onChange={(event) => setExtensionDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="extension-start">Extension start</Label>
              <Input
                id="extension-start"
                type="time"
                value={extensionStart}
                onChange={(event) => setExtensionStart(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="extension-end">Extension end</Label>
              <Input
                id="extension-end"
                type="time"
                value={extensionEnd}
                onChange={(event) => setExtensionEnd(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="extension-justification">Extension justification</Label>
            <Textarea
              id="extension-justification"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>
          <Button
            variant="outline"
            disabled={
              busy || !extensionDate || !extensionStart || !extensionEnd || note.trim().length < 3
            }
            onClick={() =>
              void runAction(
                () =>
                  closeWorkPermit(id, {
                    action: "REQUEST_EXTENSION",
                    payload: {
                      workDate: extensionDate,
                      timeFrom: extensionStart,
                      timeTo: extensionEnd,
                      justification: note.trim(),
                    },
                  }),
                "Extension request sent to HSE.",
              )
            }
          >
            Request extension
          </Button>
        </section>
      ) : null}

      {isHse && permit.status === "CLOSURE_REQUESTED" ? (
        <section className="surface-card space-y-3 p-5 print:hidden">
          <h2 className="font-display text-base font-bold">Confirm permit closure</h2>
          <Textarea
            aria-label="HSE closure inspection remarks"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="HSE completion inspection remarks"
            rows={3}
          />
          <Button
            disabled={busy || feedback.trim().length < 3}
            onClick={() =>
              void runAction(
                () =>
                  confirmWorkPermitClosure(id, {
                    payload: { hseEvaluation: { remarks: feedback.trim() } },
                  }),
                "Permit closed.",
              )
            }
          >
            Confirm closure
          </Button>
        </section>
      ) : null}
      {canApproveExtension && permit.status === "EXTENSION_REQUESTED" ? (
        <section className="surface-card space-y-3 p-5 print:hidden">
          <h2 className="font-display text-base font-bold">Review extension request</h2>
          <p className="text-sm text-muted-foreground">
            {JSON.stringify(
              (permit as WorkPermit & { extensionRequest?: Record<string, unknown> })
                .extensionRequest ?? {},
            )}
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void runAction(
                () => confirmWorkPermitClosure(id, { action: "APPROVE_EXTENSION" }),
                "Extension approved.",
              )
            }
          >
            Approve extension
          </Button>
        </section>
      ) : null}

      <section className="surface-card space-y-3 p-5 print:hidden">
        <h2 className="font-display text-base font-bold">Workflow history</h2>
        {permit.events.map((event) => (
          <div key={event.id} className="border-b border-border py-2 text-sm">
            <strong>{event.action.replaceAll("_", " ")}</strong> · {event.actorName} ·{" "}
            {event.at ? new Date(event.at).toLocaleString() : ""}
            {event.detail ? <p className="text-muted-foreground">{event.detail}</p> : null}
          </div>
        ))}
        {permit.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workflow events recorded.</p>
        ) : null}
      </section>
      <Link to="/ework-permit" className="text-sm text-primary hover:underline print:hidden">
        Back to E-Work Permit
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
