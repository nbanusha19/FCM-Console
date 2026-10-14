import { CARD_STATUS, VISIT_STATUS } from "@/constants/visit-status";
import { TICKET_STATUS } from "@/constants/ticket-status";
import { PERMIT_STATUS } from "@/constants/permit-status";
import {
  Ban,
  CheckCircle2,
  Clock,
  DoorOpen,
  LogOut,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisitStatus } from "@/lib/types";

const MAP: Record<VisitStatus, { label: string; icon: LucideIcon; cls: string }> = {
  PENDING: { label: "Pending", icon: Clock, cls: "bg-warning-soft text-warning" },
  APPROVED: { label: "Approved", icon: CheckCircle2, cls: "bg-success-soft text-success" },
  CARD_ISSUED: { label: "Card Issued", icon: CheckCircle2, cls: "bg-success-soft text-success" },
  REJECTED: { label: "Rejected", icon: XCircle, cls: "bg-danger-soft text-danger" },
  CHECKED_IN: { label: "Checked In", icon: DoorOpen, cls: "bg-info-soft text-info" },
  CHECKED_OUT: { label: "Checked Out", icon: LogOut, cls: "bg-neutral-soft text-muted-foreground" },
  CANCELLED: { label: "Cancelled", icon: Ban, cls: "bg-neutral-soft text-muted-foreground" },
};

export function StatusBadge({ status, className }: { status: VisitStatus; className?: string }) {
  const cfg = MAP[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        cfg.cls,
        className,
      )}
    >
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-neutral-soft text-muted-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const GENERIC_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning", OPEN: "warning",
  APPROVED: "success", CARD_ISSUED: "success", RESOLVED: "success", SAFE: "success",
  ARRIVED: "info", IN_PROGRESS: "info", CHECKED_IN: "info",
  REJECTED: "danger", ACTIVE: "danger", NEED_SUPPORT: "danger",
  EXPIRED: "neutral", STOPPED: "neutral", CLOSED: "neutral", CANCELLED: "neutral",
};
const GENERIC_ICON: Record<string, LucideIcon> = {
  PENDING: Clock, OPEN: Clock, APPROVED: CheckCircle2, CARD_ISSUED: CheckCircle2, RESOLVED: CheckCircle2, SAFE: CheckCircle2,
  ARRIVED: DoorOpen, IN_PROGRESS: DoorOpen, REJECTED: XCircle, ACTIVE: XCircle, NEED_SUPPORT: XCircle,
  CHECKED_IN: DoorOpen, CHECKED_OUT: LogOut, COMPLETED: CheckCircle2, AVAILABLE: CheckCircle2, IN_USE: DoorOpen, RETURNED: LogOut, LOST: XCircle, EXPIRED: Ban, STOPPED: Ban, CLOSED: LogOut, CANCELLED: Ban,
};

/** Reference-style status pill for any module status string. */
export function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  const Icon = GENERIC_ICON[status] ?? Clock;
  const def = VISIT_STATUS[status] ?? CARD_STATUS[status] ?? TICKET_STATUS[status] ?? PERMIT_STATUS[status];
  const text = label ?? def?.label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return (
    <Pill tone={def?.tone ?? GENERIC_TONE[status] ?? "neutral"} {...(className ? { className } : {})}>
      <Icon className="size-3" />
      {text}
    </Pill>
  );
}
