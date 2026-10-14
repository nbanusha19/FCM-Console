import { Printer } from "lucide-react";
import type { Visit } from "@/lib/types";
import { QrBlock } from "@/components/common/QrBlock";
import { VisitorPhoto } from "@/components/visits/VisitorPhoto";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/constants/brand";
import { formatDate, formatTime } from "@/lib/format";
import { printVisitorCard } from "@/lib/print-visitor-card";
import { branchName, employeeName, visitorOrigin } from "@/services/vms";

export function VisitorBadge({
  visit,
  onPrint,
  showPhoto = true,
  onPhotoCapture,
}: {
  visit: Visit;
  onPrint?: (() => void) | undefined;
  showPhoto?: boolean | undefined;
  onPhotoCapture?: ((dataUrl: string) => void) | undefined;
}) {
  return (
    <section className="print-area relative overflow-hidden rounded-2xl border border-primary/20 badge-gradient p-5 text-primary-foreground shadow-badge">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary-foreground/20 font-display text-[11px] font-extrabold">
            V
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/70">
            {APP_NAME} visitor
          </span>
        </span>
        <span className="font-mono text-[11px] text-primary-foreground/80">
          {visit.visitorId ?? visit.requestId}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-3">
        {showPhoto ? (
          <VisitorPhoto
            name={visit.name}
            src={visit.photoUrl}
            onCapture={onPhotoCapture}
            size="md"
            tone="badge"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[22px] font-extrabold leading-tight tracking-tight">{visit.name}</p>
          <p className="text-[13px] text-primary-foreground/80">
            {visitorOrigin(visit)} · {visit.designation}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5 text-[12px] text-primary-foreground/90">
        <p className="flex justify-between">
          <span className="text-primary-foreground/60">Host</span>
          <span className="font-semibold">{employeeName(visit.hostEmployeeId)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-primary-foreground/60">Branch</span>
          <span className="font-semibold">{branchName(visit.branchId)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-primary-foreground/60">Visit date</span>
          <span className="font-semibold">{formatDate(visit.visitDate)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-primary-foreground/60">Check-in</span>
          <span className="font-semibold">{formatTime(visit.checkInAt)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-primary-foreground/60">Valid until</span>
          <span className="font-semibold">{formatTime(visit.expectedDeparture)}</span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-primary-foreground/20 pt-3">
        <div className="font-mono text-[11px] text-primary-foreground/80">
          {visit.cardNumber ?? "Card not issued"}
        </div>
        <div className="grid size-14 place-items-center rounded-lg bg-primary-foreground/15 ring-1 ring-primary-foreground/30">
          <QrBlock value={visit.visitorId ?? visit.requestId} />
        </div>
      </div>

      {onPrint ? (
        <Button
          variant="secondary"
          onClick={() => printVisitorCard(visit, { showPhoto })}
          className="mt-4 w-full border border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 print:hidden"
        >
          <Printer className="size-4" /> Print visitor card
        </Button>
      ) : null}
    </section>
  );
}
