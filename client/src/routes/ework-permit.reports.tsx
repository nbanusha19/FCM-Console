import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
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
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { PermitPeriodSelector } from "@/components/ework-permit/PermitPeriodSelector";
import { PERMIT_STATUS, fmtDate } from "@/constants/permit-status";
import { filterPermitsByPeriod, type PermitPeriod } from "@/lib/ework-permit-period";
import { listWorkPermits } from "@/services/work-permits-api";
import { downloadCsv } from "@/lib/csv-export";
import { useState } from "react";

export const Route = createFileRoute("/ework-permit/reports")({
  component: Reports,
});

function count<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const CHART_COLORS = ["#0284c7", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];

function CountCard({ title, entries }: { title: string; entries: [string, number][] }) {
  return (
    <div className="group relative isolate min-h-40 overflow-hidden surface-card bg-linear-to-br from-primary-soft/35 via-card to-card p-5 transition-all duration-300 ease-out before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-primary before:content-[''] hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <h2 className="relative mb-3 border-b border-border/60 pb-3 font-display text-[15px] font-bold">
        {title}
      </h2>
      <ul className="relative space-y-1.5 text-[14px]">
        {entries.map(([name, value]) => (
          <li
            key={name}
            className="flex justify-between gap-3 rounded-md px-2 py-1 transition-colors hover:bg-primary-soft/35"
          >
            <span className="truncate text-muted-foreground">{name}</span>
            <span className="rounded-full bg-primary-soft/70 px-2 font-semibold tabular-nums text-primary">
              {value}
            </span>
          </li>
        ))}
        {entries.length === 0 ? <li className="px-2 text-muted-foreground">No data</li> : null}
      </ul>
    </div>
  );
}

function CountChart({
  title,
  entries,
  pie = false,
}: {
  title: string;
  entries: [string, number][];
  pie?: boolean;
}) {
  const data = entries.map(([name, count]) => ({ name, count }));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="group relative isolate overflow-hidden surface-card bg-linear-to-br from-info-soft/25 via-card to-card p-5 transition-all duration-300 ease-out before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-info before:content-[''] hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <h2 className="relative mb-3 border-b border-border/60 pb-3 font-display text-[15px] font-bold">
        {title}
      </h2>
      {data.length === 0 ? (
        <p className="relative grid h-56 place-items-center text-[13px] text-muted-foreground">
          No data
        </p>
      ) : pie ? (
        <>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Each coloured slice represents the share of permits for that work type.
          </p>
          <div
            className="h-44"
            role="img"
            aria-label={`Permit distribution by work type: ${data
              .map(({ name, count }) => `${name}: ${count}`)
              .join(", ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={2}
                >
                  {data.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, "Permits"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
            {data.map((entry, index) => {
              const share = total ? (entry.count / total) * 100 : 0;
              return (
                <li key={entry.name} className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {entry.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {entry.count} ({share.toFixed(1)}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [value, "Permits"]} />
              <Bar dataKey="count" name="Permits" radius={[0, 5, 5, 0]}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Reports() {
  const [period, setPeriod] = useState<PermitPeriod>("monthly");
  const { data: rows = [] } = useQuery({
    queryKey: ["ewp-work-permits"],
    queryFn: listWorkPermits,
  });
  const periodRows = filterPermitsByPeriod(rows, period);
  const workTypes = count(periodRows, (p) => p.permitType.replaceAll("_", " "));
  const statuses = count(periodRows, (p) => PERMIT_STATUS[p.status]?.label ?? p.status);
  const vendors = count(periodRows, (p) => p.contractor || "—");
  const startMonths = count(periodRows, (p) => fmtDate(p.workDate).slice(3));
  const csv = () => {
    const head = [
      "Permit",
      "Type",
      "Service",
      "Location",
      "Vendor",
      "Requester",
      "Start",
      "End",
      "Status",
      "Workers",
      "Approved by",
      "Rejected by",
      "Reason",
    ];
    const body = periodRows.map((p) => [
      p.permitNo,
      p.permitType,
      p.workDescription,
      [p.building, p.floor, p.wing, p.area].filter(Boolean).join(" · "),
      p.contractor,
      p.raisedByName,
      p.workDate,
      p.workDate,
      PERMIT_STATUS[p.status]?.label ?? p.status,
      p.workmenCount,
      p.approvedByName ?? "",
      p.rejectedByName ?? "",
      p.rejectionReason ?? "",
    ]);
    downloadCsv(`ework-permits-${new Date().toISOString().slice(0, 10)}.csv`, head, body);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Work Permit"
        title="Reports & history"
        actions={
          <Button variant="outline" onClick={csv}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />
      <PermitPeriodSelector value={period} onChange={setPeriod} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CountCard title="By work type" entries={workTypes} />
        <CountCard title="By status" entries={statuses} />
        <CountCard title="By vendor" entries={vendors} />
        <CountCard title="By start month" entries={startMonths} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CountChart title="Permits by work type" entries={workTypes} pie />
        <CountChart title="Permits by status" entries={statuses} />
        <CountChart title="Permits by vendor" entries={vendors} />
        <CountChart title="Permits by start month" entries={startMonths} />
      </div>
    </div>
  );
}
