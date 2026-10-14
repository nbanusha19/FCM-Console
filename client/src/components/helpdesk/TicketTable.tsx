import { useNavigate } from "@tanstack/react-router";
import { Eye, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusBadge";
import { EmptyRow } from "@/components/common/TableCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HdTicket } from "@/services/helpdesk-api";

export function TicketTable({ tickets, empty }: { tickets: HdTicket[]; empty: string }) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticket</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Sub-category</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Raised</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.length === 0 ? (
          <EmptyRow cols={9}>
            <LifeBuoy className="mx-auto mb-2 size-8" />
            {empty}
          </EmptyRow>
        ) : null}
        {tickets.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-mono text-[12px] text-muted-foreground">{t.ticket_no}</TableCell>
            <TableCell className="font-semibold">{t.category_name}</TableCell>
            <TableCell className="text-[13px]">{t.subcategory_name || "—"}</TableCell>
            <TableCell className="text-[13px]">{t.location || "—"}</TableCell>
            <TableCell className="text-[13px]">{t.priority ? t.priority.charAt(0) + t.priority.slice(1).toLowerCase() : "Medium"}</TableCell>
            <TableCell className="text-[13px]">{t.provider_name || "Unassigned"}</TableCell>
            <TableCell className="text-[13px]">{new Date(t.created_at).toLocaleString()}</TableCell>
            <TableCell><StatusPill status={t.status} /></TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" title="Open ticket" aria-label={`Open ${t.ticket_no}`} onClick={() => navigate({ to: "/hd-ticket/$id", params: { id: t.id } })}>
                  <Eye className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
