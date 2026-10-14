import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/common/StatusBadge";
import { EmptyRow, TableCard, usePaged } from "@/components/common/TableCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { statusLabel, VISIT_STATUS_KEYS } from "@/constants/visit-status";
import { VMS_BRANCH_FILTERS } from "@/constants/vms-filters";
import { fmtTime, listGuestCards, listVisitRequests, listVisitorTypes, visitDuration, type VisitRequest } from "@/services/visitor-requests";
import { downloadCsv } from "@/lib/csv-export";

export type Column = "visitor" | "host" | "company" | "date" | "time" | "status" | "checkin" | "checkout" | "duration" | "card" | "location" | "type";
const LABEL: Record<Column, string> = {
  visitor: "Visitor", host: "Host", company: "Company", date: "Visit date", time: "Visit time", status: "Status",
  checkin: "Check-in", checkout: "Check-out", duration: "Duration", card: "Guest ID", location: "Location", type: "Visitor type",
};

const ALL = "__all";

/** Reusable filtered visit table used by Today, Upcoming, History and Reports. */
export function VisitList({
  preset,
  columns,
  sort = "desc",
  showDateRange = true,
  showTypeFilter = false,
  compactFilters = false,
  emptyTitle = "No visits match these filters.",
  emptyDescription = "",
  exportName,
  header,
}: {
  preset: (v: VisitRequest) => boolean;
  columns: Column[];
  sort?: "asc" | "desc";
  showDateRange?: boolean;
  showTypeFilter?: boolean;
  compactFilters?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  exportName?: string;
  header?: ReactNode;
}) {
  const { data = [], isLoading, error } = useQuery({ queryKey: ["visit-requests"], queryFn: listVisitRequests });
  const { data: cards = [] } = useQuery({ queryKey: ["guest-cards"], queryFn: listGuestCards });
  const { data: types = [] } = useQuery({ queryKey: ["visitor-types"], queryFn: listVisitorTypes });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [host, setHost] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [vtype, setVtype] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visitDay, setVisitDay] = useState("");

  const base = useMemo(() => data.filter(preset), [data, preset]);
  const hosts = [...new Set(base.map((v) => v.host_name).filter(Boolean))].sort();
  const locations = [...new Set(base.map((v) => v.location).filter(Boolean))].sort();
  const typeLabel = (c: string) => types.find((t) => t.code === c)?.label ?? c;
  const cardCode = (id: string | null) => cards.find((c) => c.id === id)?.code ?? "—";

  const rows = base
    .filter((v) => status === ALL || v.status === status)
    .filter((v) => host === ALL || v.host_name === host)
    .filter((v) => location === ALL || v.location === location)
    .filter((v) => vtype === ALL || v.visitor_type === vtype)
    .filter((v) => (!from || v.visit_date >= from) && (!to || v.visit_date <= to))
    .filter((v) => !compactFilters || !visitDay || v.visit_date === visitDay)
    .filter((v) => !q.trim() || [v.visitor_name, v.visitor_code, v.company, v.email, v.request_no, v.host_name].join(" ").toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => {
      const k = (x: VisitRequest) => `${x.visit_date} ${x.expected_arrival}`;
      return sort === "asc" ? k(a).localeCompare(k(b)) : k(b).localeCompare(k(a));
    });
  const paged = usePaged(rows);

  const cell = (v: VisitRequest, c: Column): ReactNode => {
    switch (c) {
      case "visitor": return <><div className="font-semibold text-foreground">{v.visitor_name}</div><div className="text-[11px]">{v.request_no}</div></>;
      case "host": return <>{v.host_name}{v.host_department ? <div className="text-[11px]">{v.host_department}</div> : null}</>;
      case "company": return v.company;
      case "date": return v.visit_date;
      case "time": return `${v.expected_arrival}–${v.expected_departure}`;
      case "status": return <StatusPill status={v.status} />;
      case "checkin": return fmtTime(v.checked_in_at);
      case "checkout": return fmtTime(v.checked_out_at);
      case "duration": return visitDuration(v) || "—";
      case "card": return <span className="font-mono text-[11px]">{cardCode(v.guest_card_id)}</span>;
      case "location": return v.location || "—";
      case "type": return typeLabel(v.visitor_type);
    }
  };
  const text = (v: VisitRequest, c: Column): string => {
    switch (c) {
      case "visitor": return v.visitor_name;
      case "host": return v.host_name;
      case "status": return statusLabel(v.status);
      case "checkin": return v.checked_in_at ?? "";
      case "checkout": return v.checked_out_at ?? "";
      case "duration": return visitDuration(v);
      case "card": return cardCode(v.guest_card_id);
      case "type": return typeLabel(v.visitor_type);
      default: { const r = cell(v, c); return typeof r === "string" ? r : ""; }
    }
  };

  const exportCsv = () => {
    const head = ["Request ID", ...columns.map((c) => LABEL[c])];
    const values = rows.map((v) => [v.request_no, ...columns.map((c) => text(v, c))]);
    downloadCsv(
      `${exportName ?? "visits"}-${new Date().toISOString().slice(0, 10)}.csv`,
      head,
      values,
    );
  };

  const sel = (value: string, set: (v: string) => void, placeholder: string, opts: { value: string; label: string }[]) => (
    <Select value={value} onValueChange={(v) => { set(v); paged.reset(); }}>
      <SelectTrigger className="h-9 w-40"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      {header}
      {error ? <p className="text-danger">Couldn't load visits: {(error as Error).message}</p> : null}
      <TableCard
        search={q}
        onSearch={(v) => { setQ(v); paged.reset(); }}
        placeholder={compactFilters ? "Search visitor, ID, company, host" : "Search visitor, company, request ID, host"}
        filterValue={status}
        onFilter={(v) => { setStatus(v); paged.reset(); }}
        filterOptions={[
          { value: ALL, label: compactFilters ? "All statuses" : `All statuses (${base.length})` },
          ...VISIT_STATUS_KEYS.map((k) => ({
            value: k,
            label: compactFilters ? statusLabel(k) : `${statusLabel(k)} (${base.filter((v) => v.status === k).length})`,
          })),
        ]}
        filterClassName={compactFilters ? "h-9 w-28" : undefined}
        toolbarClassName={compactFilters ? "gap-1.5 p-2" : undefined}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            {compactFilters ? (
              <>
                {sel(vtype, setVtype, "All visitor types", types.map((type) => ({ value: type.code, label: type.label })))}
                {sel(location, setLocation, "All branches", [...VMS_BRANCH_FILTERS])}
                <Input
                  type="date"
                  className="h-9 w-36"
                  value={visitDay}
                  onChange={(event) => { setVisitDay(event.target.value); paged.reset(); }}
                  aria-label="Visit date"
                />
              </>
            ) : (
              <>
                {sel(host, setHost, "All hosts", hosts.map((h) => ({ value: h, label: h })))}
                {sel(location, setLocation, "All locations", locations.map((l) => ({ value: l, label: l })))}
                {showTypeFilter ? sel(vtype, setVtype, "All visitor types", types.map((t) => ({ value: t.code, label: t.label }))) : null}
              </>
            )}
            {!compactFilters && showDateRange ? (
              <>
                <Input type="date" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
                <Input type="date" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
              </>
            ) : null}
            {exportName ? <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" /> CSV</Button> : null}
          </div>
        }
        footer={paged.footer}
      >
        <Table>
          {(!compactFilters || paged.rows.length > 0) ? (
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c}>{LABEL[c]}</TableHead>)}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {paged.rows.length === 0 ? (
              <EmptyRow cols={columns.length + 1}>
                {isLoading ? "Loading visits…" : (
                  <div className="grid justify-items-center gap-1.5">
                    <span className="mb-1 grid size-8 place-items-center rounded-full bg-primary-soft text-primary"><UsersRound className="size-3.5" /></span>
                    <p className="font-semibold text-foreground">{emptyTitle}</p>
                    {emptyDescription ? <p className="text-[11px]">{emptyDescription}</p> : null}
                  </div>
                )}
              </EmptyRow>
            ) : null}
            {paged.rows.map((v) => (
              <TableRow key={v.id}>
                {columns.map((c) => <TableCell key={c}>{cell(v, c)}</TableCell>)}
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" title="Details" aria-label={`Details for ${v.visitor_name}`} asChild>
                    <Link to="/vms-visit/$id" params={{ id: v.id }}><Eye className="size-4" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
