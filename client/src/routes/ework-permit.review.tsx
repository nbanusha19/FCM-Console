import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app-context";
import { listWorkPermits } from "@/services/work-permits-api";

export const Route = createFileRoute("/ework-permit/review")({
  component: PendingPermitReviews,
});

function PendingPermitReviews() {
  const { user } = useApp();
  const permitted = user?.role === "ADMIN" || user?.role === "HSE";
  const {
    data: permits = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ewp-work-permits"],
    queryFn: listWorkPermits,
    enabled: permitted,
  });
  const pending = permits.filter((permit) => permit.status === "PENDING_HSE");

  if (!permitted)
    return <p className="text-muted-foreground">You don&apos;t have access to permit reviews.</p>;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Work Permit"
        title="Pending HSE review"
        subtitle="Review submitted work permits and record the HSE decision."
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <section className="surface-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-primary" />
            <h2 className="font-display text-base font-bold">Permits awaiting review</h2>
          </div>
          <span className="rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
            {pending.length} pending
          </span>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading permits…</p>
        ) : null}
        {!isLoading && !error && pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No permits are waiting for action.
          </p>
        ) : null}
        <ul className="grid gap-3 md:grid-cols-2">
          {pending.map((permit) => (
            <li key={permit.id} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold">
                  {permit.permitNo || permit.id}
                </span>
                <StatusPill status={permit.status} />
                <span className="text-sm font-semibold">
                  {permit.permitType.replaceAll("_", " ")}
                </span>
              </div>
              <p className="text-sm">{permit.workDescription}</p>
              <p className="text-xs text-muted-foreground">
                Requested by {permit.raisedByName} ·{" "}
                {[permit.building, permit.floor, permit.wing, permit.area]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button asChild variant="outline">
                  <Link to="/ework-permit/$id" params={{ id: permit.id }}>
                    Review permit
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
