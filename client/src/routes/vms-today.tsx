import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, UsersRound, UserRoundCheck } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { StatusPill } from "@/components/common/StatusBadge";
import { VisitList } from "@/components/visits/VisitList";
import { durationBetween, formatTime, initials, nowMinutes, timeToMinutes } from "@/lib/format";
import { listGuestCards, listVisitRequests, type VisitRequest } from "@/services/visitor-requests";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/vms-today")({
  head: () => ({
    meta: [
      { title: "Currently Inside — VMS" },
      { name: "description", content: "Visitors who have checked in and not yet checked out." },
      { property: "og:title", content: "Currently Inside — VMS" },
      { property: "og:description", content: "Live VMS visitor occupancy and issued cards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY"]}>
      <CurrentlyInside />
    </AppPage>
  ),
});

function CurrentlyInside() {
  const { data: visits = [], isLoading } = useQuery({ queryKey: ["visit-requests"], queryFn: listVisitRequests });
  const { data: cards = [] } = useQuery({ queryKey: ["guest-cards"], queryFn: listGuestCards });
  const today = new Date().toISOString().slice(0, 10);
  const inside = visits
    .filter((visit) => visit.status === "CHECKED_IN" && !visit.checked_out_at)
    .sort((a, b) => (a.checked_in_at ?? "").localeCompare(b.checked_in_at ?? ""));
  const pastExpectedExit = inside.filter((visit) =>
    visit.visit_date < today ||
    (visit.visit_date === today && timeToMinutes(visit.expected_departure) < nowMinutes()),
  ).length;
  const cardsIssued = inside.filter((visit) => Boolean(visit.guest_card_id)).length;
  const cardCode = (visit: VisitRequest) => cards.find((card) => card.id === visit.guest_card_id)?.code ?? visit.visitor_code;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] text-muted-foreground">Live occupancy</p>
        <h1 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight">Currently inside</h1>
        <p className="mt-1 text-[11px] text-muted-foreground">Visitors who have checked in and not yet checked out.</p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Visitors on site" value={inside.length} icon={UserRoundCheck} tone="green" />
        <Metric label="Past expected exit" value={pastExpectedExit} icon={CalendarClock} tone="blue" />
        <Metric label="Cards issued" value={cardsIssued} icon={UsersRound} tone="blue" />
      </div>

      {isLoading ? (
        <div className="surface-card p-6 text-center text-[11px] text-muted-foreground">Loading visitors…</div>
      ) : inside.length ? (
        <div className="grid gap-2.5 xl:grid-cols-3">
          {inside.map((visit) => (
            <section key={visit.id} className="surface-card flex min-w-0 flex-col p-2.5">
              <div className="flex items-start gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[8px] font-bold text-primary">
                  {initials(visit.visitor_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold leading-tight">{visit.visitor_name}</p>
                  <p className="truncate text-[9px] text-muted-foreground">{visit.company || visit.designation || "Visitor"}</p>
                </div>
                <StatusPill status={visit.status} label="Inside" className="px-1.5 py-0.5 text-[8px]" />
              </div>

              <dl className="mt-2 space-y-1 text-[9px]">
                <Detail label="Visitor ID" value={visit.visitor_code || visit.request_no} mono />
                <Detail label="Checked in" value={formatTime(visit.checked_in_at)} />
                <Detail label="Expected out" value={formatClock(visit.expected_departure)} />
                <Detail label="On site" value={durationBetween(visit.checked_in_at)} />
                <Detail label="Card" value={cardCode(visit)} mono />
                <Detail label="Host" value={visit.host_name || "—"} />
                <Detail label="Branch" value={visit.location || "—"} />
              </dl>

            </section>
          ))}
        </div>
      ) : (
        <section className="surface-card grid min-h-32 place-items-center p-5 text-center" aria-label="No visitors inside">
          <p className="text-[11px] text-muted-foreground">No visitors are currently inside.</p>
        </section>
      )}

      <section className="space-y-2" aria-label="Today's scheduled visits">
        <h2 className="text-[14px] font-semibold">Today&apos;s scheduled visits</h2>
        <VisitList
          preset={(visit) => visit.visit_date === today}
          columns={["visitor", "host", "company", "date", "time", "status", "checkin", "checkout", "card", "location"]}
          showDateRange={false}
          showTypeFilter
          exportName="today-visits"
        />
      </section>

    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: "blue" | "green" }) {
  const tones = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600" };
  return (
    <section className="surface-card p-3">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        {label}
        <span className={`grid size-5 place-items-center rounded-md ${tones[tone]}`}><Icon className="size-3" /></span>
      </div>
      <p className="mt-1.5 font-display text-[20px] font-extrabold leading-none">{value}</p>
    </section>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-medium ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function formatClock(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
