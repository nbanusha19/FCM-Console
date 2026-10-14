import {
  Ban,
  CheckCircle2,
  Clock,
  Flame,
  LogOut,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMIT_STATUS_LABEL, type WorkPermitStatus } from "@/lib/work-permit";

const MAP: Record<WorkPermitStatus, { icon: LucideIcon; cls: string }> = {
  DRAFT: { icon: Clock, cls: "bg-neutral-soft text-muted-foreground" },
  PENDING_HSE: { icon: Clock, cls: "bg-warning-soft text-warning" },
  SENT_BACK: { icon: ShieldAlert, cls: "bg-warning-soft text-warning" },
  REJECTED: { icon: Ban, cls: "bg-danger-soft text-danger" },
  APPROVED: { icon: CheckCircle2, cls: "bg-info-soft text-info" },
  ACTIVE: { icon: Flame, cls: "bg-success-soft text-success" },
  CLOSURE_REQUESTED: { icon: LogOut, cls: "bg-info-soft text-info" },
  EXTENSION_REQUESTED: { icon: Clock, cls: "bg-warning-soft text-warning" },
  CLOSED: { icon: CheckCircle2, cls: "bg-neutral-soft text-muted-foreground" },
};

export function PermitStatusBadge({
  status,
  className,
}: {
  status: WorkPermitStatus;
  className?: string;
}) {
  const cfg = MAP[status] ?? MAP.DRAFT;
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
      {PERMIT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TypeDot({ color }: { color?: string }) {
  const tones: Record<string, string> = {
    danger: "bg-danger",
    warning: "bg-warning",
    info: "bg-info",
    brand: "bg-primary",
    neutral: "bg-muted-foreground",
    success: "bg-success",
  };
  return (
    <span
      className={cn(
        "inline-block size-2.5 rounded-full",
        tones[color ?? "neutral"] ?? "bg-muted-foreground",
      )}
    />
  );
}
