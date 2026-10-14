import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Building2, CalendarDays, CheckCircle2, Clock3, ListChecks, UsersRound, Wrench } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { useApp } from "@/context/app-context";
import { reportService, ticketService, type HdTicket } from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-reports")({
  head: () => ({
    meta: [
      { title: "Reports — FCM Helpdesk" },
      { name: "description", content: "Helpdesk ticket reports by category, provider and date." },
      { property: "og:title", content: "Helpdesk reports" },
      { property: "og:description", content: "Helpdesk ticket reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <ReportsPage />
    </AppPage>
  ),
});

function ReportsPage() {
  const { user } = useApp();
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    ticketService.list("all", user)
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [user]);

  const summary = useMemo(() => reportService.summary(tickets), [tickets]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="FCM Helpdesk" title="Reports" subtitle="Ticket summary by category, provider and date." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total tickets" value={loading ? "…" : summary.total} icon={ListChecks} tone="brand" />
        <StatCard label="Open" value={loading ? "…" : summary.open} icon={Clock3} tone="warning" />
        <StatCard label="In progress" value={loading ? "…" : summary.inProgress} icon={Wrench} tone="info" />
        <StatCard label="Resolved" value={loading ? "…" : summary.resolved} icon={CheckCircle2} tone="success" />
        <StatCard label="Closed" value={loading ? "…" : summary.closed} icon={CheckCircle2} tone="neutral" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ReportBlock title="By category" entries={summary.byCategory} icon={Building2} color="#0284c7" />
        <ReportBlock title="By provider" entries={summary.byProvider} icon={UsersRound} color="#8b5cf6" />
        <ReportBlock
          title="By date"
          entries={[...summary.byDate].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)}
          icon={CalendarDays}
          color="#10b981"
        />
      </div>
    </div>
  );
}

function ReportBlock({
  title,
  entries,
  icon: Icon,
  color,
}: {
  title: string;
  entries: [string, number][];
  icon: typeof BarChart3;
  color: string;
}) {
  const data = entries.map(([label, value]) => ({ label, value }));
  const chartHeight = Math.max(190, data.length * 34 + 28);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
          <span className="grid size-8 place-items-center rounded-lg" style={{ color, backgroundColor: `${color}1a` }}>
            <Icon className="size-4" />
          </span>
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {entries.reduce((total, [, value]) => total + value, 0)} tickets
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">No data yet.</p>
      ) : (
        <div className="p-4">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.45 }}
                  formatter={(value) => [value, "Tickets"]}
                  contentStyle={{ borderRadius: 12, borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                />
                <Bar dataKey="value" name="Tickets" radius={[0, 6, 6, 0]} maxBarSize={20}>
                  {data.map((entry) => <Cell key={entry.label} fill={color} fillOpacity={0.78} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2 border-t border-border pt-3">
            {data.map((entry) => (
              <li key={entry.label} className="flex max-w-full items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[10px]">
                <span className="truncate text-muted-foreground">{entry.label}</span>
                <span className="font-bold tabular-nums">{entry.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
