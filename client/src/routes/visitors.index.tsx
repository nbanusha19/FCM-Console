import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Download,
  Eye,
  Mail,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { NewRequestDialog } from "@/components/visits/NewRequestDialog";
import { VisitorPassDialog } from "@/components/visits/VisitorPassDialog";
import { VisitorInvitationDialog } from "@/components/visits/VisitorInvitationDialog";
import { StatusPill } from "@/components/common/StatusBadge";
import { EmptyRow } from "@/components/common/TableCard";
import { PageSizeSelect } from "@/components/common/PageSizeSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/context/app-context";
import { ApiError } from "@/lib/api";
import { statusLabel, VISIT_STATUS_KEYS } from "@/constants/visit-status";
import { isSelectableVisitorType } from "@/constants/visitor-types";
import { formatDate, formatTime, initials } from "@/lib/format";
import {
  approveVisitRequest,
  canCreateVisitRequest,
  canOpenVisitorCardDialog,
  canIssueVisitorCard,
  canDecide,
  cancelVisitRequest,
  expireStaleRequests,
  isVisitReviewer,
  listVisitRequests,
  listVisitorTypes,
  resendVisitorInvitation,
  rejectVisitRequest,
  type VisitRequest,
} from "@/services/visitor-requests";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/visitors/")({
  validateSearch: (search: Record<string, unknown>) => ({
    newRequest: search["newRequest"] === true || search["newRequest"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "All Visitors — VMS" },
      { name: "description", content: "Visitor register, statuses, arrival times and visitor passes." },
      { property: "og:title", content: "All Visitors — VMS" },
      { property: "og:description", content: "Visitor register and gate activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"]}>
      <VisitorsPage />
    </AppPage>
  ),
});

const ALL = "__all";

function VisitorsPage() {
  const { newRequest } = Route.useSearch();
  const { user } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading, error } = useQuery({ queryKey: ["visit-requests"], queryFn: listVisitRequests });
  const { data: types = [] } = useQuery({ queryKey: ["visitor-types"], queryFn: listVisitorTypes });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [date, setDate] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<VisitRequest | null>(null);
  const [pass, setPass] = useState<VisitRequest | null>(null);
  const [invitation, setInvitation] = useState<VisitRequest | null>(null);
  const [reason, setReason] = useState("");
  const reviewer = isVisitReviewer(user);
  const canCreateRequest = canCreateVisitRequest(user);

  useEffect(() => {
    if (newRequest && canCreateRequest) setCreating(true);
  }, [newRequest, canCreateRequest]);

  useEffect(() => {
    if (reviewer || user?.role === "SECURITY") {
      void expireStaleRequests().then((count) => {
        if (count) void queryClient.invalidateQueries({ queryKey: ["visit-requests"] });
      });
    }
  }, [queryClient, reviewer, user?.role]);

  const reload = () => queryClient.invalidateQueries({ queryKey: ["visit-requests"] });
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      await reload();
    } catch (cause) {
      await queryClient.invalidateQueries({ queryKey: ["visit-requests"] });
      toast.error(cause instanceof Error ? cause.message : "Action failed.");
    }
  };
  const approve = async (visit: VisitRequest) => {
    if (!user) return;
    try {
      const approvedVisit = await approveVisitRequest(visit.id, user);
      setInvitation(approvedVisit);
      toast.success(
        approvedVisit.invitation_sent_at
          ? `${visit.visitor_name} approved - invitation sent`
          : `${visit.visitor_name} approved - invitation screen opened`,
      );
      await reload();
    } catch (cause) {
      await queryClient.invalidateQueries({ queryKey: ["visit-requests"] });
      if (
        cause instanceof ApiError &&
        cause.status === 502 &&
        cause.message.includes("Visit approved")
      ) {
        try {
          const approvedVisit = (await listVisitRequests()).find((item) => item.id === visit.id);
          if (approvedVisit) setInvitation(approvedVisit);
          toast.error(
            approvedVisit
              ? "The request was approved, but its email failed. Retry from the invitation screen."
              : "The request was approved, but its email failed. Refresh the visitor list and resend the invitation.",
          );
          return;
        } catch {
          toast.error(
            "The request was approved, but its email failed. Refresh the visitor list and resend the invitation.",
          );
          return;
        }
      }
      toast.error(cause instanceof Error ? cause.message : "Could not approve this request.");
    }
  };

  const branches = [...new Set(data.map((visit) => visit.location).filter(Boolean))].sort();
  const rows = data
    .filter((visit) => status === ALL || visit.status === status)
    .filter((visit) => type === ALL || visit.visitor_type === type)
    .filter((visit) => branch === ALL || visit.location === branch)
    .filter((visit) => !date || visit.visit_date === date)
    .filter((visit) =>
      !search.trim() ||
      [visit.visitor_code, visit.visitor_name, visit.company, visit.source, visit.host_name, visit.request_no]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const comparison = `${a.visit_date} ${a.expected_arrival}`.localeCompare(`${b.visit_date} ${b.expected_arrival}`);
      return sortDesc ? -comparison : comparison;
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const typeName = (code: string) =>
    types.find((visitorType) => visitorType.code === code)?.label ??
    code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());

  const exportCsv = () => {
    const columns = ["Visitor ID", "Visitor", "Type", "Company / Source", "Host", "Visit date", "Check-in", "Check-out", "Status"];
    const values = rows.map((visit) => [
      visit.visitor_code || visit.request_no,
      visit.visitor_name,
      typeName(visit.visitor_type),
      visit.company || visit.source,
      visit.host_name,
      visit.visit_date,
      visit.checked_in_at ?? "",
      visit.checked_out_at ?? "",
      statusLabel(visit.status),
    ]);
    downloadCsv(
      `visitors-${new Date().toISOString().slice(0, 10)}.csv`,
      columns,
      values,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">{user?.role === "EMPLOYEE" ? "Visitor requests" : "Visitor register"}</p>
          <h1 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight">
            {user?.role === "EMPLOYEE" ? "My visits" : "All visitors"}
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {user?.role === "EMPLOYEE"
              ? `${data.length} visit${data.length === 1 ? "" : "s"} requested by or assigned to you.`
              : `${data.length} visitor ${data.length === 1 ? "record" : "records"} across your branches.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-3.5" /> Export CSV
          </Button>
          {canCreateRequest ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> {user?.role === "EMPLOYEE" ? "Raise visit" : "New request"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-danger">Couldn&apos;t load visitors: {(error as Error).message}</p> : null}

      <section className="surface-card overflow-hidden" aria-label="Visitor register">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
          <div className="relative min-w-47.5 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search visitors, IDs, companies..."
              className="h-8 pl-8 text-[10px]"
              aria-label="Search visitors"
            />
          </div>
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
            <SelectTrigger className="h-8 w-29.5 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {VISIT_STATUS_KEYS.map((key) => <SelectItem key={key} value={key}>{statusLabel(key)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(value) => { setType(value); setPage(1); }}>
            <SelectTrigger className="h-8 w-33 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All visitor types</SelectItem>
              {types
                .filter((visitorType) => isSelectableVisitorType(visitorType.code))
                .map((visitorType) => <SelectItem key={visitorType.code} value={visitorType.code}>{visitorType.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={branch} onValueChange={(value) => { setBranch(value); setPage(1); }}>
            <SelectTrigger className="h-8 w-28 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All branches</SelectItem>
              {branches.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(event) => { setDate(event.target.value); setPage(1); }}
            className="h-8 w-28 text-[10px]"
            aria-label="Visit date"
          />
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-280 text-[11px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-2.5 py-2 text-[9px]">Visitor ID</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Visitor</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Type</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Company / Source</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Host</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">
                  <button className="inline-flex items-center gap-1" onClick={() => { setSortDesc((value) => !value); setPage(1); }}>
                    Visit date <ArrowUpDown className="size-2.5" />
                  </button>
                </TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Check-in</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Check-out</TableHead>
                <TableHead className="px-2.5 py-2 text-[9px]">Status</TableHead>
                <TableHead className="px-2.5 py-2 text-right text-[9px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <EmptyRow cols={10}>{isLoading ? "Loading visitors…" : "No visitors match these filters."}</EmptyRow>
              ) : null}
              {pageRows.map((visit) => {
                const canIssueCard = canIssueVisitorCard(user, visit);
                const canOpenCardDialog = canOpenVisitorCardDialog(user, visit);
                return (
                  <TableRow key={visit.id} className="h-9">
                    <TableCell className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[9px] text-muted-foreground">
                      {visit.visitor_code || "—"}
                    </TableCell>
                    <TableCell className="px-2.5 py-1.5">
                      <Link to="/vms-visit/$id" params={{ id: visit.id }} className="flex items-center gap-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[8px] font-bold text-primary">
                          {initials(visit.visitor_name)}
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate font-semibold text-foreground">{visit.visitor_name}</span>
                          {visit.designation ? <span className="block truncate text-[9px] text-muted-foreground">{visit.designation}</span> : null}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-2.5 py-1.5">{typeName(visit.visitor_type)}</TableCell>
                    <TableCell className="px-2.5 py-1.5">{visit.company || visit.source || "—"}</TableCell>
                    <TableCell className="px-2.5 py-1.5">{visit.host_name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap px-2.5 py-1.5">{formatDate(visit.visit_date)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2.5 py-1.5">{formatTime(visit.checked_in_at)}</TableCell>
                    <TableCell className="whitespace-nowrap px-2.5 py-1.5">{formatTime(visit.checked_out_at)}</TableCell>
                    <TableCell className="px-2.5 py-1.5">
                      <StatusPill status={visit.status} className="px-1.5 py-0.5 text-[9px]" />
                    </TableCell>
                    <TableCell className="px-2.5 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {canOpenCardDialog ? (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[9px]" onClick={() => setPass(visit)}>
                            <Printer className="size-3" /> Issue card
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-6" aria-label={`Actions for ${visit.visitor_name}`}>
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => void navigate({ to: "/vms-visit/$id", params: { id: visit.id } })}>
                              <Eye className="size-3.5" /> View details
                            </DropdownMenuItem>
                            {user?.role !== "EMPLOYEE" && canDecide(user, visit) && visit.status === "PENDING" ? (
                              <>
                                <DropdownMenuItem onClick={() => void approve(visit)}>
                                  <CheckCircle2 className="size-3.5" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setReason(""); setRejecting(visit); }}>
                                  <XCircle className="size-3.5" /> Reject
                                </DropdownMenuItem>
                              </>
                            ) : null}
                            {["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(visit.status) && user?.role !== "SECURITY" && (reviewer || visit.requested_by === user?.id) ? (
                              <DropdownMenuItem onClick={() => void run(() => resendVisitorInvitation(visit.id), "Invitation email sent")}>
                                <Mail className="size-3.5" /> Resend invitation
                              </DropdownMenuItem>
                            ) : null}
                            {visit.requested_by === user?.id && ["PENDING", "APPROVED"].includes(visit.status) ? (
                              <DropdownMenuItem onClick={() => {
                                if (confirm("Cancel this visit request?")) void run(() => cancelVisitRequest(visit.id, user!), "Request cancelled");
                              }}>
                                <Ban className="size-3.5" /> Cancel request
                              </DropdownMenuItem>
                            ) : null}
                            {canOpenCardDialog && !canIssueCard ? (
                              <DropdownMenuItem onClick={() => setPass(visit)}>
                                <Printer className="size-3.5" /> Issue card
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2.5 py-2 text-[9px] text-muted-foreground">
          <span>Showing {rows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, rows.length)} of {rows.length}</span>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <PageSizeSelect
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
            <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[9px]" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
            <span>Page {page} of {pageCount}</span>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[9px]" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </section>

      <NewRequestDialog open={creating} onOpenChange={setCreating} onCreated={() => void reload()} />
      <VisitorPassDialog
        visit={pass}
        onClose={() => setPass(null)}
        onIssued={() => {
          void queryClient.invalidateQueries({ queryKey: ["visit-requests"] });
          void queryClient.invalidateQueries({ queryKey: ["guest-cards"] });
        }}
      />
      <VisitorInvitationDialog
        visit={invitation}
        open={!!invitation}
        onOpenChange={(open) => !open && setInvitation(null)}
      />
      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject request for {rejecting?.visitor_name}</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3}
              onClick={() => {
                const visit = rejecting!;
                setRejecting(null);
                void run(() => rejectVisitRequest(visit.id, reason.trim(), user!), "Request rejected");
              }}
            >Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}