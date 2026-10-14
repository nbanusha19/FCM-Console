import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { TableCard, usePaged } from "@/components/common/TableCard";
import { TicketTable } from "@/components/helpdesk/TicketTable";
import { useApp } from "@/context/app-context";
import { TICKET_STATUS, TICKET_STATUS_KEYS } from "@/constants/ticket-status";
import { ticketService, type HdTicket } from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-assigned")({
  head: () => ({
    meta: [
      { title: "Service request queue — FCM Helpdesk" },
      { name: "description", content: "Unassigned Helpdesk requests and tickets assigned to your service team." },
      { property: "og:title", content: "Service request queue" },
      { property: "og:description", content: "Helpdesk requests available to your service team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["SERVICE_PROVIDER", "ADMIN"]}>
      <AssignedPage />
    </AppPage>
  ),
});

function AssignedPage() {
  const { user } = useApp();
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    let active = true;
    const refresh = () => {
      ticketService.list("assigned", user)
        .then((rows) => {
          if (active) {
            setTickets(rows);
            setLoadError("");
          }
        })
        .catch((error: unknown) => {
          if (active) setLoadError(error instanceof Error ? error.message : "Unable to load the service request queue.");
        })
        .finally(() => { if (active) setLoading(false); });
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  const visible = useMemo(
    () => tickets
      .filter((t) => filter === "ALL" || t.status === filter)
      .filter((t) => !q.trim() || [t.ticket_no, t.category_name, t.subcategory_name, t.description, t.raiser_name, t.location].join(" ").toLowerCase().includes(q.trim().toLowerCase())),
    [tickets, filter, q],
  );
  const paged = usePaged(visible);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="FCM Helpdesk" title="Service request queue" subtitle="Claim a new request or continue work on tickets assigned to you." />
      <TableCard
        search={q}
        onSearch={(v) => { setQ(v); paged.reset(); }}
        placeholder="Search ticket, category, location"
        filterValue={filter}
        onFilter={(v) => { setFilter(v); paged.reset(); }}
        filterOptions={[{ value: "ALL", label: `All statuses (${tickets.length})` }, ...TICKET_STATUS_KEYS.map((s) => ({ value: s, label: `${TICKET_STATUS[s]!.label} (${tickets.filter((t) => t.status === s).length})` }))]}
        footer={paged.footer}
      >
        {loadError ? <p role="alert" className="px-4 py-3 text-[13px] text-destructive">{loadError}</p> : null}
        {loading ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Loading tickets…</p>
        ) : (
          <TicketTable tickets={paged.rows} empty="No unassigned or matching tickets are available." />
        )}
      </TableCard>
    </div>
  );
}
