import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { BarChart3, CheckCircle2, Clock3, Download, UsersRound } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listVisitRequests,
  listVisitorTypes,
  type VisitRequest,
} from "@/services/visitor-requests";
import { statusLabel, VISIT_STATUS_KEYS } from "@/constants/visit-status";
import { VMS_BRANCH_FILTERS } from "@/constants/vms-filters";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/vms-reports")({
  head: () => ({
    meta: [
      { title: "Visitor Reports — VMS" },
      {
        name: "description",
        content: "Slice visitor history by period, branch, status and visitor type.",
      },
      { property: "og:title", content: "Visitor Reports — VMS" },
      { property: "og:description", content: "Visitor report summaries and charts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY"]}>
      <Reports />
    </AppPage>
  ),
});

function Reports() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["visit-requests"], queryFn: listVisitRequests });
  const { data: types = [] } = useQuery({ queryKey: ["visitor-types"], queryFn: listVisitorTypes });
  const today = iso(new Date());
  const firstOfPreviousMonth = new Date();
  firstOfPreviousMonth.setDate(1);
  firstOfPreviousMonth.setMonth(firstOfPreviousMonth.getMonth() - 1);
  const [from, setFrom] = useState(iso(firstOfPreviousMonth));
  const [to, setTo] = useState(today);
  const [branch, setBranch] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [visitor, setVisitor] = useState("");
  const [host, setHost] = useState("");
  const [category, setCategory] = useState(ALL);
  const categoryMatch = (visit: VisitRequest) => {
    switch (category) {
      case "TODAY":
        return visit.visit_date === today;
      case "UPCOMING":
        return ["APPROVED", "CARD_ISSUED"].includes(visit.status) && visit.visit_date > today;
      case "COMPLETED":
        return ["CHECKED_OUT", "COMPLETED"].includes(visit.status);
      case "INSIDE":
        return visit.status === "CHECKED_IN";
      case "REJECTED":
        return visit.status === "REJECTED";
      case "CANCELLED":
        return visit.status === "CANCELLED";
      case "HISTORY":
        return visit.visit_date < today || ["CHECKED_OUT", "COMPLETED"].includes(visit.status);
      default:
        return true;
    }
  };
  const filtered = data.filter(
    (visit) =>
      (category === "UPCOMING" || (visit.visit_date >= from && visit.visit_date <= to)) &&
      categoryMatch(visit) &&
      (branch === ALL || visit.location === branch) &&
      (status === ALL || visit.status === status) &&
      (type === ALL || visit.visitor_type === type) &&
      (!visitor.trim() ||
        visit.visitor_name.toLowerCase().includes(visitor.trim().toLowerCase())) &&
      (!host.trim() || visit.host_name.toLowerCase().includes(host.trim().toLowerCase())),
  );
  const completed = filtered.filter((visit) =>
    ["CHECKED_OUT", "COMPLETED"].includes(visit.status),
  ).length;
  const external = filtered.filter((visit) => visit.visitor_type === "EXTERNAL").length;
  const internal = filtered.filter(
    (visit) => visit.visitor_type === "EMPLOYEE" || visit.visitor_type === "OTHER_BRANCH",
  ).length;
  const visitorsByBranch = Object.entries(
    filtered.reduce<Record<string, number>>((counts, visit) => {
      const name = visit.location || "Unknown";
      counts[name] = (counts[name] ?? 0) + 1;
      return counts;
    }, {}),
  ).map(([name, visitors]) => ({ name, visitors }));
  const statusBreakdown = Object.entries(
    filtered.reduce<Record<string, number>>((counts, visit) => {
      counts[visit.status] = (counts[visit.status] ?? 0) + 1;
      return counts;
    }, {}),
  ).map(([key, value]) => ({
    name: statusLabel(key),
    value,
    color: STATUS_COLORS[key] ?? "#64748b",
  }));
  const exportCsv = () => {
    const header = [
      "Visitor ID",
      "Visitor",
      "Visitor type",
      "Company",
      "Host",
      "Visit date",
      "Check-in",
      "Check-out",
      "Status",
      "Branch",
    ];
    const rows = filtered.map((visit) => [
      visit.visitor_code,
      visit.visitor_name,
      types.find((visitorType) => visitorType.code === visit.visitor_type)?.label ??
        visit.visitor_type,
      visit.company,
      visit.host_name,
      visit.visit_date,
      visit.checked_in_at ?? "",
      visit.checked_out_at ?? "",
      statusLabel(visit.status),
      visit.location,
    ]);
    downloadCsv(`vms-reports-${today}.csv`, header, rows);
  };

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Analytics</p>
          <h1 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight">
            Reports &amp; export
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Slice visitor history by period, branch, status and visitor type.
          </p>
        </div>
        <Button size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="size-3.5" /> Export {filtered.length} record
          {filtered.length === 1 ? "" : "(s)"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-danger">
          Couldn&apos;t load reports: {error instanceof Error ? error.message : "Please try again."}
        </p>
      ) : null}

      <section
        className="surface-card grid gap-2.5 p-2.5 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Report filters"
      >
        <Filter label="From">
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            className="h-8 text-[10px]"
          />
        </Filter>
        <Filter label="To">
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
            className="h-8 text-[10px]"
          />
        </Filter>
        <Filter label="Visitor">
          <Input
            type="search"
            value={visitor}
            onChange={(event) => setVisitor(event.target.value)}
            placeholder="Search visitor"
            className="h-8 text-[10px]"
          />
        </Filter>
        <Filter label="Host">
          <Input
            type="search"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="Search host"
            className="h-8 text-[10px]"
          />
        </Filter>
        <Filter label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All visits</SelectItem>
              <SelectItem value="TODAY">Today&apos;s visits</SelectItem>
              <SelectItem value="UPCOMING">Upcoming visits</SelectItem>
              <SelectItem value="COMPLETED">Completed visits</SelectItem>
              <SelectItem value="INSIDE">Currently checked-in</SelectItem>
              <SelectItem value="REJECTED">Rejected visits</SelectItem>
              <SelectItem value="CANCELLED">Cancelled visits</SelectItem>
              <SelectItem value="HISTORY">Visit history</SelectItem>
            </SelectContent>
          </Select>
        </Filter>
        <Filter label="Branch">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-8 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All branches</SelectItem>
              {VMS_BRANCH_FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
        <Filter label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {VISIT_STATUS_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {statusLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
        <Filter label="Visitor type">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {types.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
      </section>

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">Loading visit reports…</p>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Records in range" value={filtered.length} icon={BarChart3} tone="blue" />
        <Metric label="Completed visits" value={completed} icon={CheckCircle2} tone="green" />
        <Metric label="External visitors" value={external} icon={UsersRound} tone="blue" />
        <Metric label="Internal visitors" value={internal} icon={Clock3} tone="amber" />
      </div>

      <div className="grid gap-2.5 xl:grid-cols-2">
        <section className="surface-card min-w-0 p-3" aria-label="Visitors by branch chart">
          <h2 className="mb-2 text-[10px] font-semibold">Visitors by branch</h2>
          {visitorsByBranch.length ? (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visitorsByBranch}
                  margin={{ top: 4, right: 6, bottom: 0, left: -18 }}
                >
                  <CartesianGrid stroke="#e7ebf1" strokeDasharray="2 3" vertical={false} />
                  <XAxis
                    dataKey="name"
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
                    contentStyle={{ borderRadius: 8, borderColor: "#e7ebf1", fontSize: 10 }}
                  />
                  <Bar dataKey="visitors" fill="#2563eb" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-40 place-items-center text-[10px] text-muted-foreground">
              No records in this range.
            </div>
          )}
        </section>

        <section className="surface-card min-w-0 p-3" aria-label="Status breakdown chart">
          <h2 className="mb-2 text-[10px] font-semibold">Status breakdown</h2>
          {statusBreakdown.length ? (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={34}
                    outerRadius={58}
                    paddingAngle={1}
                  >
                    {statusBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, borderColor: "#e7ebf1", fontSize: 10 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-40 place-items-center text-[10px] text-muted-foreground">
              No records in this range.
            </div>
          )}
          {statusBreakdown.length ? (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[9px]">
              {statusBreakdown.map((entry) => (
                <span key={entry.name} className="flex items-center gap-1">
                  <i className="size-1.5 rounded-full" style={{ background: entry.color }} />
                  {entry.name}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const ALL = "__all";
const STATUS_COLORS: Record<string, string> = {
  CHECKED_IN: "#2563eb",
  APPROVED: "#059669",
  PENDING: "#d97706",
  CHECKED_OUT: "#64748b",
  COMPLETED: "#0f766e",
  REJECTED: "#e11d48",
  CANCELLED: "#94a3b8",
  EXPIRED: "#94a3b8",
};

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-[9px] font-medium">
      {label}
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof BarChart3;
  tone: "blue" | "green" | "amber";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <section className="surface-card p-3">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        {label}
        <span className={`grid size-5 place-items-center rounded-md ${tones[tone]}`}>
          <Icon className="size-3" />
        </span>
      </div>
      <p className="mt-1.5 font-display text-[20px] font-extrabold leading-none">{value}</p>
    </section>
  );
}
