import { createFileRoute, Link } from "@tanstack/react-router";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/gate-desk")({
  head: () => ({
    meta: [
      { title: "Visitor cards — FCM Console" },
      { name: "description", content: "Issue and receive visitor cards from the visitor register." },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY"]}>
      <PageHeader
        title="Visitor cards"
        subtitle="Visitors check in and check out using their invitation email. Staff issue cards after check-in and record returned cards."
      />
      <section className="surface-card mt-4 space-y-3 p-5">
        <p className="text-sm text-muted-foreground">
          Use the visitor register to issue cards to checked-in visitors or record a card return. Staff check-in and check-out are not available.
        </p>
        <Button asChild>
          <Link to="/visitors">Open visitor register</Link>
        </Button>
      </section>
    </AppPage>
  ),
});
