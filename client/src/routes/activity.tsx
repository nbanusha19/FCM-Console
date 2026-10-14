import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, Mail, Search } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVms } from "@/hooks/use-vms";
import { formatDateTime, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity & Audit Trail — VMS" },
      { name: "description", content: "Every action recorded with actor, entity and timestamp." },
      { property: "og:title", content: "Activity & Audit Trail — VMS" },
      { property: "og:description", content: "Audit trail and email activity across VMS." },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY"]}>
      <ActivityPage />
    </AppPage>
  ),
});

function ActivityPage() {
  const { logs, emails } = useVms();
  const [tab, setTab] = useState("audit");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const auditRows = useMemo(
    () => logs.filter((entry) => [entry.user, entry.action, entry.module, entry.refId, entry.description].join(" ").toLowerCase().includes(query)),
    [logs, query],
  );
  const emailRows = useMemo(
    () => emails.filter((entry) => [entry.to, entry.subject, entry.visitId].join(" ").toLowerCase().includes(query)),
    [emails, query],
  );

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Governance</p>
          <h1 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight">Activity log</h1>
          <p className="mt-1 text-[11px] text-muted-foreground">Every action recorded with actor, entity and timestamp.</p>
        </div>
        <div className="relative w-full sm:w-44">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity" className="h-8 pl-8 text-[10px]" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 gap-1 rounded-md bg-transparent p-0">
          <TabsTrigger value="audit" className="h-7 rounded-md border border-transparent px-2 text-[10px] data-[state=active]:border-border data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none">
            Audit trail ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="emails" className="h-7 rounded-md border border-transparent px-2 text-[10px] data-[state=active]:border-border data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none">
            Emails ({emails.length})
          </TabsTrigger>
        </TabsList>

        <section className="surface-card mt-2 min-h-36 overflow-hidden">
          {tab === "audit" ? auditRows.length ? (
            <ul className="divide-y divide-border">
              {auditRows.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start gap-2 px-3 py-2.5 text-[10px]">
                  <History className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{entry.action} <span className="font-normal text-muted-foreground">· {entry.module}</span></p>
                    <p className="text-muted-foreground">{entry.description}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{entry.user} · {formatDateTime(entry.at)} ({relativeTime(entry.at)})</p>
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">{entry.refId}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="No activity yet" description="Actions across the system appear here." />
          ) : emailRows.length ? (
            <ul className="divide-y divide-border">
              {emailRows.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 px-3 py-2.5 text-[10px]">
                  <Mail className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{entry.subject}</p>
                    <p className="text-muted-foreground">To {entry.to} · Visit {entry.visitId}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{formatDateTime(entry.sentAt)} ({relativeTime(entry.sentAt)})</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Mail} title="No emails yet" description="Sent visitor emails appear here." />
          )}
        </section>
      </Tabs>
    </div>
  );
}