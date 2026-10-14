import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Eye,
  Mail,
  MoreHorizontal,
  Printer,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import type { Visit } from "@/lib/types";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatTime, initials } from "@/lib/format";
import { STATUS_LABEL, employeeName, userName, visitorOrigin } from "@/services/vms";
import { visitorTypeLabel } from "@/constants/visitor-types";
import { useVms } from "@/hooks/use-vms";

export interface VisitsTableProps {
  visits: Visit[];
  mode?: "visitors" | "requests";
  showFilters?: boolean;
  pageSize?: number;
  onApprove?: ((visit: Visit) => void) | undefined;
  onReject?: ((visit: Visit) => void) | undefined;
  onCancel?: ((visit: Visit) => void) | undefined;
  onPrint?: ((visit: Visit) => void) | undefined;
  onEmail?: ((visit: Visit) => void) | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function VisitsTable({
  visits,
  mode = "visitors",
  showFilters = true,
  pageSize = 8,
  onApprove,
  onReject,
  onCancel,
  onPrint,
  onEmail,
  emptyTitle = "No visitors found",
  emptyDescription = "Adjust your filters or create a new visitor request.",
}: VisitsTableProps) {
  const { branches } = useVms();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [branch, setBranch] = useState("ALL");
  const [date, setDate] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = visits.filter((v) => {
      if (status !== "ALL" && v.status !== status) return false;
      if (type !== "ALL" && v.visitorType !== type) return false;
      if (branch !== "ALL" && v.branchId !== branch) return false;
      if (date && v.visitDate !== date) return false;
      if (!q) return true;
      return [v.name, v.visitorId ?? "", v.requestId, v.company ?? "", visitorOrigin(v), employeeName(v.hostEmployeeId)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return rows.sort((a, b) =>
      sortDesc ? b.visitDate.localeCompare(a.visitDate) : a.visitDate.localeCompare(b.visitDate),
    );
  }, [visits, query, status, type, branch, date, sortDesc]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const RowActions = ({ v }: { v: Visit }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onSelect={() => {
            void navigate({ to: "/vms-visit/$id", params: { id: v.id } });
          }}
        >
          <Eye className="size-4" /> View details
        </DropdownMenuItem>
        {onApprove && v.status === "PENDING" ? (
          <DropdownMenuItem onClick={() => onApprove(v)}>
            <CheckCircle2 className="size-4" /> Approve
          </DropdownMenuItem>
        ) : null}
        {onReject && v.status === "PENDING" ? (
          <DropdownMenuItem onClick={() => onReject(v)}>
            <XCircle className="size-4" /> Reject
          </DropdownMenuItem>
        ) : null}
        {onEmail && v.visitorId ? (
          <DropdownMenuItem onClick={() => onEmail(v)}>
            <Mail className="size-4" /> Resend mail
          </DropdownMenuItem>
        ) : null}
        {onPrint && (v.status === "CHECKED_IN" || v.status === "CHECKED_OUT") ? (
          <DropdownMenuItem onClick={() => onPrint(v)}>
            <Printer className="size-4" /> Issue card
          </DropdownMenuItem>
        ) : null}
        {onCancel && ["PENDING", "APPROVED"].includes(v.status) ? (
          <DropdownMenuItem onClick={() => onCancel(v)}>
            <Ban className="size-4" /> Cancel visit
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="surface-card overflow-hidden">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-[210px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search visitor, ID, company, host"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Visitor type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All visitor types</SelectItem>
              <SelectItem value="EMPLOYEE">Internal Visitor</SelectItem>
              <SelectItem value="EXTERNAL">External Visitor</SelectItem>
            </SelectContent>
          </Select>
          <Select value={branch} onValueChange={(v) => { setBranch(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            className="w-[150px]"
          />
          {query || status !== "ALL" || type !== "ALL" || branch !== "ALL" || date ? (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setStatus("ALL");
                setType("ALL");
                setBranch("ALL");
                setDate("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-muted/60 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">{mode === "requests" ? "Request ID" : "Visitor ID"}</th>
                  <th className="px-4 py-3 font-semibold">Visitor</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  {mode === "visitors" ? <th className="px-4 py-3 font-semibold">Company / Source</th> : null}
                  <th className="px-4 py-3 font-semibold">Host</th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSortDesc((s) => !s)}
                    >
                      Visit date <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  {mode === "visitors" ? (
                    <>
                      <th className="px-4 py-3 font-semibold">Check-in</th>
                      <th className="px-4 py-3 font-semibold">Check-out</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 font-semibold">Requested by</th>
                      <th className="px-4 py-3 font-semibold">Requested</th>
                    </>
                  )}
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {mode === "requests" ? v.requestId : (v.visitorId ?? "—")}
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/vms-visit/$id" params={{ id: v.id }} className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-[11px] font-bold text-primary">
                          {initials(v.name)}
                        </span>
                        <span className="leading-tight">
                          <span className="block font-semibold">{v.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{v.designation}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {visitorTypeLabel(v.visitorType, v.visitorType)}
                    </td>
                    {mode === "visitors" ? (
                      <td className="px-4 py-3 text-muted-foreground">{visitorOrigin(v)}</td>
                    ) : null}
                    <td className="px-4 py-3 text-muted-foreground">{employeeName(v.hostEmployeeId)}</td>
                    <td className="px-4 py-3">{formatDate(v.visitDate)}</td>
                    {mode === "visitors" ? (
                      <>
                        <td className="px-4 py-3 text-muted-foreground">{formatTime(v.checkInAt)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatTime(v.checkOutAt)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-muted-foreground">{userName(v.requestedById)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(v.requestedAt)}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onApprove && v.status === "PENDING" ? (
                          <Button size="sm" onClick={() => onApprove(v)}>
                            Approve
                          </Button>
                        ) : null}
                        {onPrint && v.status === "CHECKED_IN" ? (
                          <Button size="sm" variant="outline" onClick={() => onPrint(v)}>
                            Issue card
                          </Button>
                        ) : null}
                        <RowActions v={v} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {rows.map((v) => (
              <div key={v.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-[12px] font-bold text-primary">
                    {initials(v.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to="/vms-visit/$id" params={{ id: v.id }} className="block truncate font-semibold">
                      {v.name}
                    </Link>
                    <p className="truncate text-[12px] text-muted-foreground">{visitorOrigin(v)}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {mode === "requests" ? v.requestId : (v.visitorId ?? "—")}
                    </p>
                  </div>
                  <RowActions v={v} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <StatusBadge status={v.status} />
                  <span>{formatDate(v.visitDate)}</span>
                  <span>· Host {employeeName(v.hostEmployeeId)}</span>
                </div>
                {onApprove && v.status === "PENDING" ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => onApprove(v)}>
                      Approve
                    </Button>
                    {onReject ? (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => onReject(v)}>
                        Reject
                      </Button>
                    ) : null}
                  </div>
                ) : onPrint && v.status === "CHECKED_IN" ? (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => onPrint(v)}>
                      Issue card
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
            <p>
              Showing {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} of{" "}
              {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                Previous
              </Button>
              <span>
                Page {current} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
