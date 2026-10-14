import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Siren } from "lucide-react";
import { useApp } from "@/context/app-context";
import { canRespondEmergency, responseService } from "@/services/emergency";

/** App-wide: an unanswered emergency alert takes priority over every page. */
export function EmergencyBanner() {
  const { user } = useApp();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const canRespond = canRespondEmergency(user);
  const { data } = useQuery({
    queryKey: ["emg-mine", user?.id],
    queryFn: () => responseService.mineActive(user!.id),
    enabled: canRespond,
    refetchInterval: 30_000,
  });
  if (
    !data ||
    data.response.safety_status !== "NOT_RESPONDED" ||
    path === "/emergency" ||
    path === "/emergency/"
  ) {
    return null;
  }
  return (
    <Link
      to="/emergency"
      className="mt-4 flex items-center gap-3 rounded-xl bg-destructive px-4 py-3 text-destructive-foreground shadow-lg"
    >
      <Siren className="size-6 shrink-0 animate-pulse" />
      <span className="flex-1 text-[14px]">
        <strong>EMERGENCY ALERT {data.incident.incident_no}</strong> —{" "}
        {data.incident.emergency_type} in {data.incident.building}. Evacuate to{" "}
        {data.incident.assembly_point} and confirm you are safe.
      </span>
      <span className="rounded-lg bg-background/20 px-3 py-1.5 text-[13px] font-bold">
        Respond now
      </span>
    </Link>
  );
}
