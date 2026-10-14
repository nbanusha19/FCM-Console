import { LogIn, LogOut } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import type { Visit, VisitStatus } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";

export function VisitorWelcomeActions({
  visit,
  error,
  busy,
  onCheckIn,
  onCheckOut,
}: {
  visit: Visit;
  error?: string;
  busy?: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
}) {
  const inside = visit.status === "CHECKED_IN";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visitor ID</p>
          <p className="font-mono text-[18px] font-bold">{visit.visitorId}</p>
        </div>
        <StatusBadge status={visit.status as VisitStatus} />
      </div>
      <p className="text-center text-[12px] text-muted-foreground">
        {formatDate(visit.visitDate)} · {formatTime(visit.expectedArrival)} – {formatTime(visit.expectedDeparture)}
      </p>
      {error ? <p className="text-[12px] font-medium text-danger">{error}</p> : null}
      {inside ? (
        <Button className="w-full" size="lg" type="button" disabled={busy} onClick={onCheckOut}>
          <LogOut className="size-4" /> Check out
        </Button>
      ) : (
        <Button className="w-full" size="lg" type="button" disabled={busy} onClick={onCheckIn}>
          <LogIn className="size-4" /> Check in
        </Button>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        {inside ? "You are inside. Check out when you leave. You can check in again today if you return." : "Check in to enter. Check-out appears after you are inside."}
      </p>
    </div>
  );
}
