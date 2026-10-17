import type { CSSProperties } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ConsoleModule } from "@/constants/modules";
import { cn } from "@/lib/utils";

interface ModuleLauncherCardProps {
  module: ConsoleModule;
  mainIcon: LucideIcon;
  detailIcon: LucideIcon;
  animationDelay?: number;
  unavailableLabel?: string;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}

export function ModuleLauncherCard({
  module,
  mainIcon: MainIcon,
  detailIcon: DetailIcon,
  animationDelay = 0,
  unavailableLabel = "Coming soon",
  width = "100%",
  height = "100%",
}: ModuleLauncherCardProps) {
  return (
    <div
      style={{ width, height, animationDelay: `${animationDelay}ms` }}
      className={cn(
        "home-module-card home-module-card-enter home-launcher-tile group isolate grid min-h-0 grid-cols-[minmax(0,1fr)_clamp(3rem,28%,6rem)] grid-rows-[1fr_auto] gap-x-1 overflow-hidden rounded-2xl border p-2.5 sm:grid-cols-[minmax(0,1fr)_clamp(7rem,32%,12rem)] sm:gap-x-4 sm:p-6 lg:p-8",
        module.available ? "cursor-pointer" : "cursor-not-allowed opacity-70",
      )}
    >
      <div className="self-center">
        <h2 className="max-w-[18ch] font-display text-[14px] font-extrabold leading-tight tracking-tight sm:text-[23px] lg:text-[28px]">
          {module.name}
        </h2>
        <p className="mt-1 line-clamp-3 max-w-[42ch] text-[10px] leading-snug text-muted-foreground sm:mt-3 sm:text-[14px] sm:leading-relaxed">
          {module.description}
        </p>
      </div>
      <div aria-hidden="true" className="row-span-2 grid place-items-center self-center">
        <div className="home-launcher-art relative grid size-12 place-items-center rounded-xl sm:size-28 sm:rounded-[28px] lg:size-40">
          <MainIcon className="size-7 stroke-[1.5] sm:size-16 lg:size-20" />
          <span className="home-launcher-art-badge absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-lg border shadow-sm sm:-bottom-2 sm:-right-2 sm:size-12 sm:rounded-2xl">
            <DetailIcon className="size-3.5 stroke-[1.7] sm:size-6" />
          </span>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 self-end pt-2 text-[10px] font-bold text-primary sm:gap-2 sm:pt-5 sm:text-[14px]">
        {module.available ? (
          <>
            Open module
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 sm:size-4" />
          </>
        ) : (
          <span className="text-muted-foreground">{unavailableLabel}</span>
        )}
      </span>
    </div>
  );
}
