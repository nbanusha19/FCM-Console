import { createFileRoute } from "@tanstack/react-router";
import { PublicVisitorPass } from "@/components/visits/PublicVisitorPass";

export const Route = createFileRoute("/pass/$id")({
  head: () => ({
    meta: [
      { title: "Visitor pass — FCM Console" },
      { name: "description", content: "Your visitor pass and QR code to show at the gate." },
      { property: "og:title", content: "Visitor pass — FCM Console" },
      { property: "og:description", content: "Show this pass and QR code at the security gate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <PassMessage text="We couldn't load this pass. Please try again." />,
  notFoundComponent: () => <PassMessage text="Pass not found." />,
  component: PassPage,
});

function PassPage() {
  const { id } = Route.useParams();
  return <PublicVisitorPass passId={id} />;
}

function PassMessage({ text }: { text: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">
      {text}
    </main>
  );
}
