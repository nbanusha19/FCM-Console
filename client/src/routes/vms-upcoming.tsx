import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3 } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { StatusPill } from "@/components/common/StatusBadge";
import { listVisitRequests, type VisitRequest } from "@/services/visitor-requests";

export const Route = createFileRoute("/vms-upcoming")({
  head: () => ({
    meta: [
      { title: "Upcoming Visitors — VMS" },
      {
        name: "description",
        content: "Approved visits scheduled for today or later, grouped by date.",
      },
      { property: "og:title", content: "Upcoming Visitors — VMS" },
      {
        property: "og:description",
        content: "Approved visits scheduled for today or later, grouped by day.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"]}>
      <UpcomingVisitors />
    </AppPage>
  ),
});

const todayKey = () => iso(new Date());

function UpcomingVisitors() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["visit-requests"],
    queryFn: listVisitRequests,
  });
  const today = todayKey();
  const approved = data.filter((visit) => ["APPROVED", "CARD_ISSUED"].includes(visit.status));
  const expectedToday = approved.filter((visit) => visit.visit_date === today);
  const scheduled = approved
    .filter((visit) => visit.visit_date >= today)
    .sort((a, b) =>
      `${a.visit_date} ${a.expected_arrival}`.localeCompare(
        `${b.visit_date} ${b.expected_arrival}`,
      ),
    );
  const scheduledDays = new Set(scheduled.map((visit) => visit.visit_date)).size;
  const days = [...new Set(scheduled.map((visit) => visit.visit_date))];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] text-muted-foreground">Schedule</p>
        <h1 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight">
          Upcoming visitors
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Approved visits scheduled for today or later, grouped by day.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Expected today" value={expectedToday.length} icon={Clock3} tone="blue" />
        <Metric label="Upcoming total" value={scheduled.length} icon={CalendarDays} tone="blue" />
        <Metric label="Scheduled days" value={scheduledDays} icon={CalendarDays} tone="green" />
      </div>

      <section className="surface-card min-h-34 p-3.5" aria-label="Upcoming visitor schedule">
        {isLoading ? (
          <div className="grid min-h-28 place-items-center text-[11px] text-muted-foreground">
            Loading upcoming visitors…
          </div>
        ) : scheduled.length === 0 ? (
          <div className="grid min-h-28 place-content-center justify-items-center text-center">
            <span className="mb-2 grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
              <CalendarDays className="size-3.5" />
            </span>
            <p className="text-[10px] font-semibold">No upcoming visitors</p>
            <p className="mt-1 text-[9px] text-muted-foreground">
              Approved visits for today and future dates appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {days.map((day) => {
              const visits = scheduled.filter((visit) => visit.visit_date === day);
              return (
                <div key={day} className="py-2 first:pt-0 last:pb-0">
                  <h2 className="mb-1 text-[10px] font-semibold text-muted-foreground">
                    {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    <span className="ml-1 font-normal">
                      · {visits.length} visitor{visits.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <ul className="divide-y divide-border">
                    {visits.map((visit) => (
                      <li key={visit.id} className="flex items-center gap-2 py-1.5">
                        <time className="w-12 shrink-0 text-[9px] text-muted-foreground">
                          {clockTime(visit.expected_arrival)}
                        </time>
                        <Link
                          to="/vms-visit/$id"
                          params={{ id: visit.id }}
                          className="min-w-0 flex-1 truncate text-[10px] font-semibold hover:text-primary"
                        >
                          {visit.visitor_name}
                        </Link>
                        <span className="hidden min-w-0 flex-1 truncate text-[9px] text-muted-foreground sm:block">
                          {visit.company || visit.host_name}
                        </span>
                        <StatusPill status={visit.status} className="px-1.5 py-0.5 text-[8px]" />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  tone: "blue" | "green";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
  };
  return (
    <section className="surface-card p-3">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        {label}
        <span className={`grid size-5 place-items-center rounded-md ${tones[tone]}`}>
          <Icon className="size-3" />
        </span>
      </div>
      <p className="mt-1.5 font-display text-[20px] font-extrabold leading-none">{value}</p>
    </section>
  );
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clockTime(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
