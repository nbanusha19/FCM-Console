import { createFileRoute } from "@tanstack/react-router";
import { VisitorCheckInVerification } from "@/components/visits/PublicVisitorPass";

export const Route = createFileRoute("/gate/$token/verify")({
  head: () => ({
    meta: [
      { title: "Visitor check-in verification — FCM Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GateVerificationPage,
});

function GateVerificationPage() {
  const { token } = Route.useParams();
  return <VisitorCheckInVerification token={token} />;
}
