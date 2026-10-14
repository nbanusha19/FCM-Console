import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { EmptyRow, TableCard, usePaged } from "@/components/common/TableCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CARD_STATUS } from "@/constants/visit-status";
import { listGuestCards, listVisitRequests, setCardStatus } from "@/services/visitor-requests";

export const Route = createFileRoute("/vms-cards")({
  head: () => ({
    meta: [
      { title: "Guest cards — FCM Console" },
      { name: "description", content: "Temporary guest ID cards: available, in use, returned and lost." },
      { property: "og:title", content: "Guest cards — FCM Console" },
      { property: "og:description", content: "Track temporary visitor cards through their lifecycle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <Cards />
    </AppPage>
  ),
});

function Cards() {
  const qc = useQueryClient();
  const { data: cards = [], isLoading } = useQuery({ queryKey: ["guest-cards"], queryFn: listGuestCards });
  const { data: visits = [] } = useQuery({ queryKey: ["visit-requests"], queryFn: listVisitRequests });
  const [q, setQ] = useState("");
  const [f, setF] = useState("ALL");
  const rows = cards.filter((c) => (f === "ALL" || c.status === f) && c.code.toLowerCase().includes(q.toLowerCase()));
  const paged = usePaged(rows, 10);
  const move = async (id: string, status: string, visitId: string | null) => {
    try { await setCardStatus(id, status, status === "IN_USE" ? visitId : null); toast.success(`Card marked ${CARD_STATUS[status]!.label}`); await qc.invalidateQueries({ queryKey: ["guest-cards"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
  };
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Visitor Management" title="Guest cards" subtitle="Manage card inventory. Security issues cards after visitors check in with their emailed QR." />
      <TableCard
        search={q} onSearch={setQ} placeholder="Search card number"
        filterValue={f} onFilter={setF}
        filterOptions={[{ value: "ALL", label: `All (${cards.length})` }, ...Object.entries(CARD_STATUS).map(([k, d]) => ({ value: k, label: `${d.label} (${cards.filter((c) => c.status === k).length})` }))]}
        footer={paged.footer}
      >
        <Table>
          <TableHeader><TableRow><TableHead>Card</TableHead><TableHead>Status</TableHead><TableHead>Current visitor</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {paged.rows.length === 0 ? <EmptyRow cols={5}>{isLoading ? "Loading…" : "No cards."}</EmptyRow> : paged.rows.map((c) => {
              const v = visits.find((x) => x.id === c.current_visit_id);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-foreground">{c.code}</TableCell>
                  <TableCell><StatusPill status={c.status} /></TableCell>
                  <TableCell>{v ? `${v.visitor_name} · ${v.request_no}` : "—"}</TableCell>
                  <TableCell>{new Date(c.updated_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {CARD_STATUS[c.status]?.next.filter((n) => n !== "IN_USE").map((n) => (
                        <Button key={n} size="sm" variant="outline" onClick={() => void move(c.id, n, c.current_visit_id)}>{n === "LOST" ? "Mark lost" : n === "RETURNED" ? "Returned" : "Make available"}</Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
