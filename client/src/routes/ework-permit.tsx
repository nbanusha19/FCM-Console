import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppPage } from "@/components/layout/AppPage";

export const Route = createFileRoute("/ework-permit")({
  head: () => ({
    meta: [
      { title: "E-Work Permit — FCM Console" },
      { name: "description", content: "Cold and hot work permits with Health & Safety approval, vendor worker details and security check-in." },
      { property: "og:title", content: "E-Work Permit — FCM Console" },
      { property: "og:description", content: "Digital work permits from request to worker check-out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE"]}>
      <Outlet />
    </AppPage>
  ),
});
