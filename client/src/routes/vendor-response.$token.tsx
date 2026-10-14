import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dayCount, fmtDate } from "@/constants/permit-status";
import { getVendorPermit, submitVendorWorkers } from "@/lib/ewp-vendor.functions";

export const Route = createFileRoute("/vendor-response/$token")({
  head: () => ({
    meta: [
      { title: "Vendor worker details — FCM Console" },
      { name: "description", content: "Provide worker details for an approved E-Work Permit." },
      { property: "og:title", content: "Vendor worker details — FCM Console" },
      { property: "og:description", content: "Secure vendor response for an approved work permit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VendorResponse,
});

type W = { name: string; worker_ref: string; contact: string };

function VendorResponse() {
  const { token } = Route.useParams();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["vendor", token], queryFn: () => getVendorPermit({ data: { token } }), retry: false });
  const [count, setCount] = useState(1);
  const [workers, setWorkers] = useState<W[]>([{ name: "", worker_ref: "", contact: "" }]);
  const [dates, setDates] = useState<{ start: string; end: string } | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Shell><p className="text-muted-foreground">Verifying link…</p></Shell>;
  if (!data || data.state === "invalid" || data.state === "expired")
    return (
      <Shell>
        <ShieldAlert className="mx-auto size-10 text-danger" />
        <p className="text-center font-semibold">{data?.state === "expired" ? "This link has expired." : "This link is not valid."}</p>
        <p className="text-center text-[14px] text-muted-foreground">Please contact the requester for a new link.</p>
      </Shell>
    );
  const p = data.permit;
  const start = dates?.start ?? p.start_date ?? "";
  const end = dates?.end ?? p.end_date ?? "";

  const info = (
    <dl className="grid grid-cols-[130px_1fr] gap-2 text-[14px]">
      <dt className="text-muted-foreground">Permit number</dt><dd className="font-mono font-semibold">{p.permit_no}</dd>
      <dt className="text-muted-foreground">Work type</dt><dd className="font-semibold">{p.permit_type}</dd>
      <dt className="text-muted-foreground">Work</dt><dd>{p.service}</dd>
      <dt className="text-muted-foreground">Location</dt><dd>{p.location}</dd>
      <dt className="text-muted-foreground">Work period</dt><dd>{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</dd>
      <dt className="text-muted-foreground">Vendor</dt><dd>{p.vendor_name}</dd>
    </dl>
  );

  if (data.state === "submitted")
    return (
      <Shell>
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <p className="text-center font-semibold">Worker details submitted. Security will register your workers.</p>
        {info}
        <p className="text-[14px]">Workers: {p.worker_count} · {fmtDate(p.vendor_start_date)} – {fmtDate(p.vendor_end_date)}</p>
      </Shell>
    );

  const setN = (n: number) => {
    const c = Math.max(1, Math.min(50, n || 1));
    setCount(c);
    setWorkers((w) => Array.from({ length: c }, (_, i) => w[i] ?? { name: "", worker_ref: "", contact: "" }));
  };
  const upd = (i: number, k: keyof W, v: string) => setWorkers((w) => w.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const days = dayCount(start, end);

  const toReview = () => {
    if (workers.some((w) => w.name.trim().length < 2)) { toast.error("Enter every worker's name."); return; }
    if (!start || !end || end < start) { toast.error("End date must be on or after the start date."); return; }
    setReview(true);
  };
  const send = async () => {
    setBusy(true);
    try {
      await submitVendorWorkers({ data: { token, start_date: start, end_date: end, workers } });
      toast.success("Worker details submitted");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="font-display text-[22px] font-bold">E-Work Permit — vendor details</h1>
      {info}
      {review ? (
        <div className="space-y-3 rounded-lg border border-border p-4 text-[14px]">
          <p className="font-semibold">Summary</p>
          <p>Permit {p.permit_no} · {p.vendor_name}</p>
          <p>{workers.length} worker(s) · {fmtDate(start)} – {fmtDate(end)} · {days} day(s)</p>
          <ul className="list-disc pl-5">{workers.map((w, i) => <li key={i}>{w.name}{w.worker_ref ? ` · ${w.worker_ref}` : ""}{w.contact ? ` · ${w.contact}` : ""}</li>)}</ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReview(false)}>Edit</Button>
            <Button disabled={busy} onClick={send}>{busy ? "Submitting…" : "Submit worker details"}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>How many workers will come?</Label><Input type="number" min={1} max={50} value={count} onChange={(e) => setN(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={start} onChange={(e) => setDates({ start: e.target.value, end })} /></div>
            <div className="space-y-1.5"><Label>End date</Label><Input type="date" value={end} min={start} onChange={(e) => setDates({ start, end: e.target.value })} /></div>
          </div>
          <p className="text-[13px] text-muted-foreground">Duration: {days} day(s)</p>
          {workers.map((w, i) => (
            <fieldset key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
              <legend className="px-1 text-[13px] font-semibold">Worker {i + 1}</legend>
              <Input placeholder="Worker name *" value={w.name} maxLength={100} onChange={(e) => upd(i, "name", e.target.value)} />
              <Input placeholder="Worker ID" value={w.worker_ref} maxLength={50} onChange={(e) => upd(i, "worker_ref", e.target.value)} />
              <Input placeholder="Contact" value={w.contact} maxLength={30} onChange={(e) => upd(i, "contact", e.target.value)} />
            </fieldset>
          ))}
          <div className="flex justify-end"><Button onClick={toReview}>Review & submit</Button></div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="surface-card space-y-5 p-6">{children}</div>
    </main>
  );
}
