import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { VisitList } from "@/components/visits/VisitList";
import type { VisitRequest } from "@/services/visitor-requests";
import { isFinished } from "@/constants/visit-status";

export const Route = createFileRoute("/vms-history")({
  head: () => ({
    meta: [
      { title: "Visit history — FCM Console" },
      { name: "description", content: "Completed and past visitor records with check-in, check-out and duration." },
      { property: "og:title", content: "Visit history — FCM Console" },
      { property: "og:description", content: "Completed and past visitor records with check-in, check-out and duration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY"]}>
      <PageHeader eyebrow="Visitor Management" title="Visit history" subtitle="Completed and past visitor records with check-in, check-out and duration." />
      <VisitList preset={preset} columns={["visitor","host","company","date","checkin","checkout","duration","card","status","location"]} sort={"desc"} exportName="visit-history" />
    </AppPage>
  ),
});

const preset = (v: VisitRequest) => isFinished(v.status) || v.visit_date < new Date().toISOString().slice(0, 10);
