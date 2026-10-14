import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app-context";
import { listWorkPermits } from "@/services/work-permits-api";

const PERMIT_CARD_ACCENTS: Record<string, string> = {
  PENDING_HSE: "before:bg-warning",
  SENT_BACK: "before:bg-info",
  APPROVED: "before:bg-success",
  ACTIVE: "before:bg-info",
  REJECTED: "before:bg-danger",
  CLOSED: "before:bg-neutral",
};

export const Route = createFileRoute("/ework-permit/all")({
  component: AllPermits,
});

function AllPermits() {
  const { user } = useApp();
  const allowed = user?.role === "ADMIN" || user?.role === "HSE";
  const {
    data: permits = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ewp-work-permits"],
    queryFn: listWorkPermits,
    enabled: allowed,
  });
  if (!allowed)
    return <p className="text-muted-foreground">You don&apos;t have access to all permits.</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Work Permit"
        title="All permits"
        subtitle="Review permit requests, approvals and lifecycle history."
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading permits…</p>
      ) : null}
      {!isLoading && !error && permits.length === 0 ? (
        <p className="surface-card p-6 text-center text-sm text-muted-foreground">
          No permits have been raised.
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {permits.map((permit) => (
          <article
            key={permit.id}
            className={`group relative isolate overflow-hidden surface-card bg-linear-to-br from-primary-soft/35 via-card to-card p-4 transition-all duration-300 ease-out before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none ${PERMIT_CARD_ACCENTS[permit.status] ?? "before:bg-primary"}`}
          >
            <div className="relative space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary-soft/70 px-2 py-1 font-mono text-xs font-semibold text-primary">
                  {permit.permitNo || permit.id}
                </span>
                <StatusPill status={permit.status} />
                <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-semibold">
                  {permit.permitType.replaceAll("_", " ")}
                </span>
              </div>
              <p className="line-clamp-2 text-sm font-medium">{permit.workDescription}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {permit.raisedByName} ·{" "}
                {[permit.building, permit.floor, permit.wing, permit.area]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                · {permit.workDate} {permit.timeFrom}–{permit.timeTo}
              </p>
              <div className="flex justify-end border-t border-border/60 pt-2">
                <Button
                  asChild
                  variant="outline"
                  className="transition-colors group-hover:border-primary/40 group-hover:text-primary"
                >
                  <Link to="/ework-permit/$id" params={{ id: permit.id }}>
                    Open permit
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
