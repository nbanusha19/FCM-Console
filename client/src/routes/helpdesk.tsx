import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock, QrCode, Search, Wrench } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TICKET_STATUS_KEYS, ticketStatusLabel } from "@/constants/ticket-status";
import { useApp } from "@/context/app-context";
import { ticketService, type HdTicket } from "@/services/helpdesk-api";

export const Route = createFileRoute("/helpdesk")({
  head: () => ({
    meta: [
      { title: "FCM Helpdesk — Service requests & tickets" },
      {
        name: "description",
        content: "Raise facility service requests, track tickets and manage providers.",
      },
      { property: "og:title", content: "FCM Helpdesk" },
      { property: "og:description", content: "Enterprise service request and ticket management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SERVICE_PROVIDER"]}>
      <HelpdeskDashboard />
    </AppPage>
  ),
});

function HelpdeskDashboard() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const isProvider = user?.role === "SERVICE_PROVIDER";
  const isAdmin = user?.role === "ADMIN";
  const scope = isProvider ? "assigned" : isAdmin ? "all" : "mine";

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    ticketService
      .list(scope, user)
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [user, scope]);

  const visible = useMemo(
    () =>
      tickets.filter(
        (t) =>
          !q.trim() ||
          [t.ticket_no, t.category_name, t.subcategory_name, t.raiser_name, t.location]
            .join(" ")
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
      ),
    [tickets, q],
  );
  const countsByStatus = useMemo(
    () =>
      Object.fromEntries(
        TICKET_STATUS_KEYS.map((status) => [
          status,
          visible.filter((ticket) => ticket.status === status).length,
        ]),
      ) as Record<(typeof TICKET_STATUS_KEYS)[number], number>,
    [visible],
  );
  const statusCounts = useMemo(() => {
    if (isAdmin) {
      return [
        { status: "NEW", name: "Open", count: countsByStatus.NEW },
        { status: "ASSIGNED", name: ticketStatusLabel("ASSIGNED"), count: countsByStatus.ASSIGNED },
        {
          status: "IN_PROGRESS",
          name: ticketStatusLabel("IN_PROGRESS"),
          count: countsByStatus.IN_PROGRESS,
        },
        { status: "RESOLVED", name: ticketStatusLabel("RESOLVED"), count: countsByStatus.RESOLVED },
        { status: "CLOSED", name: ticketStatusLabel("CLOSED"), count: countsByStatus.CLOSED },
      ];
    }
    if (!isProvider) {
      return [
        { status: "NEW", name: "Open", count: countsByStatus.NEW },
        { status: "ASSIGNED", name: ticketStatusLabel("ASSIGNED"), count: countsByStatus.ASSIGNED },
        {
          status: "IN_PROGRESS",
          name: ticketStatusLabel("IN_PROGRESS"),
          count: countsByStatus.IN_PROGRESS,
        },
        {
          status: "COMPLETED",
          name: "Completed",
          count: countsByStatus.RESOLVED + countsByStatus.CLOSED,
        },
      ];
    }
    return TICKET_STATUS_KEYS.map((status) => ({
      status,
      name: status === "NEW" ? "Open" : ticketStatusLabel(status),
      count:
        status === "ASSIGNED"
          ? countsByStatus.ASSIGNED + countsByStatus.IN_PROGRESS
          : countsByStatus[status],
    }));
  }, [countsByStatus, isAdmin, isProvider]);
  const statusColors: Record<string, string> = {
    OPEN: "#f59e0b",
    NEW: "#f59e0b",
    ASSIGNED: "#0ea5e9",
    IN_PROGRESS: "#6366f1",
    RESOLVED: "#10b981",
    CLOSED: "#64748b",
    COMPLETED: "#10b981",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title={isProvider ? "Service provider dashboard" : "Helpdesk dashboard"}
        subtitle={
          isProvider
            ? "Tickets assigned to your team."
            : isAdmin
              ? "Every service request across the facility."
              : "Raise a request and follow it through to closure."
        }
        actions={
          <>
            {isAdmin ? (
              <Button variant="outline" onClick={() => navigate({ to: "/hd-qr" })}>
                <QrCode className="size-4" /> Helpdesk QR
              </Button>
            ) : user?.role === "BRANCH_MANAGER" || user?.role === "EMPLOYEE" ? (
              <Button onClick={() => navigate({ to: "/hd-raise" })}>
                <Wrench className="size-4" /> Raise request
              </Button>
            ) : null}
          </>
        }
      />

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isAdmin || isProvider ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
      >
        {statusCounts.map((entry) => {
          const icon =
            entry.status === "IN_PROGRESS"
              ? Activity
              : entry.status === "RESOLVED" ||
                  entry.status === "CLOSED" ||
                  entry.status === "COMPLETED"
                ? CheckCircle2
                : entry.status === "ASSIGNED"
                  ? Wrench
                  : Clock;
          const tone =
            entry.status === "IN_PROGRESS" || entry.status === "ASSIGNED"
              ? "info"
              : entry.status === "RESOLVED" || entry.status === "COMPLETED"
                ? "success"
                : entry.status === "CLOSED"
                  ? "neutral"
                  : "warning";
          return (
            <StatCard
              key={entry.status}
              label={entry.name}
              value={entry.count}
              icon={icon}
              tone={tone}
            />
          );
        })}
      </div>

      <section className="surface-card space-y-5 p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search ticket, category, location"
            className="pl-9"
            aria-label="Search tickets for status charts"
          />
        </div>
        {loading ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            Loading ticket status…
          </p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            {tickets.length === 0
              ? isProvider
                ? "No tickets are currently assigned to you."
                : "You have not raised any service requests yet."
              : "No tickets match your search."}
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <h2 className="mb-3 font-display text-[15px] font-bold">
                {isProvider ? "Tickets by workload" : "Tickets by status"}
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                    >
                      {statusCounts.map((entry) => (
                        <Cell key={entry.status} fill={statusColors[entry.status] ?? "#64748b"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value, "Tickets"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
                {statusCounts.map((entry) => (
                  <li key={entry.status} className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: statusColors[entry.status] ?? "#64748b" }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="ml-auto font-semibold tabular-nums">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h2 className="mb-3 font-display text-[15px] font-bold">
                {isProvider ? "Workload breakdown" : "Ticket status breakdown"}
              </h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusCounts} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [value, "Tickets"]} />
                    <Bar dataKey="count" name="Tickets" radius={[5, 5, 0, 0]}>
                      {statusCounts.map((entry) => (
                        <Cell key={entry.status} fill={statusColors[entry.status] ?? "#64748b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {isProvider ? (
              <p className="text-[12px] text-muted-foreground lg:col-span-2">
                Assigned includes in-progress tickets, so workload groups may overlap.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
