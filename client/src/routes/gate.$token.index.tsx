import { createFileRoute } from "@tanstack/react-router";
import { PublicVisitorPass } from "@/components/visits/PublicVisitorPass";

export const Route = createFileRoute("/gate/$token/")({
  component: GatePassPage,
});

function GatePassPage() {
  const { token } = Route.useParams();
  return <PublicVisitorPass routeToken={token} />;
}
