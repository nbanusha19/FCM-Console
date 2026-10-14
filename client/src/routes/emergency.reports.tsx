import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, CheckCircle2, ClipboardList, Lock } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { SafetySummary } from "@/components/emergency/parts";
import { SAFETY_KEYS, SAFETY_STATUS } from "@/constants/emergency-status";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/app-context";
import { canMonitorEmergency, type EmergencyResponse } from "@/services/emergency";
import { useIncidentRows } from "@/components/emergency/useIncidentRows";

export const Route = createFileRoute("/emergency/reports")({
  component: Reports,
});

function Reports() {
  const { user } = useApp();
  const permitted = canMonitorEmergency(user);
  const { list, rows } = useIncidentRows(permitted);
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const n = (s: string) => list.filter((i) => i.status === s).length;
  const active = list.find((incident) => incident.status === "ACTIVE");
  const selectedIncident =
    list.find((incident) => incident.id === selectedIncidentId) ?? active ?? list[0];
  const incidentRows = rows.filter((row) => row.incident_id === selectedIncident?.id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return incidentRows.filter((row) => {
      const matchesStatus = status === "ALL" || row.safety_status === status;
      const matchesQuery =
        !query ||
        `${row.employee_name} ${row.employee_email} ${row.department} ${row.employee_ntid ?? ""} ${row.building ?? ""}`
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [incidentRows, search, status]);
  if (!permitted) return <p className="text-muted-foreground">You don't have access to reports.</p>;
  const breakdown = (key: "building" | "department") => {
    const groups = new Map<string, EmergencyResponse[]>();
    filteredRows.forEach((row) => {
      const name = row[key] || "Unassigned";
      groups.set(name, [...(groups.get(name) ?? []), row]);
    });
    return [...groups]
      .map(([name, people]) => ({
        name,
        total: people.length,
        safe: people.filter((person) => person.safety_status === "SAFE").length,
        support: people.filter((person) => person.safety_status === "NEEDS_ASSISTANCE").length,
        notReported: people.filter((person) => person.safety_status === "NOT_RESPONDED").length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  const safetyColors: Record<string, string> = {
    SAFE: "#10b981",
    NEEDS_ASSISTANCE: "#ef4444",
    NOT_RESPONDED: "#f59e0b",
  };
  const statusCounts = SAFETY_KEYS.map((key) => ({
    status: key,
    name: SAFETY_STATUS[key]!.label,
    count: filteredRows.filter((row) => row.safety_status === key).length,
  }));
  const chartData = (key: "building" | "department") =>
    breakdown(key).map((group) => ({
      ...group,
      Safe: group.safe,
      "Need Support": group.support,
      "Not Reported": group.notReported,
    }));
  const breakdownChart = (title: string, category: "building" | "department") => {
    const data = chartData(category);
    return (
      <section className="surface-card space-y-3 p-5">
        <div>
          <h2 className="font-display text-[16px] font-bold">{title}</h2>
          <p className="text-[13px] text-muted-foreground">
            {selectedIncident ? "Employee safety status by group." : "No incidents to summarize."}
          </p>
        </div>
        {data.length === 0 ? (
          <p className="grid h-64 place-items-center text-[13px] text-muted-foreground">
            No incident data available.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="Safe" stackId="status" fill={safetyColors.SAFE} />
                <Bar dataKey="Need Support" stackId="status" fill={safetyColors.NEEDS_ASSISTANCE} />
                <Bar
                  dataKey="Not Reported"
                  stackId="status"
                  fill={safetyColors.NOT_RESPONDED}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    );
  };
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Emergency Evacuation" title="Emergency reports" />
      <section className="space-y-3">
        <h2 className="font-display text-[18px] font-bold">Incident summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total incidents" value={list.length} icon={ClipboardList} />
          <StatCard label="Active" value={n("ACTIVE")} icon={Activity} tone="danger" />
          <StatCard label="Resolved" value={n("RESOLVED")} icon={CheckCircle2} tone="warning" />
          <StatCard label="Closed" value={n("CLOSED")} icon={Lock} tone="neutral" />
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] font-bold">Employee accountability</h2>
            {selectedIncident ? (
              <p className="text-[13px] text-muted-foreground">
                {selectedIncident.incident_no} ·{" "}
                {selectedIncident.title || selectedIncident.emergency_type} ·{" "}
                {selectedIncident.status}
              </p>
            ) : null}
          </div>
          {list.length > 0 ? (
            <Select
              value={selectedIncident?.id ?? ""}
              onValueChange={(incidentId) => {
                setSelectedIncidentId(incidentId);
                setSearch("");
                setStatus("ALL");
              }}
            >
              <SelectTrigger className="w-full sm:w-80" aria-label="Choose incident report">
                <SelectValue placeholder="Choose an incident" />
              </SelectTrigger>
              <SelectContent>
                {list.map((incident) => (
                  <SelectItem key={incident.id} value={incident.id}>
                    {incident.incident_no} · {incident.title || incident.emergency_type} (
                    {incident.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        {selectedIncident ? (
          <SafetySummary rows={incidentRows} />
        ) : (
          <p className="text-[14px] text-muted-foreground">
            No emergency incidents have been recorded yet.
          </p>
        )}
        <section className="surface-card space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee"
              aria-label="Search employee accountability chart"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filter safety status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {SAFETY_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {SAFETY_STATUS[key]!.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!selectedIncident ? (
            <p className="grid h-64 place-items-center text-[13px] text-muted-foreground">
              No incident data available.
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="grid h-64 place-items-center text-[13px] text-muted-foreground">
              {incidentRows.length
                ? "No employees match your search or status filter."
                : "No employee safety responses were recorded for this incident."}
            </p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <h3 className="mb-3 font-display text-[15px] font-bold">Employee safety status</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusCounts.filter((entry) => entry.count > 0)}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={2}
                      >
                        {statusCounts
                          .filter((entry) => entry.count > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.status}
                              fill={safetyColors[entry.status] ?? "#64748b"}
                            />
                          ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, "Employees"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="grid gap-2 text-[12px] sm:grid-cols-3">
                  {statusCounts.map((entry) => (
                    <li key={entry.status} className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: safetyColors[entry.status] ?? "#64748b" }}
                      />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="ml-auto font-semibold tabular-nums">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-border p-4">
                <h3 className="mb-3 font-display text-[15px] font-bold">
                  Employees by safety status
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={statusCounts}
                      margin={{ top: 8, right: 8, bottom: 8, left: -18 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value) => [value, "Employees"]} />
                      <Bar dataKey="count" name="Employees" radius={[5, 5, 0, 0]}>
                        {statusCounts.map((entry) => (
                          <Cell key={entry.status} fill={safetyColors[entry.status] ?? "#64748b"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        {breakdownChart("Building statistics", "building")}
        {breakdownChart("Department statistics", "department")}
      </section>
    </div>
  );
}
