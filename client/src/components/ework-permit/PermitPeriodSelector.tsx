import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getPermitPeriodRange, type PermitPeriod } from "@/lib/ework-permit-period";

const PERIOD_OPTIONS: { value: PermitPeriod; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function PermitPeriodSelector({
  value,
  onChange,
  action,
}: {
  value: PermitPeriod;
  onChange: (period: PermitPeriod) => void;
  action?: ReactNode;
}) {
  const range = getPermitPeriodRange(value);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center justify-start gap-3">
        <ToggleGroup
          type="single"
          value={value}
          onValueChange={(period) => {
            const selected = PERIOD_OPTIONS.find((option) => option.value === period);
            if (selected) onChange(selected.value);
          }}
          aria-label="Filter permits by work date"
          className="rounded-lg border border-border bg-background p-1"
        >
          {PERIOD_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`${option.label} permits`}
              className="rounded-md px-3 py-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          Showing permits scheduled for {range.label.toLowerCase()} ({range.dateRange}).
        </p>
      </div>
      {action}
    </div>
  );
}
