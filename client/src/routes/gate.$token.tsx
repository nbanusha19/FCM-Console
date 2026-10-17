import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/gate/$token")({
  head: () => ({
    meta: [{ title: "Visitor pass — FCM Console" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
