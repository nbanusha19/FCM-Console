import { createFileRoute } from "@tanstack/react-router";
import { VmsDashboard } from "@/components/visits/VmsDashboard";
import { AppPage } from "@/components/layout/AppPage";

export const Route = createFileRoute("/vms-dashboard")({
  head: () => ({
    meta: [
      { title: "Visitor Dashboard — FCM Console" },
      {
        name: "description",
        content: "Upcoming arrivals, pending visitor requests and a calendar of approved visitors.",
      },
      { property: "og:title", content: "Visitor Dashboard — FCM Console" },
      {
        property: "og:description",
        content: "Upcoming arrivals, pending requests and approved-visitor calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"]}>
      <VmsDashboard />
    </AppPage>
  ),
});
