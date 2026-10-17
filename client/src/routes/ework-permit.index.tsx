import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  HardHat,
  Plus,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { PermitPeriodSelector } from "@/components/ework-permit/PermitPeriodSelector";
import { useApp } from "@/context/app-context";
import { filterPermitsByPeriod, type PermitPeriod } from "@/lib/ework-permit-period";
import { listWorkPermits } from "@/services/work-permits-api";
import { useState } from "react";

const PERMIT_TYPE_KEY = [
  { key: "HOT_WORK", label: "Hot work", dot: "bg-rose-500" },
  { key: "HEIGHT", label: "Work at height", dot: "bg-amber-600" },
  { key: "ELECTRICAL", label: "Electrical", dot: "bg-blue-500" },
  { key: "CONFINED", label: "Confined space", dot: "bg-blue-600" },
  { key: "EXCAVATION", label: "Earth excavation", dot: "bg-slate-500" },
  { key: "COLD", label: "Cold work", dot: "bg-emerald-600" },
] as const;

export const Route = createFileRoute("/ework-permit/")({
  component: PermitDashboard,
});

function PermitDashboard() {
  const { user } = useApp();
  const [period, setPeriod] = useState<PermitPeriod>("monthly");
  const {
    data: permits = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ewp-work-permits"],
    queryFn: listWorkPermits,
    enabled: Boolean(user),
  });
  const periodPermits = filterPermitsByPeriod(permits, period);
  const count = (status: string) =>
    periodPermits.filter((permit) => permit.status === status).length;
  const typeCount = (type: string) =>
    periodPermits.filter((permit) => permit.permitType === type).length;
  const canCreate =
    user?.role === "ADMIN" || user?.role === "EMPLOYEE" || user?.role === "BRANCH_MANAGER";
  const subtitle =
    user?.role === "SECURITY"
      ? "Verify approved permits and record contractor gate entry."
      : "Raise, review, approve and close work permits through the six-type safety workflow.";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Work Permit"
        title={
          user?.role === "HSE"
            ? "E-Work Permit dashboard"
            : user?.role === "SECURITY"
              ? "Security gate verification"
              : "E-Work Permit dashboard"
        }
        subtitle={subtitle}
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading permits…</p> : null}
      <PermitPeriodSelector
        value={period}
        onChange={setPeriod}
        action={
          canCreate ? (
            <Button asChild>
              <Link to="/ework-permit/new">
                <Plus className="size-4" />
                Create permit
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Permits in view"
          value={periodPermits.length}
          icon={ClipboardList}
          tone="brand"
        />
        <StatCard
          label="HSE pending review"
          value={count("PENDING_HSE")}
          icon={Clock}
          tone="warning"
        />
        <StatCard label="Sent back" value={count("SENT_BACK")} icon={RotateCcw} tone="info" />
        <StatCard label="Approved" value={count("APPROVED")} icon={CheckCircle2} tone="success" />
        <StatCard label="Active" value={count("ACTIVE")} icon={HardHat} tone="info" />
        <StatCard label="Rejected" value={count("REJECTED")} icon={XCircle} tone="danger" />
      </div>
      <section
        className="surface-card flex flex-wrap items-center gap-2.5 px-4 py-3"
        aria-label={`Permit type counts for ${period}`}
      >
        <h2 className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Type key · {period} counts
        </h2>
        {PERMIT_TYPE_KEY.map((type) => (
          <div
            key={type.key}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs"
          >
            <span aria-hidden="true" className={`size-2 rounded-full ${type.dot}`} />
            <span className="font-medium">{type.label}</span>
            <span className="rounded-full bg-primary-soft/70 px-1.5 font-semibold tabular-nums text-primary">
              {typeCount(type.key)}
            </span>
          </div>
        ))}
      </section>
      <section className="surface-card space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold">Recent permits</h2>
          {user?.role === "HSE" || user?.role === "ADMIN" ? (
            <Button variant="outline" asChild>
              <Link to="/ework-permit/all">View all</Link>
            </Button>
          ) : null}
        </div>
        {periodPermits.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No permits to display.</p>
        ) : null}
        <ul className="divide-y divide-border">
          {periodPermits.slice(0, 8).map((permit) => (
            <li key={permit.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-1">
                <Link
                  to="/ework-permit/$id"
                  params={{ id: permit.id }}
                  className="font-mono text-sm font-semibold text-primary hover:underline"
                >
                  {permit.permitNo || permit.id}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {permit.permitType.replaceAll("_", " ")} · {permit.workDate} · {permit.contractor}
                </p>
              </div>
              <StatusPill status={permit.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
