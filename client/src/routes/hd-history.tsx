import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { TableCard, usePaged } from "@/components/common/TableCard";
import { TicketTable } from "@/components/helpdesk/TicketTable";
import { useApp } from "@/context/app-context";
import { ticketService, type HdTicket } from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-history")({
  head: () => ({
    meta: [
      { title: "Ticket history — FCM Helpdesk" },
      { name: "description", content: "Historical helpdesk tickets." },
      { property: "og:title", content: "Ticket history" },
      { property: "og:description", content: "Historical helpdesk tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "SERVICE_PROVIDER", "EMPLOYEE"]}>
      <HistoryPage />
    </AppPage>
  ),
});

function HistoryPage() {
  const { user } = useApp();
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const scope = user?.role === "SERVICE_PROVIDER" ? "assigned" : user?.role === "EMPLOYEE" ? "mine" : "all";

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    ticketService.list(scope, user)
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [user, scope]);

  const closed = useMemo(
    () => tickets
      .filter((t) => t.status === "CLOSED")
      .filter((t) => !q.trim() || [t.ticket_no, t.category_name, t.subcategory_name, t.raiser_name, t.provider_name].join(" ").toLowerCase().includes(q.trim().toLowerCase())),
    [tickets, q],
  );
  const paged = usePaged(closed);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="FCM Helpdesk" title="Ticket history" subtitle="Completed and closed tickets." />
      <TableCard search={q} onSearch={(v) => { setQ(v); paged.reset(); }} placeholder="Search ticket, category, provider" footer={paged.footer}>
        {loading ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Loading history…</p>
        ) : (
          <TicketTable tickets={paged.rows} empty="No closed tickets yet." />
        )}
      </TableCard>
    </div>
  );
}
