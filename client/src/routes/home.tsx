import { createFileRoute, Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  ContactRound,
  FileCheck2,
  Headset,
  HardHat,
  MapPinned,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { ModuleLauncherCard } from "@/components/common/ModuleLauncherCard";
import { AppIcon } from "@/components/common/AppIcon";
import { APP_NAME, APP_TAGLINE } from "@/constants/brand";
import { useApp } from "@/context/app-context";
import { modulesForRole } from "@/constants/modules";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — Home` },
      {
        name: "description",
        content:
          "Your FCM Console home: open Visitor Management, E-Work Permit, FCM Helpdesk and Emergency Evacuation from one place.",
      },
      { property: "og:title", content: `${APP_NAME} — Home` },
      {
        property: "og:description",
        content: "One home for every FCM module you are authorised to use.",
      },
    ],
  }),
  component: HomePage,
});

const ARTWORK: Record<string, { main: typeof ContactRound; detail: typeof BadgeCheck }> = {
  vms: { main: ContactRound, detail: BadgeCheck },
  eworkpermit: { main: FileCheck2, detail: HardHat },
  helpdesk: { main: Headset, detail: Wrench },
  emergency: { main: MapPinned, detail: ShieldAlert },
};

const TILE_TONES: Record<string, string> = {
  vms: "home-launcher-tile--visitors",
  eworkpermit: "home-launcher-tile--permit",
  helpdesk: "home-launcher-tile--helpdesk",
  emergency: "home-launcher-tile--emergency",
};

const TILE_HORIZONTAL_GAP = "gap-x-0 sm:gap-x-10";
const TILE_VERTICAL_GAP = "gap-y-0 sm:gap-y-10";
const TILE_WIDTH = "492px";
const TILE_HEIGHT = "clamp(188px, 38svh, 340px)";

function HomePage() {
  const { user } = useApp();
  const modules = user ? modulesForRole(user.role) : [];

  return (
    <AppPage>
      <div className="relative min-h-svh w-full p-5 sm:flex sm:items-center sm:p-7 lg:p-16">
        <Link
          to="/home"
          aria-label="Go to home page"
          title="Home"
          className="absolute left-5 top-5 z-10 flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 sm:left-7 sm:top-7 lg:left-16 lg:top-8"
        >
          <AppIcon />
          <span className="leading-tight">
            <span className="block font-display text-[13px] font-extrabold tracking-tight">
              {APP_NAME}
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {APP_TAGLINE}
            </span>
          </span>
        </Link>
        <div
          style={
            {
              "--launcher-tile-width": TILE_WIDTH,
              "--launcher-tile-height": TILE_HEIGHT,
            } as CSSProperties
          }
          className={`home-launcher-grid grid w-full min-h-[calc(100svh-2rem)] grid-cols-1 sm:min-h-[calc(100svh-3rem)] sm:grid-cols-2 lg:min-h-[calc(100svh-9rem)] ${TILE_HORIZONTAL_GAP} ${TILE_VERTICAL_GAP}`}
        >
          {modules.map((mod, index) => {
            const { main: MainIcon, detail: DetailIcon } = ARTWORK[mod.key] ?? {
              main: ClipboardCheck,
              detail: BadgeCheck,
            };
            const card = (
              <ModuleLauncherCard
                module={mod}
                mainIcon={MainIcon}
                detailIcon={DetailIcon}
                toneClass={TILE_TONES[mod.key] ?? ""}
                animationDelay={index * 75}
                width={`min(100%, ${TILE_WIDTH})`}
                height={TILE_HEIGHT}
              />
            );

            return mod.available ? (
              <Link
                key={mod.key}
                to={mod.to}
                className="grid h-full place-items-center rounded-2xl focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                {card}
              </Link>
            ) : (
              <div key={mod.key} className="grid h-full cursor-not-allowed place-items-center">
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </AppPage>
  );
}
