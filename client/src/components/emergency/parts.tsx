import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Users } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { Pill } from "@/components/common/StatusBadge";
import { EmptyRow, TableCard, usePaged } from "@/components/common/TableCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSISTANCE_STATUS, INCIDENT_STATUS, SAFETY_KEYS, SAFETY_STATUS } from "@/constants/emergency-status";
import type { EmergencyResponse, IncidentEmployee } from "@/services/emergency";
import { summarize } from "@/services/emergency";

const t = (d?: string | null) => (d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

export function StatusTag({ map, value }: { map: typeof SAFETY_STATUS; value: string }) {
  const def = map[value];
  return <Pill tone={def?.tone ?? "neutral"}>{def?.label ?? value}</Pill>;
}
export const IncidentTag = ({ value }: { value: string }) => <StatusTag map={INCIDENT_STATUS} value={value} />;

export function SafetySummary({ rows }: { rows: IncidentEmployee[] }) {
  const s = summarize(rows);
  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={s.total} icon={Users} tone="brand" />
        <StatCard label="Safe" value={s.safe} icon={CheckCircle2} tone="success" />
        <StatCard label="Need Support" value={s.assistance} icon={AlertTriangle} tone="danger" />
        <StatCard label="Not Reported" value={s.notResponded} icon={HelpCircle} tone="warning" />
      </div>
      {s.total === 0 ? null : s.notResponded > 0 ? (
        <p className="text-[14px] font-semibold text-warning">{s.notResponded} employee{s.notResponded === 1 ? " has" : "s have"} not confirmed their safety.</p>
      ) : s.assistance === 0 ? (
        <p className="text-[14px] font-semibold text-success">All {s.total} affected employees have confirmed they are safe.</p>
      ) : null}
    </div>
  );
}

/** Priority list of employees who said they need assistance. */
export function AssistanceList({ rows, canAct, busy, onAct }: { rows: EmergencyResponse[]; canAct: boolean; busy: string | null; onAct: (r: IncidentEmployee, to: "IN_PROGRESS" | "ASSISTED") => void }) {
  const list = rows.filter((r) => r.safety_status === "NEEDS_ASSISTANCE").sort((a, b) => (a.assistance_status === "ASSISTED" ? 1 : 0) - (b.assistance_status === "ASSISTED" ? 1 : 0));
  return (
    <section className="surface-card p-5">
      <h2 className="mb-3 font-display text-[16px] font-bold">Employees needing assistance ({list.length})</h2>
      {list.length === 0 ? <p className="text-[14px] text-muted-foreground">No employees currently require assistance.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((r) => (
          <div key={r.id} className="rounded-lg border border-danger/40 bg-danger-soft/40 p-4 text-[14px]">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold"><AlertTriangle className="mr-1 inline size-4 text-danger" />{r.employee_name}</p>
              <StatusTag map={ASSISTANCE_STATUS} value={r.assistance_status} />
            </div>
            <p className="text-muted-foreground">{r.employee_ntid || "—"} · {r.department || "—"} · {r.building || "—"} · reported {t(r.response_time)}</p>
            {r.reported_by_name ? <p className="text-[13px] text-muted-foreground">Reported by {r.reported_by_name}</p> : null}
            {r.handled_by_name ? <p className="text-[13px] text-muted-foreground">Handled by {r.handled_by_name} at {t(r.handled_at)}</p> : null}
            {canAct ? (
              <div className="mt-2 flex gap-2">
                {r.assistance_status === "PENDING" ? <Button size="sm" disabled={busy === r.id} onClick={() => onAct(r, "IN_PROGRESS")}>Mark assistance in progress</Button> : null}
                {r.assistance_status === "IN_PROGRESS" ? <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => onAct(r, "ASSISTED")}>Mark assisted</Button> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ResponseTable({ rows }: { rows: EmergencyResponse[] }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("ALL");
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return rows.filter((r) => (f === "ALL" || r.safety_status === f) && (!s || `${r.employee_name} ${r.employee_email} ${r.department} ${r.employee_ntid ?? ""} ${r.building ?? ""}`.toLowerCase().includes(s)));
  }, [rows, q, f]);
  const { rows: page, footer } = usePaged(filtered, 10);
  return (
    <TableCard search={q} onSearch={setQ} placeholder="Search employee" filterValue={f} onFilter={setF}
      filterOptions={[{ value: "ALL", label: "All" }, ...SAFETY_KEYS.map((k) => ({ value: k, label: SAFETY_STATUS[k]!.label }))]} footer={footer}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead><TableHead>NTID</TableHead><TableHead>Department</TableHead><TableHead>Building</TableHead>
            <TableHead>Safety status</TableHead><TableHead>Response time</TableHead><TableHead>Reported by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.length === 0 ? <EmptyRow cols={7}>{rows.length ? "No employees match this filter." : "No employee safety responses have been received yet."}</EmptyRow> : null}
          {page.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.employee_name}<div className="text-[12px] text-muted-foreground">{r.employee_email}</div></TableCell>
              <TableCell>{r.employee_ntid || "—"}</TableCell>
              <TableCell>{r.department || "—"}</TableCell>
              <TableCell>{r.building || "—"}</TableCell>
              <TableCell><StatusTag map={SAFETY_STATUS} value={r.safety_status} /></TableCell>
              <TableCell>{t(r.response_time)}</TableCell>
              <TableCell>{r.reported_by_name || (r.response_time ? "Employee self-report" : "—")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
