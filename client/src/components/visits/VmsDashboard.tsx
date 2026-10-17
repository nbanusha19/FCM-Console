import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QrBlock } from "@/components/common/QrBlock";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/context/app-context";
import { isFinished } from "@/constants/visit-status";
import { initials, relativeTime } from "@/lib/format";
import {
  canDecide,
  canCreateVisitRequest,
  listVisitEvents,
  listVisitRequests,
  type VisitRequest,
} from "@/services/visitor-requests";

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const clockTime = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

type DashboardList = "today" | "inside" | "pending" | "upcoming";

export function VmsDashboard() {
  const { user } = useApp();
  const [openList, setOpenList] = useState<DashboardList | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["visit-requests"],
    queryFn: listVisitRequests,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["visit-events", "recent"],
    queryFn: () => listVisitEvents(undefined, 5),
    enabled: user?.role !== "EMPLOYEE",
  });
  const today = iso(new Date());
  const todayVisits = data
    .filter((visit) => visit.visit_date === today && !isFinished(visit.status))
    .sort((a, b) => a.expected_arrival.localeCompare(b.expected_arrival));
  const inside = data.filter((visit) => visit.status === "CHECKED_IN" && !visit.checked_out_at);
  const canViewApprovals = ["ADMIN", "BRANCH_MANAGER"].includes(user?.role ?? "");
  const pending = canViewApprovals
    ? data.filter(
        (visit) =>
          visit.status === "PENDING" &&
          canDecide(user, visit) &&
          (visit.host_id === user?.id || user?.role !== "EMPLOYEE"),
      )
    : data.filter((visit) => visit.status === "PENDING");
  const upcoming = data.filter(
    (visit) => ["APPROVED", "CARD_ISSUED"].includes(visit.status) && visit.visit_date >= today,
  ).length;
  const nextVisit =
    todayVisits.find((visit) => visit.status === "CHECKED_IN") ??
    todayVisits[0] ??
    data.find((visit) => ["APPROVED", "CARD_ISSUED"].includes(visit.status));

  const traffic = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = iso(date);
      const visitors = data.filter(
        (visit) => visit.visit_date === key && !isFinished(visit.status),
      ).length;
      const completedCount = data.filter(
        (visit) => visit.checked_out_at && iso(new Date(visit.checked_out_at)) === key,
      ).length;
      return {
        day: date.toLocaleDateString(undefined, { weekday: "short" }),
        visitors,
        completed: completedCount,
      };
    });
    return days;
  }, [data]);

  const nameOf = (visitId: string) =>
    data.find((visit) => visit.id === visitId)?.visitor_name ?? "Visitor";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            {greeting}, {user?.name ?? "there"}
          </p>
          <h1 className="mt-0.5 font-display text-[24px] font-extrabold leading-tight">
            Visitor operations overview
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Live view of expected visitors, people on site and requests waiting on you.
          </p>
        </div>
        <div className="flex gap-2">
          {canCreateVisitRequest(user) ? (
            <Button asChild size="sm">
              <Link to="/visitors" search={{ newRequest: true }}>
                <Plus className="size-3.5" /> New visitor request
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <section aria-label="Visitor summary" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          onClick={() => setOpenList("today")}
          label="Visitors today"
          value={todayVisits.length}
          caption={`${todayVisits.filter((visit) => visit.status !== "CHECKED_IN").length} still expected`}
          icon={UsersRound}
          tone="blue"
        />
        <SummaryStat
          onClick={() => setOpenList("inside")}
          label="Currently inside"
          value={inside.length}
          caption="All within schedule"
          icon={UsersRound}
          tone="green"
        />
        <SummaryStat
          onClick={() => setOpenList("pending")}
          label="Pending approvals"
          value={pending.length}
          caption="Requests waiting"
          icon={Clock3}
          tone="amber"
        />
        <SummaryStat
          onClick={() => setOpenList("upcoming")}
          label="Upcoming visits"
          value={upcoming}
          caption="Approved today and future visits"
          icon={CalendarClock}
          tone="blue"
        />
      </section>

      <DashboardVisitsDialog
        list={openList}
        visits={data}
        today={today}
        onOpenChange={(open) => !open && setOpenList(null)}
      />

      <div className="grid gap-2.5">
        <div className="grid gap-2.5 lg:grid-cols-[3fr_2fr]">
          <section className="surface-card min-w-0 p-3.5" aria-label="Visitor traffic">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-[13px] font-bold">Visitor traffic</h2>
                <p className="text-[10px] text-muted-foreground">
                  Last 7 days of scheduled visits and completions
                </p>
              </div>
              <div className="flex gap-3 pt-1 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <i className="size-1.5 rounded-full bg-blue-600" /> Visitors
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-1.5 rounded-full bg-emerald-500" /> Completed
                </span>
              </div>
            </div>
            <div className="h-36.25 w-full" aria-busy={isLoading}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={traffic} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="#e7ebf1" strokeDasharray="2 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 9, fill: "#748094" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 9, fill: "#748094" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, borderColor: "#e7ebf1", fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="visitors"
                    name="Visitors"
                    stroke="#2563eb"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="surface-card min-w-0 p-3.5" aria-label="Today's schedule">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-bold">Today&apos;s schedule</h2>
              <Link
                to="/vms-today"
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {todayVisits.length ? (
              <ul className="divide-y divide-border">
                {todayVisits.slice(0, 5).map((visit) => (
                  <li key={visit.id} className="flex items-center gap-2 py-2">
                    <time className="w-12 shrink-0 text-[9px] text-muted-foreground">
                      {clockTime(visit.expected_arrival)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold">{visit.visitor_name}</p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {visit.company || visit.purpose || "Visitor"}
                      </p>
                    </div>
                    <StatusPill status={visit.status} className="px-1.5 py-0.5 text-[9px]" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-7 text-center text-[11px] text-muted-foreground">
                No visits scheduled for today.
              </p>
            )}
          </section>
        </div>
        <div className="grid gap-2.5 lg:grid-cols-[3fr_2fr]">
          <section className="surface-card min-h-62.5 p-3.5" aria-label="Pending approvals">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-bold">Pending approvals</h2>
              <Link
                to="/vms-approvals"
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Open queue
              </Link>
            </div>
            {pending.length ? (
              <ul className="mt-2 divide-y divide-border">
                {pending.slice(0, 5).map((visit) => (
                  <li key={visit.id} className="flex items-center gap-3 py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                      {initials(visit.visitor_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold">{visit.visitor_name}</p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {visit.company} · {visit.visit_date}
                      </p>
                    </div>
                    <StatusPill status={visit.status} className="px-1.5 py-0.5 text-[9px]" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-51.25 place-content-center justify-items-center text-center">
                <span className="mb-2 grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
                  <CheckCircle2 className="size-4" />
                </span>
                <p className="text-[11px] font-semibold">No requests waiting</p>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  New visitor requests will show up here for approval.
                </p>
              </div>
            )}
          </section>

          <div className="grid content-start gap-2.5">
            {nextVisit ? (
              <VisitorPass visit={nextVisit} />
            ) : (
              <section className="surface-card grid min-h-41.25 place-items-center p-4 text-center">
                <p className="text-[11px] text-muted-foreground">No visitor pass to display.</p>
              </section>
            )}
            <section className="surface-card p-3.5" aria-label="Recent activity">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-[13px] font-bold">Recent activity</h2>
                <Link
                  to="/vms-history"
                  aria-label="View visitor history"
                  className="text-primary hover:underline"
                >
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
              {events.length ? (
                <ul className="divide-y divide-border">
                  {events.map((event) => (
                    <li key={event.id} className="flex gap-2 py-1.5">
                      <Activity className="mt-0.5 size-3 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px]">
                          <b>{nameOf(event.visit_id)}</b> · {event.note || event.event}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {relativeTime(event.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-[10px] text-muted-foreground">No recent activity.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  onClick,
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  onClick: () => void;
  label: string;
  value: number;
  caption: string;
  icon: typeof UsersRound;
  tone: "blue" | "green" | "amber";
}) {
  const tones = {
    blue: { icon: "bg-info-soft text-info", accent: "from-info-soft/60 before:bg-info" },
    green: {
      icon: "bg-success-soft text-success",
      accent: "from-success-soft/60 before:bg-success",
    },
    amber: {
      icon: "bg-warning-soft text-warning",
      accent: "from-warning-soft/60 before:bg-warning",
    },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      aria-label={`${label}: ${value}. Show visitor list.`}
    >
      <section
        className={`group relative isolate overflow-hidden surface-card bg-linear-to-br via-card to-card p-3.5 transition-all duration-300 ease-out before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[''] hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none ${tones[tone].accent}`}
      >
        <div className="relative flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <span
            className={`grid size-6 place-items-center rounded-md transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none ${tones[tone].icon}`}
          >
            <Icon className="size-3.5" />
          </span>
        </div>
        <p className="relative mt-1 font-display text-[22px] font-extrabold leading-none">
          {value}
        </p>
        <p
          className={`relative mt-1 text-[9px] ${tone === "green" ? "font-semibold text-success" : "text-muted-foreground"}`}
        >
          {caption}
        </p>
      </section>
    </button>
  );
}

function DashboardVisitsDialog({
  list,
  visits,
  today,
  onOpenChange,
}: {
  list: DashboardList | null;
  visits: VisitRequest[];
  today: string;
  onOpenChange: (open: boolean) => void;
}) {
  const titles: Record<DashboardList, string> = {
    today: "Visitors today",
    inside: "Currently inside",
    pending: "Pending approvals",
    upcoming: "Upcoming visits",
  };
  const filteredVisits = visits
    .filter((visit) => {
      switch (list) {
        case "today":
          return visit.visit_date === today && !isFinished(visit.status);
        case "inside":
          return visit.status === "CHECKED_IN" && !visit.checked_out_at;
        case "pending":
          return visit.status === "PENDING";
        case "upcoming":
          return ["APPROVED", "CARD_ISSUED"].includes(visit.status) && visit.visit_date >= today;
        default:
          return false;
      }
    })
    .sort((a, b) =>
      `${a.visit_date} ${a.expected_arrival}`.localeCompare(
        `${b.visit_date} ${b.expected_arrival}`,
      ),
    );

  return (
    <Dialog open={list !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{list ? titles[list] : "Visitors"}</DialogTitle>
          <DialogDescription>
            {filteredVisits.length} visitor{filteredVisits.length === 1 ? "" : "s"} in this list.
          </DialogDescription>
        </DialogHeader>
        {filteredVisits.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Visitor</th>
                  <th className="px-3 py-2 font-medium">Visitor ID</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Host</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td className="px-3 py-2">
                      <Link
                        to="/vms-visit/$id"
                        params={{ id: visit.id }}
                        className="font-semibold hover:text-primary hover:underline"
                      >
                        {visit.visitor_name}
                      </Link>
                      <p className="text-[10px] text-muted-foreground">
                        {visit.company || visit.location || "Visitor"}
                      </p>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {visit.visitor_code || visit.request_no}
                    </td>
                    <td className="px-3 py-2">{visit.visit_date}</td>
                    <td className="px-3 py-2">
                      {clockTime(visit.expected_arrival)} – {clockTime(visit.expected_departure)}
                    </td>
                    <td className="px-3 py-2">{visit.host_name || "—"}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={visit.status} className="px-1.5 py-0.5 text-[9px]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No visitors are in this list.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VisitorPass({ visit }: { visit: VisitRequest }) {
  return (
    <section className="relative overflow-hidden rounded-lg bg-linear-to-br from-blue-600 to-blue-700 p-3 text-white shadow-lg shadow-blue-900/15">
      <div className="flex items-center justify-between text-[8px] font-semibold uppercase tracking-[0.12em] text-white/75">
        <span>VMS visitor</span>
        <span className="font-mono">{visit.request_no || visit.visitor_code}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/20 text-[12px] font-bold">
          {initials(visit.visitor_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">{visit.visitor_name}</p>
          <p className="truncate text-[9px] text-white/75">
            {visit.company || visit.designation || "Visitor"}
          </p>
        </div>
        <StatusPill
          status={visit.status}
          className="bg-white/15 px-1.5 py-0.5 text-[8px] text-white"
        />
      </div>
      <dl className="mt-2.5 space-y-1 text-[8px]">
        <PassDetail label="Host" value={visit.host_name} />
        <PassDetail label="Branch" value={visit.location} />
        <PassDetail label="Visit date" value={visit.visit_date} />
        <PassDetail
          label="Check-in"
          value={
            visit.checked_in_at
              ? new Date(visit.checked_in_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
        <PassDetail label="Valid until" value={clockTime(visit.expected_departure)} />
      </dl>
      <div className="mt-2.5 flex items-center justify-between border-t border-white/20 pt-2">
        <span className="font-mono text-[8px] text-white/75">
          {visit.visitor_code || visit.request_no}
        </span>
        <span className="grid size-12 place-items-center rounded-md bg-white/15">
          <QrBlock value={`FCM-VISIT:${visit.qr_token}`} size={40} />
        </span>
      </div>
    </section>
  );
}

function PassDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/65">{label}</dt>
      <dd className="truncate font-semibold">{value || "—"}</dd>
    </div>
  );
}
