import type { CSSProperties } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ConsoleModule } from "@/constants/modules";
import { cn } from "@/lib/utils";

interface ModuleLauncherCardProps {
  module: ConsoleModule;
  mainIcon: LucideIcon;
  detailIcon: LucideIcon;
  toneClass: string;
  animationDelay?: number;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}

export function ModuleLauncherCard({
  module,
  mainIcon: MainIcon,
  detailIcon: DetailIcon,
  toneClass,
  animationDelay = 0,
  width = "100%",
  height = "100%",
}: ModuleLauncherCardProps) {
  return (
    <div
      style={{ width, height, animationDelay: `${animationDelay}ms` }}
      className={cn(
        "home-module-card home-module-card-enter home-launcher-tile group isolate grid min-h-72 grid-cols-[minmax(0,1fr)_clamp(7rem,32%,12rem)] grid-rows-[1fr_auto] gap-x-2 overflow-hidden rounded-2xl border p-5 sm:min-h-0 sm:gap-x-4 sm:p-6 lg:p-8",
        toneClass,
        module.available ? "cursor-pointer" : "cursor-not-allowed opacity-70",
      )}
    >
      <div className="self-center">
        <h2 className="max-w-[18ch] font-display text-[21px] font-extrabold leading-tight tracking-tight sm:text-[23px] lg:text-[28px]">
          {module.name}
        </h2>
        <p className="mt-3 max-w-[42ch] text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">
          {module.description}
        </p>
      </div>
      <div aria-hidden="true" className="row-span-2 grid place-items-center self-center">
        <div className="home-launcher-art relative grid size-24 place-items-center rounded-[28px] sm:size-28 lg:size-40">
          <MainIcon className="size-14 stroke-[1.5] sm:size-16 lg:size-20" />
          <span className="home-launcher-art-badge absolute -bottom-2 -right-2 grid size-10 place-items-center rounded-2xl border shadow-sm sm:size-12">
            <DetailIcon className="size-5 stroke-[1.7] sm:size-6" />
          </span>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 self-end pt-5 text-[13px] font-bold text-primary sm:text-[14px]">
        {module.available ? (
          <>
            Open module
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </>
        ) : (
          <span className="text-muted-foreground">Coming soon</span>
        )}
      </span>
    </div>
  );
}