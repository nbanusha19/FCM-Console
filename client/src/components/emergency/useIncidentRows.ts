import { useQuery } from "@tanstack/react-query";
import { incidentService, responseService, summarize } from "@/services/emergency";

export function useIncidentRows(enabled: boolean) {
  const { data: incidents = [], isLoading } = useQuery({ queryKey: ["emg-incidents"], queryFn: incidentService.list, enabled });
  const { data: rows = [] } = useQuery({ queryKey: ["emg-responses-all"], queryFn: () => responseService.list(), enabled });
  return { isLoading, rows, list: incidents.map((i) => ({ ...i, s: summarize(rows.filter((r) => r.incident_id === i.id)) })) };
}
