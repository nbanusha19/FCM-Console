import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Siren } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { EmployeeAlert } from "@/components/emergency/EmployeeAlert";
import { IncidentTag, SafetySummary } from "@/components/emergency/parts";
import { useApp } from "@/context/app-context";
import {
  canManageEmergency,
  canMonitorEmergency,
  canRespondEmergency,
  incidentService,
  responseService,
} from "@/services/emergency";

export const Route = createFileRoute("/emergency/")({
  component: EmergencyHome,
});

function EmergencyHome() {
  const { user } = useApp();
  const qc = useQueryClient();
  const staff = canMonitorEmergency(user);
  const { data: mine, isLoading } = useQuery({
    queryKey: ["emg-mine", user?.id],
    queryFn: () => responseService.mineActive(user!.id),
    enabled: canRespondEmergency(user),
    refetchInterval: 30_000,
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ["emg-incidents"],
    queryFn: incidentService.list,
    enabled: staff,
    refetchInterval: 30_000,
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["emg-responses-all"],
    queryFn: () => responseService.list(),
    enabled: staff,
    refetchInterval: 30_000,
  });

  const active = incidents.filter((i) => i.status === "ACTIVE");
  const refresh = () => qc.invalidateQueries({ queryKey: ["emg-mine"] });
  const stop = async (incidentId: string, incidentNo: string) => {
    const incident = incidents.find((row) => row.id === incidentId);
    if (
      !incident ||
      !user ||
      !window.confirm(
        `Stop emergency ${incidentNo}? This will close the incident and remove it from employee alerts.`,
      )
    )
      return;
    try {
      await incidentService.stop(incident, user);
      await qc.invalidateQueries();
      toast.success("Emergency stopped and moved to history.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to stop this emergency.");
    }
  };

  return (
    <div className="space-y-6">
      {mine ? (
        <EmployeeAlert incident={mine.incident} response={mine.response} onDone={refresh} />
      ) : null}
      {!staff ? (
        isLoading ? (
          <p className="text-muted-foreground">Checking for emergencies…</p>
        ) : !mine ? (
          <div className="surface-card mx-auto max-w-md p-8 text-center">
            <ShieldCheck className="mx-auto size-10 text-success" />
            <p className="mt-2 font-semibold">No active emergency incidents.</p>
            <p className="text-[14px] text-muted-foreground">
              If an emergency is declared, the alert will appear here.
            </p>
          </div>
        ) : null
      ) : (
        <>
          <PageHeader
            eyebrow="Emergency Evacuation"
            title="Emergency dashboard"
            subtitle="Live employee accountability and evacuation status."
            actions={
              canManageEmergency(user) ? (
                <Button asChild variant="destructive">
                  <Link to="/emergency/new">
                    <Siren className="size-4" /> Trigger Emergency
                  </Link>
                </Button>
              ) : null
            }
          />
          {active.length === 0 ? (
            <p className="surface-card p-6 text-[14px] text-muted-foreground">
              No active emergency incidents.
            </p>
          ) : null}
          {active.map((i) => (
            <section key={i.id} className="surface-card space-y-4 border-destructive/40 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[13px] font-bold">{i.incident_no}</span>
                <h2 className="font-display text-[20px] font-bold">
                  {i.title || i.emergency_type}
                </h2>
                <IncidentTag value={i.status} />
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link to="/emergency/$id" params={{ id: i.id }}>
                    Open incident
                  </Link>
                </Button>
                {canManageEmergency(user) ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void stop(i.id, i.incident_no)}
                  >
                    Stop Emergency
                  </Button>
                ) : null}
              </div>
              <p className="text-[14px] text-muted-foreground">
                {i.emergency_type} ·{" "}
                {[i.location, i.building, i.floor && `Floor ${i.floor}`, i.area]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                · Assembly point: <strong className="text-foreground">{i.assembly_point}</strong>
              </p>
              <p className="text-[13px] text-muted-foreground">
                Triggered by {i.triggered_by_name} · {new Date(i.triggered_at).toLocaleString()}
              </p>
              <SafetySummary rows={rows.filter((r) => r.incident_id === i.id)} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
