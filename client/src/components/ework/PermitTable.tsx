import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCard, usePaged, EmptyRow } from "@/components/common/TableCard";
import { StatusPill } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PERMIT_STATUS,
  PERMIT_STATUS_KEYS,
  PERMIT_TYPES,
  fmtDate,
} from "@/constants/permit-status";
import type { Permit } from "@/services/permits";

/** Shared permit list: requester view hides requester column, staff view shows it. */
export function PermitTable({
  rows,
  staff,
  initialStatus = "ALL",
  onEdit,
}: {
  rows: Permit[];
  staff?: boolean;
  initialStatus?: string;
  onEdit?: (permit: Permit) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (p) =>
        (status === "ALL" || p.status === status || p.permit_type === status) &&
        (!s ||
          [p.permit_no, p.service, p.work_description, p.location, p.vendor_name, p.raised_by_name]
            .join(" ")
            .toLowerCase()
            .includes(s)),
    );
  }, [rows, q, status]);
  const { rows: page, footer } = usePaged(filtered);
  const cols = (staff ? 9 : 8) + (onEdit ? 1 : 0);

  return (
    <TableCard
      search={q}
      onSearch={setQ}
      placeholder="Search permit, work, location, vendor"
      filterValue={status}
      onFilter={setStatus}
      filterOptions={[
        { value: "ALL", label: "All statuses" },
        ...PERMIT_TYPES.map((t) => ({ value: t, label: t })),
        ...PERMIT_STATUS_KEYS.map((k) => ({ value: k, label: PERMIT_STATUS[k]!.label })),
      ]}
      footer={footer}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permit</TableHead>
            {staff ? <TableHead>Requester</TableHead> : null}
            <TableHead>Work type</TableHead>
            <TableHead>Work</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.length === 0 ? <EmptyRow cols={cols}>No permits found.</EmptyRow> : null}
          {page.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-[12px]">{p.permit_no}</TableCell>
              {staff ? <TableCell>{p.raised_by_name}</TableCell> : null}
              <TableCell>
                <span
                  className={
                    p.permit_type === "Hot Work"
                      ? "font-semibold text-danger"
                      : "font-semibold text-info"
                  }
                >
                  {p.permit_type}
                </span>
              </TableCell>
              <TableCell className="max-w-[220px] truncate">
                {p.service || p.work_description}
              </TableCell>
              <TableCell>{p.vendor_name || "—"}</TableCell>
              <TableCell className="max-w-[180px] truncate">{p.location}</TableCell>
              <TableCell className="whitespace-nowrap text-[12px]">
                {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
              </TableCell>
              <TableCell>
                <StatusPill status={p.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center gap-1">
                  {onEdit ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit permit ${p.permit_no}`}
                      onClick={() => onEdit(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  ) : null}
                  <Link
                    to="/ework-permit/$id"
                    params={{ id: p.id }}
                    className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                    aria-label="View details"
                  >
                    <Eye className="size-4" />
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
