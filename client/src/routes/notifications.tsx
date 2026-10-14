import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Pill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app-context";
import { formatDateTime, relativeTime } from "@/lib/format";
import { listVmsNotifications, markVmsNotificationsRead } from "@/services/vms-notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — VMS" },
      {
        name: "description",
        content:
          "All visitor alerts for your role: new requests, approvals, rejections, arrivals and departures.",
      },
      { property: "og:title", content: "Notifications — VMS" },
      {
        property: "og:description",
        content: "Requests, approvals, arrivals and departures in one feed.",
      },
    ],
  }),
  component: () => (
    <AppPage>
      <NotificationsPage />
    </AppPage>
  ),
});

function NotificationsPage() {
  const { user } = useApp();
  const queryClient = useQueryClient();
  const {
    data: mine = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["vms-notifications", user?.id],
    queryFn: listVmsNotifications,
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const unread = mine.filter((n) => !n.read).length;
  const markAllRead = async () => {
    try {
      await markVmsNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: ["vms-notifications", user?.id] });
      toast.success("All notifications marked as read");
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Unable to mark notifications as read.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        subtitle={unread ? `${unread} unread alert(s)` : "You are all caught up."}
        actions={
          <Button variant="outline" disabled={unread === 0} onClick={() => void markAllRead()}>
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        }
      />

      <section className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Loading notifications…
          </p>
        ) : isError ? (
          <p className="px-5 py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "VMS notifications could not be loaded."}
          </p>
        ) : mine.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="Requests and gate activity show up here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {mine.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <span
                  className={`mt-2 size-2 shrink-0 rounded-full ${n.read ? "bg-border" : "bg-primary"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{n.title}</p>
                  <p className="text-[12.5px] text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateTime(n.createdAt)} ({relativeTime(n.createdAt)})
                  </p>
                </div>
                {n.refId ? (
                  <Link to="/vms-visit/$id" params={{ id: n.refId }}>
                    <Pill tone="info">Open record</Pill>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
