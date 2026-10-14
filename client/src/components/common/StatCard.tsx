import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-muted-foreground",
} as const;

const CARD_TONES = {
  brand: "from-primary-soft/60 before:bg-primary",
  success: "from-success-soft/60 before:bg-success",
  warning: "from-warning-soft/60 before:bg-warning",
  danger: "from-danger-soft/60 before:bg-danger",
  info: "from-info-soft/60 before:bg-info",
  neutral: "from-neutral-soft/60 before:bg-neutral",
} as const;

export function StatCard({
  label,
  value,
  hint,
  hintTone = "muted",
  icon: Icon,
  tone = "brand",
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  hintTone?: "muted" | "success" | "warning" | "danger";
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  onClick?: () => void;
}) {
  const hintCls = {
    muted: "text-muted-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[hintTone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative isolate overflow-hidden surface-card bg-linear-to-br via-card to-card p-5 text-left transition-all duration-300 ease-out before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[''] hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none",
        CARD_TONES[tone],
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="relative flex items-center justify-between">
        <p className="text-[12px] font-semibold text-muted-foreground">{label}</p>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none",
            TONES[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="relative mt-3 font-display text-[34px] font-extrabold tracking-tight">
        {value}
      </p>
      {hint ? <p className={cn("relative mt-1 text-[12px] font-medium", hintCls)}>{hint}</p> : null}
    </button>
  );
}
