import { cn } from "@/lib/utils";

export function AppIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-[#2563eb] font-display text-[15px] font-extrabold text-white",
        className,
      )}
    >
      V
    </span>
  );
}
