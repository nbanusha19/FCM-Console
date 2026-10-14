import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_NAME } from "@/constants/brand";
import { getWalkInOptions, getWalkInStatus, submitWalkIn } from "@/lib/walk-in.functions";
import { branchHostOptionLabel, listBranchHosts, type BranchUser } from "@/services/visitor-requests";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Visitor registration — FCM Console" },
      { name: "description", content: "Register your visit and send a request to the person you are meeting." },
      { property: "og:title", content: "Visitor registration — FCM Console" },
      { property: "og:description", content: "Walk-in guests register here and get a visit QR once approved." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => <p className="p-10 text-center text-muted-foreground">Registration is unavailable right now. Please ask security.</p>,
  notFoundComponent: () => <p className="p-10 text-center text-muted-foreground">Not found.</p>,
  component: Register,
});

const EMPTY = { visitor_name: "", visitor_type: "EXTERNAL", visitor_employee_id: "", visitor_branch_id: "", company: "", email: "", phone: "", purpose: "", host_id: "", host_department: "", location: "", expected_arrival: "", expected_departure: "", remarks: "" };
type F = typeof EMPTY;

function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{error ? <p className="text-[12px] text-danger">{error}</p> : null}</div>;
}

function Register() {
  const [opts, setOpts] = useState<{
    employees: { id: string; name: string; designation: string; branch_id: string }[];
    branches: { id: string; name: string; address: string }[];
    types: { code: string; label: string }[];
    locations: string[];
  }>({ employees: [], branches: [], types: [], locations: [] });
  const [optionsError, setOptionsError] = useState("");
  const [f, setF] = useState<F>(EMPTY);
  const [err, setErr] = useState<Partial<Record<keyof F, string>>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ id: string; request_no: string; host: string } | null>(null);
  const [st, setSt] = useState("PENDING");
  const destinationBranch = opts.branches.find((branch) =>
    [branch.name, branch.address].some(
      (value) => value.trim().toLocaleLowerCase() === f.location.trim().toLocaleLowerCase(),
    ),
  );
  const { data: hosts = [], error: hostsError } = useQuery<BranchUser[]>({
    queryKey: ["branch-hosts", destinationBranch?.id],
    queryFn: () => listBranchHosts(destinationBranch!.id),
    enabled: Boolean(destinationBranch),
  });

  useEffect(() => {
    void getWalkInOptions()
      .then(setOpts)
      .catch((error: unknown) => setOptionsError(error instanceof Error ? error.message : "Unable to load registration options."));
    const now = new Date();
    const hh = (d: Date) => d.toTimeString().slice(0, 5);
    setF((x) => ({ ...x, expected_arrival: hh(now), expected_departure: now.getHours() >= 23 ? "23:59" : hh(new Date(now.getTime() + 3600000)) }));
  }, []);
  useEffect(() => {
    if (!sent || st !== "PENDING") return;
    const t = setInterval(() => void getWalkInStatus({ data: { id: sent.id } }).then((r) => r && setSt(r.status)), 5000);
    return () => clearInterval(t);
  }, [sent, st]);

  const set = (k: keyof F, v: string) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const validate = () => {
    const e: Partial<Record<keyof F, string>> = {};
    if (f.visitor_name.trim().length < 3) e.visitor_name = "Enter your full name.";
    if (f.visitor_type === "EMPLOYEE") {
      if (!f.visitor_branch_id) e.visitor_branch_id = "Choose the employee's branch.";
      if (!f.visitor_employee_id) e.visitor_employee_id = "Choose the internal visitor.";
      const source = opts.branches.find((branch) => branch.id === f.visitor_branch_id);
      if (source && f.location && [source.name, source.address].some(
        (value) => value.trim().toLocaleLowerCase() === f.location.trim().toLocaleLowerCase(),
      )) e.visitor_branch_id = "Internal visitors must be from the other branch.";
    } else {
      if (!f.company.trim()) e.company = "Company is required.";
      if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email.";
      if (!/^[\d+\s-]{8,20}$/.test(f.phone)) e.phone = "Enter a valid phone number.";
    }
    if (f.purpose.trim().length < 3) e.purpose = "Tell us why you're visiting.";
    if (!f.host_id) e.host_id = "Choose who you are visiting.";
    if (f.expected_departure <= f.expected_arrival) e.expected_departure = "End time must be after start time.";
    setErr(e);
    return !Object.keys(e).length;
  };
  const go = async () => {
    if (!validate()) return;
    setBusy(true);
    try { setSent(await submitWalkIn({ data: f })); } catch (e) { setErr({ remarks: e instanceof Error ? e.message : "Could not submit." }); } finally { setBusy(false); }
  };

  const inp = (k: keyof F, p: Record<string, unknown> = {}) => <Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...p} />;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="surface-card mx-auto max-w-xl space-y-5 p-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{APP_NAME} · Visitor registration</p>
          <h1 className="text-[24px] font-bold">Register your visit</h1>
        </div>
        {sent ? (
          <div className="space-y-3 text-center">
            {st === "APPROVED" ? <CheckCircle2 className="mx-auto size-10 text-success" /> : st === "REJECTED" ? <XCircle className="mx-auto size-10 text-danger" /> : <Clock className="mx-auto size-10 text-warning" />}
            <p className="text-[16px] font-semibold">
              {st === "APPROVED" ? "Approved! Show your visit QR at the security desk." : st === "REJECTED" ? "Sorry, your request was declined." : `Request ${sent.request_no} sent to ${sent.host}. Waiting for approval…`}
            </p>
            {st === "APPROVED" ? <Button asChild><Link to="/pass/$id" params={{ id: sent.id }}>Open my visit QR</Link></Button> : null}
            <p className="text-[12px] text-muted-foreground">Keep this page open — it updates on its own.</p>
          </div>
        ) : (
          <>
            {optionsError ? <p role="alert" className="text-[13px] text-danger">{optionsError}</p> : null}
            {hostsError ? <p role="alert" className="text-[13px] text-danger">Unable to load hosts for this branch: {hostsError.message}</p> : null}
            <h2 className="text-[13px] font-semibold text-muted-foreground">Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Visitor type">
                <Select value={f.visitor_type} onValueChange={(v) => {
                  setF((current) => ({
                    ...current,
                    visitor_type: v,
                    visitor_employee_id: "",
                    visitor_branch_id: "",
                    ...(current.visitor_type === "EMPLOYEE" && v === "EXTERNAL" ? {
                      visitor_name: "",
                      company: "",
                      email: "",
                      phone: "",
                    } : {}),
                  }));
                  setErr((current) => ({
                    ...current,
                    visitor_employee_id: undefined,
                    visitor_branch_id: undefined,
                    visitor_name: undefined,
                    company: undefined,
                    email: undefined,
                    phone: undefined,
                  }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{opts.types.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {f.visitor_type === "EMPLOYEE" ? (
                <>
                  <Field label="Employee's branch" error={err.visitor_branch_id}>
                    <Select
                      value={f.visitor_branch_id}
                      onValueChange={(id) => {
                        setF((current) => ({
                          ...current,
                          visitor_branch_id: id,
                          visitor_employee_id: "",
                          visitor_name: "",
                          email: "",
                          phone: "",
                          company: opts.branches.find((branch) => branch.id === id)?.name ?? "",
                        }));
                        setErr((current) => ({
                          ...current,
                          visitor_branch_id: undefined,
                          visitor_employee_id: undefined,
                        }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose source branch" /></SelectTrigger>
                      <SelectContent>
                        {opts.branches
                          .filter((branch) => opts.employees.some((employee) => employee.branch_id === branch.id)
                            && (!f.location || ![branch.name, branch.address].some(
                              (value) => value.trim().toLocaleLowerCase() === f.location.trim().toLocaleLowerCase(),
                            )))
                          .map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Internal visitor" error={err.visitor_employee_id}>
                    <Select
                      value={f.visitor_employee_id}
                      disabled={!f.visitor_branch_id}
                      onValueChange={(id) => {
                        const employee = opts.employees.find((item) => item.id === id);
                        if (!employee) return;
                        setF((current) => ({
                          ...current,
                          visitor_employee_id: id,
                          visitor_name: employee.name,
                          email: "",
                          phone: "",
                          company: opts.branches.find((branch) => branch.id === employee.branch_id)?.name ?? "",
                        }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                      <SelectContent>
                        {opts.employees
                          .filter((employee) => employee.branch_id === f.visitor_branch_id)
                          .map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.name}{employee.designation ? ` — Designation: ${employee.designation}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : null}
              <Field label="Full name" error={err.visitor_name}>{inp("visitor_name", { readOnly: f.visitor_type === "EMPLOYEE" })}</Field>
              {f.visitor_type === "EXTERNAL" ? <Field label="Company" error={err.company}>
                {inp("company", { readOnly: f.visitor_type === "EMPLOYEE" })}
              </Field> : null}
              {f.visitor_type === "EXTERNAL" ? <>
                <Field label="Phone" error={err.phone}>{inp("phone", { type: "tel" })}</Field>
                <div className="sm:col-span-2"><Field label="Email" error={err.email}>{inp("email", { type: "email" })}</Field></div>
              </> : <p className="sm:col-span-2 text-[12px] text-muted-foreground">The selected employee's work contact details will be used for the visit invitation.</p>}
              <div className="sm:col-span-2"><Field label="Purpose of visit" error={err.purpose}>{inp("purpose")}</Field></div>
            </div>
            <h2 className="text-[13px] font-semibold text-muted-foreground">Your visit (today)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Person to visit" error={err.host_id}>
                <Select
                  value={f.host_id}
                  disabled={!destinationBranch}
                  onValueChange={(id) => set("host_id", id)}
                >
                  <SelectTrigger><SelectValue placeholder="Select the host from the dropdown" /></SelectTrigger>
                  <SelectContent>
                    {hosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>
                        {branchHostOptionLabel(host)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Their department (optional)">{inp("host_department")}</Field>
              <Field label="Location">
                <Select value={f.location} onValueChange={(v) => {
                  const newDestination = opts.branches.find((branch) =>
                    [branch.name, branch.address].some(
                      (value) => value.trim().toLocaleLowerCase() === v.trim().toLocaleLowerCase(),
                    ),
                  );
                  const selectedHost = hosts.find((host) => host.id === f.host_id);
                  const selectedHostChangesBranch = selectedHost && selectedHost.branch_id !== newDestination?.id;
                  const source = opts.branches.find((branch) => branch.id === f.visitor_branch_id);
                  const sourceMatchesDestination = source && [source.name, source.address].some(
                    (value) => value.trim().toLocaleLowerCase() === v.trim().toLocaleLowerCase(),
                  );
                  setF((current) => ({
                    ...current,
                    location: v,
                    ...(selectedHostChangesBranch ? { host_id: "" } : {}),
                    ...(sourceMatchesDestination ? {
                      visitor_branch_id: "",
                      visitor_employee_id: "",
                      visitor_name: "",
                      email: "",
                      phone: "",
                      company: "",
                    } : {}),
                  }));
                  setErr((current) => ({
                    ...current,
                    ...(selectedHostChangesBranch ? { host_id: undefined } : {}),
                    ...(sourceMatchesDestination ? { visitor_branch_id: undefined, visitor_employee_id: undefined } : {}),
                  }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose location" /></SelectTrigger>
                  <SelectContent>{opts.locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start">{inp("expected_arrival", { type: "time" })}</Field>
                <Field label="End" error={err.expected_departure}>{inp("expected_departure", { type: "time" })}</Field>
              </div>
              <div className="sm:col-span-2"><Field label="Remarks" error={err.remarks}><Textarea value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field></div>
            </div>
            <Button className="w-full" disabled={busy} onClick={() => void go()}>{busy ? "Sending…" : "Send visit request"}</Button>
          </>
        )}
      </div>
    </main>
  );
}
