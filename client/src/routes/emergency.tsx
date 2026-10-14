import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppPage } from "@/components/layout/AppPage";
import type { RoleKey } from "@/lib/types";

const EMERGENCY_ROLES: RoleKey[] = [
  "ADMIN",
  "BRANCH_MANAGER",
  "SECURITY",
  "EMPLOYEE",
  "HSE",
  "FIRE_WARDEN",
  "SERVICE_PROVIDER",
];

export const Route = createFileRoute("/emergency")({
  head: () => ({
    meta: [
      { title: "Emergency Evacuation — FCM Console" },
      {
        name: "description",
        content:
          "Create emergency incidents, alert employees, and track who is safe, who needs help and who has not responded.",
      },
      { property: "og:title", content: "Emergency Evacuation — FCM Console" },
      {
        property: "og:description",
        content: "Real-time employee safety confirmation during evacuations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={EMERGENCY_ROLES}>
      <Outlet />
    </AppPage>
  ),
});
