import { createFileRoute, Link } from "@tanstack/react-router";
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
import { APP_NAME } from "@/constants/brand";
import { useApp } from "@/context/app-context";
import { CONSOLE_MODULES } from "@/constants/modules";

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

const TILE_LABELS: Record<string, string> = {
  vms: "FCM Visitor Management",
  eworkpermit: "FCM E-WORK Permit",
  helpdesk: "FCM Helpdesk",
  emergency: "FCM Emergency Evacuation",
};

function HomePage() {
  const { user } = useApp();
  const modules = CONSOLE_MODULES.map((module) => ({
    ...module,
    available: Boolean(user && module.available && module.roles.includes(user.role)),
  }));

  return (
    <AppPage>
      <div className="grid h-full min-h-0 flex-1 place-items-center overflow-hidden p-2 sm:p-4">
        <div className="home-launcher-grid grid h-full max-h-[680px] w-full max-w-[1024px] grid-cols-2 grid-rows-2 gap-2 sm:gap-6">
          {modules.map((mod, index) => {
            const { main: MainIcon, detail: DetailIcon } = ARTWORK[mod.key] ?? {
              main: ClipboardCheck,
              detail: BadgeCheck,
            };
            const card = (
              <ModuleLauncherCard
                module={{ ...mod, name: TILE_LABELS[mod.key] ?? mod.name }}
                mainIcon={MainIcon}
                detailIcon={DetailIcon}
                animationDelay={index * 75}
                unavailableLabel="Not operational"
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
              <div
                key={mod.key}
                className="grid h-full cursor-not-allowed place-items-center"
                aria-disabled="true"
              >
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </AppPage>
  );
}
