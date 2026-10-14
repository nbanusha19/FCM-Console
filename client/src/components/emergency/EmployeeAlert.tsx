import { useEffect, useState } from "react";
import { CheckCircle2, LifeBuoy, MapPin, Siren } from "lucide-react";
import { toast } from "sonner";
import type { Incident, IncidentEmployee } from "@/services/emergency";
import { responseService } from "@/services/emergency";

/** Mobile-first emergency screen: Are you safe? YES / NO. One answer, final. */
export function EmployeeAlert({ incident, response, onDone }: { incident: Incident; response: IncidentEmployee; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<{ status: "SAFE" | "NEEDS_ASSISTANCE"; at: string } | null>(null);
  useEffect(() => {
    if (!response.read_at) void responseService.markRead(incident.id);
  }, [incident.id, response.read_at]);

  const answer = async (s: "SAFE" | "NEEDS_ASSISTANCE") => {
    setBusy(true);
    try {
      await responseService.confirm(incident.id, s);
      setSubmitted({ status: s, at: new Date().toISOString() });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to record your safety response. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const where = [incident.location, incident.building, incident.floor && `Floor ${incident.floor}`, incident.area].filter(Boolean).join(" · ");
  const currentStatus = submitted?.status ?? response.safety_status;
  const responseTime = submitted?.at ?? response.response_time;

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl border-2 border-danger bg-card shadow-lg">
      <div className="bg-destructive px-5 py-4 text-center text-destructive-foreground">
        <Siren className="mx-auto size-8 animate-pulse" />
        <p className="mt-1 font-display text-[22px] font-extrabold tracking-wide">EMERGENCY ALERT</p>
        <p className="font-mono text-[13px] opacity-90">{incident.incident_no}</p>
      </div>
      <div className="space-y-4 p-5">
        <dl className="grid grid-cols-[110px_1fr] gap-2 text-[15px]">
          <dt className="text-muted-foreground">Type</dt><dd className="font-semibold">{incident.emergency_type}</dd>
          <dt className="text-muted-foreground">Location</dt><dd>{where}</dd>
          {incident.description ? <><dt className="text-muted-foreground">Details</dt><dd>{incident.description}</dd></> : null}
          <dt className="text-muted-foreground">Status</dt><dd className="font-semibold text-destructive">Active — please evacuate now</dd>
        </dl>
        <div className="rounded-xl bg-warning-soft p-4">
          <p className="text-[13px] font-semibold uppercase text-warning">Evacuate immediately using the nearest safe route. Do not use elevators; follow site emergency instructions and proceed to:</p>
          <p className="mt-1 flex items-center gap-2 font-display text-[20px] font-bold"><MapPin className="size-5" />{incident.assembly_point}</p>
        </div>
        {currentStatus === "NOT_RESPONDED" ? (
          <>
            <p className="text-center font-display text-[20px] font-bold">Are you safe?</p>
            <button disabled={busy} onClick={() => answer("SAFE")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-5 text-[18px] font-bold text-primary-foreground disabled:opacity-60">
              <CheckCircle2 className="size-6" /> I'M SAFE
            </button>
            <button disabled={busy} onClick={() => answer("NEEDS_ASSISTANCE")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-5 text-[18px] font-bold text-destructive-foreground disabled:opacity-60">
              <LifeBuoy className="size-6" /> I NEED SUPPORT
            </button>
            <p className="text-center text-[12px] text-muted-foreground">Report once you reach the safe location. Your response can only be submitted once.</p>
          </>
        ) : currentStatus === "SAFE" ? (
          <div className="rounded-xl bg-success-soft p-4 text-center">
            <CheckCircle2 className="mx-auto size-8 text-success" />
            <p className="font-semibold">Safety Status: SAFE</p>
            <p className="text-[13px] text-muted-foreground">Responded {responseTime ? new Date(responseTime).toLocaleString() : "—"}</p>
            <p className="text-[14px] text-muted-foreground">Please remain at the designated assembly point and follow emergency instructions.</p>
          </div>
        ) : (
          <div className="rounded-xl bg-danger-soft p-4 text-center">
            <LifeBuoy className="mx-auto size-8 text-danger" />
            <p className="font-semibold">Safety Status: NEED SUPPORT</p>
            <p className="text-[13px] text-muted-foreground">Responded {responseTime ? new Date(responseTime).toLocaleString() : "—"}</p>
            <p className="text-[14px] text-muted-foreground">Emergency/security personnel have been notified. Please follow the emergency instructions provided.</p>
          </div>
        )}
      </div>
    </div>
  );
}
