import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, Download } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyRow, TableCard, usePaged } from "@/components/common/TableCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IncidentTag } from "@/components/emergency/parts";
import { INCIDENT_STATUS } from "@/constants/emergency-status";
import { useApp } from "@/context/app-context";
import { canMonitorEmergency } from "@/services/emergency";
import { useIncidentRows } from "@/components/emergency/useIncidentRows";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/emergency/history")({
  component: History,
});

function History() {
  const { user } = useApp();
  const permitted = canMonitorEmergency(user);
  const { list, isLoading } = useIncidentRows(permitted);
  const [q, setQ] = useState("");
  const [f, setF] = useState("ALL");
  const filtered = useMemo(() => list.filter((i) => (f === "ALL" || i.status === f) && `${i.incident_no} ${i.emergency_type} ${i.building} ${i.title}`.toLowerCase().includes(q.toLowerCase())), [list, q, f]);
  const { rows: page, footer } = usePaged(filtered);
  if (!permitted) return <p className="text-muted-foreground">You don't have access to incident history.</p>;

  const csv = () => {
    const head = ["Incident", "Type", "Location", "Building", "Triggered by", "Start", "Assembly point", "Total", "Safe", "Need support", "Not reported", "Status", "End"];
    const body = list.map((i) => [i.incident_no, i.emergency_type, i.location, i.building, i.triggered_by_name, i.triggered_at, i.assembly_point, i.s.total, i.s.safe, i.s.assistance, i.s.notResponded, i.status, i.closed_at ?? i.stopped_at ?? ""]);
    downloadCsv("emergency-incidents.csv", head, body);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Emergency Evacuation" title="Incident history" actions={<Button variant="outline" onClick={csv}><Download className="size-4" /> Export CSV</Button>} />
      <TableCard search={q} onSearch={setQ} placeholder="Search incident" filterValue={f} onFilter={setF}
        filterOptions={[{ value: "ALL", label: "All statuses" }, ...Object.entries(INCIDENT_STATUS).map(([k, d]) => ({ value: k, label: d.label }))]} footer={footer}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Incident</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Building</TableHead><TableHead>Triggered by</TableHead><TableHead>Start time</TableHead><TableHead>Assembly point</TableHead>
            <TableHead>Total</TableHead><TableHead>Safe</TableHead><TableHead>Need support</TableHead><TableHead>Not reported</TableHead><TableHead>Status</TableHead><TableHead>End time</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {page.length === 0 ? <EmptyRow cols={14}>{isLoading ? "Loading…" : "No emergency incidents found."}</EmptyRow> : null}
            {page.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-[12px]">{i.incident_no}</TableCell><TableCell>{i.emergency_type}</TableCell><TableCell>{i.location}</TableCell><TableCell>{i.building}</TableCell><TableCell>{i.triggered_by_name || "—"}</TableCell>
                <TableCell className="text-[12px]">{new Date(i.triggered_at).toLocaleString()}</TableCell><TableCell className="max-w-[180px] truncate">{i.assembly_point}</TableCell>
                <TableCell>{i.s.total}</TableCell><TableCell className="text-success">{i.s.safe}</TableCell><TableCell className="text-danger">{i.s.assistance}</TableCell><TableCell className="text-warning">{i.s.notResponded}</TableCell>
                <TableCell><IncidentTag value={i.status} /></TableCell><TableCell className="text-[12px]">{i.closed_at || i.stopped_at ? new Date(i.closed_at ?? i.stopped_at!).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right"><Link to="/emergency/$id" params={{ id: i.id }} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label="View"><Eye className="size-4" /></Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
