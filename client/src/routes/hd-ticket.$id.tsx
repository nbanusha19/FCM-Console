import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Paperclip,
  Play,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/context/app-context";
import { canMoveTicket } from "@/constants/ticket-status";
import {
  evidenceService,
  providerService,
  ticketService,
  type HdEvidence,
  type HdProvider,
  type HdTicket,
  type HdTicketEvent,
} from "@/services/helpdesk-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hd-ticket/$id")({
  head: () => ({
    meta: [
      { title: "Ticket details — FCM Helpdesk" },
      { name: "description", content: "Ticket details, evidence and activity timeline." },
      { property: "og:title", content: "Helpdesk ticket" },
      { property: "og:description", content: "Ticket details, evidence and activity timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE", "SERVICE_PROVIDER"]}>
      <TicketDetailsPage />
    </AppPage>
  ),
});

function TicketDetailsPage() {
  const { id } = Route.useParams();
  const { user } = useApp();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<HdTicket | null>(null);
  const [events, setEvents] = useState<HdTicketEvent[]>([]);
  const [evidence, setEvidence] = useState<HdEvidence[]>([]);
  const [providers, setProviders] = useState<HdProvider[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "ADMIN";
  const isProvider = user?.role === "SERVICE_PROVIDER";

  const reload = useCallback(async () => {
    setLoadError("");
    const t = await ticketService.get(id);
    setTicket(t);
    if (t) {
      const [eventsResult, evidenceResult] = await Promise.allSettled([
        ticketService.events(t.id),
        evidenceService.list(t.id),
      ]);
      const errors: string[] = [];
      if (eventsResult.status === "fulfilled") setEvents(eventsResult.value);
      else
        errors.push(
          eventsResult.reason instanceof Error
            ? eventsResult.reason.message
            : "Unable to load ticket activity.",
        );
      if (evidenceResult.status === "fulfilled") setEvidence(evidenceResult.value);
      else
        errors.push(
          evidenceResult.reason instanceof Error
            ? evidenceResult.reason.message
            : "Unable to load ticket evidence.",
        );
      if (errors.length) setLoadError(errors.join(" "));
    }
  }, [id]);

  useEffect(() => {
    void reload()
      .catch((error: unknown) => {
        setTicket(null);
        setLoadError(error instanceof Error ? error.message : "Unable to load the ticket.");
      })
      .finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    if (!isAdmin && !isProvider) return;
    void providerService
      .listProviders()
      .then((rows) => setProviders(rows.filter((provider) => provider.active)))
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to load active service providers.",
        ),
      );
  }, [isAdmin, isProvider]);

  if (!user) return null;
  if (loading) {
    return <p className="py-16 text-center text-[14px] text-muted-foreground">Loading ticket…</p>;
  }
  if (!ticket) {
    return (
      <div className="py-16 text-center">
        <p role={loadError ? "alert" : undefined} className="text-[14px] text-muted-foreground">
          {loadError || "Ticket not found or unavailable."}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/helpdesk" })}>
          <ArrowLeft className="size-4" /> Back to Helpdesk
        </Button>
      </div>
    );
  }

  const canAssignAndStart = isProvider && ticket.status === "NEW" && !ticket.provider_name;
  const canStartWork = isProvider && canMoveTicket(ticket.status, "IN_PROGRESS");
  const canCompleteWork = isProvider && canMoveTicket(ticket.status, "RESOLVED");
  const canClose = (isAdmin || isProvider) && canMoveTicket(ticket.status, "CLOSED");
  const showActions =
    canAssignAndStart ||
    canStartWork ||
    canCompleteWork ||
    canClose ||
    (!isAdmin && !isProvider);

  const act = async (to: string) => {
    setBusy(true);
    try {
      await ticketService.updateStatus(ticket, to, user);
      toast.success(`Ticket ${to === "CLOSED" ? "closed" : "updated"}`);
      await reload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to update the ticket. Please try again.",
      );
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  };
  const assignAndStart = async () => {
    const provider = providers.find((item) => item.id === assignTo);
    if (!provider) return;
    setBusy(true);
    try {
      await ticketService.assignAndStart(ticket, provider);
      toast.success(`Assigned to ${provider.name}; work started`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to assign the provider and start work.");
    } finally {
      setBusy(false);
    }
  };
  const requestClose = async () => {
    try {
      await ticketService.validateClosureEvidence(ticket);
      setConfirmClose(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to verify ticket evidence.");
    }
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      await evidenceService.upload(ticket, file, user);
      toast.success("Evidence uploaded");
      await reload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to upload the evidence. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {loadError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive"
        >
          {loadError}
        </p>
      ) : null}
      <PageHeader
        eyebrow="FCM Helpdesk"
        title={`${ticket.ticket_no}`}
        subtitle={`${ticket.category_name}${ticket.subcategory_name ? ` · ${ticket.subcategory_name}` : ""}`}
        actions={
          <Button variant="outline" onClick={() => navigate({ to: "/helpdesk" })}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      <div
        className={cn(
          "grid gap-6",
          showActions ? "lg:grid-cols-[1.4fr_1fr]" : "mx-auto w-full max-w-3xl grid-cols-1",
        )}
      >
        <div className="space-y-6">
          <section className="surface-card space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[16px] font-bold">Ticket information</h2>
              <StatusPill status={ticket.status} />
            </div>
            <div className="grid gap-3 text-[13px] sm:grid-cols-2">
              <Field
                label="Raised by"
                value={`${ticket.raiser_name}${ticket.raiser_email ? ` (${ticket.raiser_email})` : ""}`}
              />
              <Field label="Location" value={ticket.location || "—"} />
              <Field
                label="Priority"
                value={
                  ticket.priority
                    ? `${ticket.priority.charAt(0)}${ticket.priority.slice(1).toLowerCase()}`
                    : "Medium"
                }
              />
              <Field label="Service provider" value={ticket.provider_name || "Unassigned"} />
              <Field label="Created" value={new Date(ticket.created_at).toLocaleString()} />
              <Field label="Last updated" value={new Date(ticket.updated_at).toLocaleString()} />
              {ticket.closed_at ? (
                <Field
                  label="Closed"
                  value={`${new Date(ticket.closed_at).toLocaleString()} by ${ticket.closed_by_name ?? ""}`}
                />
              ) : null}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-[14px]">{ticket.description}</p>
            </div>
          </section>

          <section className="surface-card space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[16px] font-bold">Evidence</h2>
              {isProvider && ticket.status !== "CLOSED" ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Paperclip className="size-4" />
                    )}{" "}
                    Attach evidence
                  </Button>
                </>
              ) : null}
            </div>
            {evidence.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No evidence attached yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {evidence.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                  >
                    <div>
                      <p className="font-semibold">{e.file_name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {e.uploaded_by_name} · {new Date(e.created_at).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={e.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      <Download className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card p-6">
            <h2 className="mb-4 font-display text-[16px] font-bold">Activity</h2>
            <ol className="space-y-3 border-l border-border pl-4 text-[13px]">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="font-semibold">{e.action}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {e.performed_by_name} · {new Date(e.created_at).toLocaleString()}
                  </span>
                  {e.remarks ? (
                    <p className="text-[12px] text-muted-foreground">{e.remarks}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {showActions ? (
          <div className="space-y-6">
            <section className="surface-card space-y-3 p-6">
              <h2 className="font-display text-[16px] font-bold">Actions</h2>
              {canAssignAndStart ? (
                <div className="space-y-2">
                  <Label>Assign to service provider</Label>
                  <Select value={assignTo} onValueChange={setAssignTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    disabled={!assignTo || busy}
                    onClick={() => void assignAndStart()}
                  >
                    <Play className="size-4" /> Assign &amp; start work
                  </Button>
                </div>
              ) : null}
              {canStartWork ? (
                <Button className="w-full" disabled={busy} onClick={() => void act("IN_PROGRESS")}>
                  <Play className="size-4" /> Start work
                </Button>
              ) : null}
              {canCompleteWork ? (
                <Button className="w-full" disabled={busy} onClick={() => void act("RESOLVED")}>
                  <Wrench className="size-4" /> Mark service completed
                </Button>
              ) : null}
              {canClose ? (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={busy || uploading}
                  onClick={() => void requestClose()}
                >
                  <CheckCircle2 className="size-4" /> Close ticket
                </Button>
              ) : null}
              {!isAdmin && !isProvider ? (
                <p className="text-[12px] text-muted-foreground">
                  You can track progress here. The service team updates the status.
                </p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this ticket?</DialogTitle>
            <DialogDescription>
              The service has been completed and the attached evidence will be saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void act("CLOSED")}>
              {busy ? "Closing…" : "Close ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
