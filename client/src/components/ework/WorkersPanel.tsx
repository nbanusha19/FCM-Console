import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeCheck, LogIn, LogOut, Printer, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyRow } from "@/components/common/TableCard";
import { Pill } from "@/components/common/StatusBadge";
import { QrImage } from "@/components/common/QrImage";
import { useApp } from "@/context/app-context";
import { VisitorPhoto } from "@/components/visits/VisitorPhoto";
import { fmtDate } from "@/constants/permit-status";
import { getEwpWorkerPhoto, saveEwpWorkerPhoto } from "@/services/ewp-worker-photo-local";
import {
  checkInWorker,
  checkOutWorker,
  isPermitSecurity,
  listAttendance,
  listWorkers,
  registerWorker,
  type Permit,
  type Worker,
} from "@/services/permits";

/** Vendor workers for one permit: register, issue pass, daily check-in / check-out. */
export function WorkersPanel({ permit }: { permit: Permit }) {
  const { user } = useApp();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: workers = [] } = useQuery({
    queryKey: ["ewp-workers", permit.id],
    queryFn: () => listWorkers(permit.id),
  });
  const { data: att = [] } = useQuery({
    queryKey: ["ewp-att-permit", permit.id],
    queryFn: () => listAttendance({ permitId: permit.id }),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [pass, setPass] = useState<Worker | null>(null);
  const [registering, setRegistering] = useState<Worker | null>(null);
  const [workerPhoto, setWorkerPhoto] = useState<string | null>(null);
  const canAct =
    isPermitSecurity(user) &&
    ["VENDOR_SUBMITTED", "SECURITY_REGISTERED", "ACTIVE"].includes(permit.status);

  useEffect(() => {
    setWorkerPhoto(registering ? getEwpWorkerPhoto(registering.id) : null);
  }, [registering]);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await Promise.all(
        ["ewp-workers", "ewp-att-permit", "ewp-att", "permit", "permits", "ewp-events"].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const captureWorkerPhoto = (dataUrl: string) => {
    if (!registering) return;
    try {
      saveEwpWorkerPhoto(registering.id, dataUrl);
      setWorkerPhoto(dataUrl);
      toast.success("Worker photo saved on this browser");
    } catch {
      toast.error("Unable to save the worker photo in this browser. Free some storage and try again.");
    }
  };

  const registerWorkerWithPhoto = async () => {
    if (!registering || !workerPhoto) {
      toast.error("Capture or upload the worker's photo before issuing the pass.");
      return;
    }
    const registered = await run(
      registering.id,
      () => registerWorker(permit, registering, workers.findIndex((worker) => worker.id === registering.id), user!),
      `${registering.name} registered — pass issued`,
    );
    if (registered) setRegistering(null);
  };

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="font-display text-[16px] font-bold">Workers ({workers.length})</h2>
        <span className="text-[13px] text-muted-foreground">
          Work period {fmtDate(permit.vendor_start_date)} – {fmtDate(permit.vendor_end_date)}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Worker</TableHead>
            <TableHead>Worker ID</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Pass</TableHead>
            <TableHead>Today</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workers.length === 0 ? (
            <EmptyRow cols={6}>Waiting for the vendor to submit worker details.</EmptyRow>
          ) : null}
          {workers.map((worker) => {
            const attendance = att.find(
              (record) => record.worker_id === worker.id && record.day === today,
            );
            return (
              <TableRow key={worker.id}>
                <TableCell className="font-medium">{worker.name}</TableCell>
                <TableCell>{worker.worker_ref || "—"}</TableCell>
                <TableCell>{worker.contact || "—"}</TableCell>
                <TableCell className="font-mono text-[12px]">
                  {worker.pass_no ?? <span className="text-muted-foreground">Not issued</span>}
                </TableCell>
                <TableCell>
                  {attendance ? (
                    attendance.check_out_at ? (
                      <Pill tone="neutral">Checked out</Pill>
                    ) : (
                      <Pill tone="success">Inside</Pill>
                    )
                  ) : (
                    <Pill tone="neutral">Not arrived</Pill>
                  )}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {worker.pass_no ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Visitor pass"
                      onClick={() => setPass(worker)}
                    >
                      <Ticket className="size-4" />
                    </Button>
                  ) : null}
                  {canAct && !worker.registered_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === worker.id}
                      onClick={() => setRegistering(worker)}
                    >
                      <BadgeCheck className="size-4" /> Register
                    </Button>
                  ) : null}
                  {canAct && worker.registered_at && !attendance ? (
                    <Button
                      size="sm"
                      disabled={busy === worker.id}
                      onClick={() =>
                        void run(
                          worker.id,
                          () => checkInWorker(permit, worker, user!),
                          `${worker.name} checked in`,
                        )
                      }
                    >
                      <LogIn className="size-4" /> Check in
                    </Button>
                  ) : null}
                  {canAct && attendance && !attendance.check_out_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === worker.id}
                      onClick={() =>
                        void run(
                          worker.id,
                          () => checkOutWorker(permit, attendance, worker.name, user!),
                          `${worker.name} checked out`,
                        )
                      }
                    >
                      <LogOut className="size-4" /> Check out
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {att.length ? (
        <div className="border-t border-border px-5 py-3">
          <h3 className="mb-2 text-[13px] font-semibold">Attendance log</h3>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            {att.map((record) => (
              <li key={record.id}>
                {fmtDate(record.day)} ·{" "}
                {workers.find((worker) => worker.id === record.worker_id)?.name} · in{" "}
                {new Date(record.check_in_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {record.check_out_at
                  ? ` · out ${new Date(record.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : " · inside"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={!!pass} onOpenChange={(open) => !open && setPass(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Visitor pass — contractor</DialogTitle>
          </DialogHeader>
          {pass ? (
            <div className="space-y-3 text-center">
              {getEwpWorkerPhoto(pass.id) ? <img src={getEwpWorkerPhoto(pass.id)!} alt={`${pass.name} worker photo`} className="mx-auto size-20 rounded-xl object-cover" /> : null}
              <QrImage value={`FCM-EWP:${pass.pass_no}`} size={180} />
              <p className="font-display text-[20px] font-bold">{pass.name}</p>
              <dl className="grid grid-cols-2 gap-1 text-left text-[13px]">
                <dt className="text-muted-foreground">Pass</dt>
                <dd className="font-mono">{pass.pass_no}</dd>
                <dt className="text-muted-foreground">Permit</dt>
                <dd>{permit.permit_no}</dd>
                <dt className="text-muted-foreground">Work type</dt>
                <dd className="font-semibold">{permit.permit_type}</dd>
                <dt className="text-muted-foreground">Vendor</dt>
                <dd>{permit.vendor_name}</dd>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{permit.location}</dd>
                <dt className="text-muted-foreground">Valid</dt>
                <dd>
                  {fmtDate(permit.vendor_start_date)} – {fmtDate(permit.vendor_end_date)}
                </dd>
              </dl>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" /> Print pass
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!registering} onOpenChange={(open) => !open && setRegistering(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register worker and issue pass</DialogTitle>
            <DialogDescription>
              Capture a live photo or upload one before registering {registering?.name ?? "the worker"}.
            </DialogDescription>
          </DialogHeader>
          {registering ? (
            <div className="flex items-center gap-4 rounded-xl border border-border p-4">
              <VisitorPhoto name={registering.name} src={workerPhoto} onCapture={captureWorkerPhoto} />
              <span className="text-[13px] font-medium">{workerPhoto ? "Photo ready" : "Photo required to issue pass"}</span>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRegistering(null)}>Cancel</Button>
            <Button type="button" disabled={!workerPhoto || busy === registering?.id} onClick={() => void registerWorkerWithPhoto()}>
              <BadgeCheck className="size-4" /> Register &amp; issue pass
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
