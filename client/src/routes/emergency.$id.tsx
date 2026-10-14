import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AssistanceList,
  IncidentTag,
  ResponseTable,
  SafetySummary,
} from "@/components/emergency/parts";
import { useApp } from "@/context/app-context";
import { canMoveIncident } from "@/constants/emergency-status";
import {
  canManageEmergency,
  canMonitorEmergency,
  incidentService,
  responseService,
  type IncidentEmployee,
} from "@/services/emergency";
import { ReportOtherEmployee } from "@/components/emergency/ReportOtherEmployee";

export const Route = createFileRoute("/emergency/$id")({
  component: IncidentDetail,
});

function IncidentDetail() {
  const { id } = Route.useParams();
  const { user } = useApp();
  const qc = useQueryClient();
  const staff = canMonitorEmergency(user);
  const { data: inc, isLoading } = useQuery({
    queryKey: ["emg-incident", id],
    queryFn: () => incidentService.get(id),
    enabled: staff,
    refetchInterval: 30_000,
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["emg-responses", id],
    queryFn: () => responseService.list(id),
    enabled: staff,
    refetchInterval: 30_000,
  });
  const { data: acts = [] } = useQuery({
    queryKey: ["emg-activity", id],
    queryFn: () => incidentService.activity(id),
    enabled: staff,
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  if (!staff)
    return (
      <p className="text-muted-foreground">
        You don't have access to incident management.{" "}
        <Link to="/emergency" className="text-primary underline">
          Go to emergency
        </Link>
      </p>
    );
  if (isLoading) return <p className="text-muted-foreground">Loading incident…</p>;
  if (!inc) return <p>Incident not found.</p>;

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };
  const assist = (r: IncidentEmployee, to: "IN_PROGRESS" | "ASSISTED") =>
    run(r.id, () => responseService.setAssistance(r, to, user!), "Assistance updated");
  const info: [string, string][] = [
    ["Incident ID", inc.incident_no],
    ["Type", inc.emergency_type],
    [
      "Location",
      [inc.location, inc.building, inc.floor && `Floor ${inc.floor}`, inc.area]
        .filter(Boolean)
        .join(" · "),
    ],
    ["Description", inc.description || inc.remark || "—"],
    ["Assembly point", inc.assembly_point],
    ["Created by", `${inc.triggered_by_name} · ${new Date(inc.triggered_at).toLocaleString()}`],
    [
      "Resolved",
      inc.resolved_at
        ? `${inc.resolved_by_name} · ${new Date(inc.resolved_at).toLocaleString()}`
        : "—",
    ],
    [
      "End time / stopped by",
      (inc.stopped_at ?? inc.closed_at)
        ? `${inc.stopped_by_name ?? inc.closed_by_name ?? ""} · ${new Date(inc.stopped_at ?? inc.closed_at!).toLocaleString()}`
        : "—",
    ],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/emergency" className="text-[13px] text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
        <h1 className="font-display text-[26px] font-extrabold">
          {inc.title || inc.emergency_type}
        </h1>
        <span className="font-mono text-[13px]">{inc.incident_no}</span>
        <IncidentTag value={inc.status} />
        {canManageEmergency(user) && inc.status === "ACTIVE" ? (
          <div className="ml-auto flex gap-2">
            {canMoveIncident(inc.status, "CLOSED") ? (
              <Button
                variant="destructive"
                disabled={!!busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Stop emergency ${inc.incident_no}? It will be closed, retained in history, and removed from employee alerts.`,
                    )
                  )
                    void run(
                      "inc",
                      () => incidentService.stop(inc, user!),
                      "Emergency stopped and moved to history",
                    );
                }}
              >
                Stop Emergency
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <SafetySummary rows={rows} />
      <AssistanceList rows={rows} canAct={inc.status !== "CLOSED"} busy={busy} onAct={assist} />
      {inc.status === "ACTIVE" ? (
        <ReportOtherEmployee incidentId={inc.id} location={inc.location} />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <dl className="surface-card grid gap-3 p-5 sm:grid-cols-[150px_1fr]">
            {info.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-[13px] text-muted-foreground">{k}</dt>
                <dd className="text-[14px]">{v}</dd>
              </div>
            ))}
          </dl>
          <ResponseTable rows={rows} />
        </div>
        <aside className="surface-card h-fit p-5">
          <h2 className="mb-3 font-display text-[16px] font-bold">Activity timeline</h2>
          <ol className="max-h-150 space-y-3 overflow-auto border-l border-border pl-4">
            {acts.map((a) => (
              <li key={a.id} className="text-[13px]">
                <p className="font-medium">{a.description}</p>
                <p className="text-muted-foreground">
                  {new Date(a.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {a.performed_by_name}
                </p>
              </li>
            ))}
            {acts.length === 0 ? (
              <li className="text-[13px] text-muted-foreground">No activity yet.</li>
            ) : null}
          </ol>
        </aside>
      </div>
    </div>
  );
}
