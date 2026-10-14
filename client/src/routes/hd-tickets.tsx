import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { TableCard, usePaged } from "@/components/common/TableCard";
import { TicketTable } from "@/components/helpdesk/TicketTable";
import { useApp } from "@/context/app-context";
import { TICKET_STATUS, TICKET_STATUS_KEYS } from "@/constants/ticket-status";
import { ticketService, type HdTicket } from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-tickets")({
  head: () => ({
    meta: [
      { title: "Tickets — FCM Helpdesk" },
      { name: "description", content: "Search and track helpdesk tickets." },
      { property: "og:title", content: "Helpdesk tickets" },
      { property: "og:description", content: "Search and track helpdesk tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE"]}>
      <TicketsPage />
    </AppPage>
  ),
});

function TicketsPage() {
  const { user } = useApp();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    ticketService
      .list(isAdmin ? "all" : "mine", user)
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [user, isAdmin]);

  const visible = useMemo(
    () =>
      tickets
        .filter((t) => filter === "ALL" || t.status === filter)
        .filter(
          (t) =>
            !q.trim() ||
            [
              t.ticket_no,
              t.category_name,
              t.subcategory_name,
              t.description,
              t.raiser_name,
              t.provider_name,
              t.location,
            ]
              .join(" ")
              .toLowerCase()
              .includes(q.trim().toLowerCase()),
        ),
    [tickets, filter, q],
  );
  const paged = usePaged(visible);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title={isAdmin ? "All tickets" : "My tickets"}
        subtitle={
          isAdmin ? "Every service request across the facility." : "Tickets you have raised."
        }
      />
      <TableCard
        search={q}
        onSearch={(v) => {
          setQ(v);
          paged.reset();
        }}
        placeholder="Search ticket, category, provider, location"
        filterValue={filter}
        onFilter={(v) => {
          setFilter(v);
          paged.reset();
        }}
        filterOptions={[
          { value: "ALL", label: `All statuses (${tickets.length})` },
          ...TICKET_STATUS_KEYS.map((s) => ({
            value: s,
            label: `${TICKET_STATUS[s]!.label} (${tickets.filter((t) => t.status === s).length})`,
          })),
        ]}
        footer={paged.footer}
      >
        {loading ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            Loading tickets…
          </p>
        ) : (
          <TicketTable
            tickets={paged.rows}
            empty={isAdmin ? "No tickets found." : "You have not raised any service requests yet."}
          />
        )}
      </TableCard>
    </div>
  );
}
