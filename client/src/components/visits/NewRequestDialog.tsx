import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/context/app-context";
import { isPastVisitStart, todayBusinessISO } from "@/lib/visit-schedule";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  branchHostOptionLabel,
  createVisitRequest,
  isVisitReviewer,
  listBranchHosts,
  listLocations,
  listVisitorEmployeeOptions,
  listVisitorTypes,
  type VisitInput,
} from "@/services/visitor-requests";
import { notifyHostForApproval } from "@/services/vms-notify";

type Errors = Partial<Record<keyof VisitInput, string | undefined>>;
type FormKey = Exclude<keyof VisitInput, "host_id">;

function emptyForm(): VisitInput {
  return {
    visitor_name: "",
    visitor_type: "EXTERNAL",
    visitor_employee_id: null,
    visitor_branch_id: null,
    host_id: null,
    host_department: "",
    location: "",
    company: "",
    email: "",
    phone: "",
    designation: "",
    purpose: "",
    host_name: "",
    visit_date: todayBusinessISO(),
    expected_arrival: "10:00",
    expected_departure: "12:00",
    remarks: "",
  };
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-[12px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}

const TIME_HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function TimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const [rawHours = "10", minutes = "00"] = value.split(":");
  const hour24 = Number(rawHours);
  const hour12 = String(hour24 % 12 || 12).padStart(2, "0");
  const period = hour24 >= 12 ? "PM" : "AM";
  const update = (nextHour: string, nextMinute: string, nextPeriod: string) => {
    const hours24 = (Number(nextHour) % 12) + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(hours24).padStart(2, "0")}:${nextMinute}`);
  };

  return (
    <Field label={label} error={error}>
      <div className="grid grid-cols-[1fr_1fr_0.9fr] gap-1.5">
        <Select value={hour12} onValueChange={(next) => update(next, minutes, period)}>
          <SelectTrigger aria-label={`${label} hour`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_HOURS.map((hour) => (
              <SelectItem key={hour} value={hour}>
                {hour}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={minutes} onValueChange={(next) => update(hour12, next, period)}>
          <SelectTrigger aria-label={`${label} minute`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_MINUTES.map((minute) => (
              <SelectItem key={minute} value={minute}>
                {minute}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(next) => update(hour12, minutes, next)}>
          <SelectTrigger aria-label={`${label} AM or PM`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

export function NewRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const { user, refresh } = useApp();
  const [form, setForm] = useState<VisitInput>(() => emptyForm());
  const { data: locations = [] } = useQuery({ queryKey: ["vms-locations"], queryFn: listLocations });
  const { data: visitorTypes = [] } = useQuery({ queryKey: ["visitor-types"], queryFn: listVisitorTypes });
  const { data: employeeOptions, error: employeeOptionsError } = useQuery({
    queryKey: ["visitor-employee-options"],
    queryFn: listVisitorEmployeeOptions,
    enabled: open,
  });
  const destinationBranch = employeeOptions?.branches.find((branch) =>
    [branch.name, branch.address].some(
      (value) => value.trim().toLocaleLowerCase() === form.location.trim().toLocaleLowerCase(),
    ),
  );
  const { data: hosts = [], error: hostsError } = useQuery({
    queryKey: ["branch-hosts", destinationBranch?.id],
    queryFn: () => listBranchHosts(destinationBranch!.id),
    enabled: open && Boolean(destinationBranch),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setErrors({});
    }
  }, [open, user?.name, user?.id]);

  const set = (key: FormKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e: Errors = {};
    if (form.visitor_type === "EMPLOYEE") {
      if (!form.visitor_branch_id) e.visitor_branch_id = "Choose the employee's branch.";
      if (!form.visitor_employee_id) e.visitor_employee_id = "Choose the internal visitor.";
      const sourceBranch = employeeOptions?.branches.find((branch) => branch.id === form.visitor_branch_id);
      const destination = locations.find((location) => location.name === form.location);
      if (sourceBranch && destination && [sourceBranch.name, sourceBranch.address].some(
        (value) => value.trim().toLocaleLowerCase() === destination.name.trim().toLocaleLowerCase(),
      )) {
        e.visitor_branch_id = "Internal visitors must be from the other branch.";
      }
    } else {
      if (form.visitor_name.trim().length < 3) e.visitor_name = "Enter the visitor's full name.";
      if (!form.company.trim()) e.company = "Company is required.";
      if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Enter a valid email address.";
      const phoneDigits = form.phone.replace(/\D/g, "").length;
      if (phoneDigits < 8 || phoneDigits > 15 || !/^[\d+\s()-]+$/.test(form.phone)) e.phone = "Enter a valid phone number.";
      if (!form.phone.trim()) e.phone = "Phone number is required.";
    }
    if (!form.host_id) e.host_name = "Choose who the visitor will meet.";
    if (!form.location) e.location = "Choose the location.";
    if (form.purpose.trim().length < 3) e.purpose = "Describe the purpose of the visit.";
    if (!form.visit_date) e.visit_date = "Select the visit date.";
    else if (form.visit_date < todayBusinessISO()) e.visit_date = "Visit date cannot be in the past.";
    if (
      form.visit_date &&
      form.expected_arrival &&
      form.visit_date === todayBusinessISO() &&
      isPastVisitStart(form.visit_date, form.expected_arrival)
    ) {
      e.expected_arrival = "Invalid time. Please select a proper time schedule.";
    }
    if (form.expected_departure <= form.expected_arrival) e.expected_departure = "End time must be after start time.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!user) return;
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const v = await createVisitRequest(
        Object.fromEntries(Object.entries(form).map(([k, val]) => [k, typeof val === "string" ? val.trim() : val])) as unknown as VisitInput,
        user,
      );
      toast.success(`Request ${v.request_no} submitted`, {
        description: v.status === "APPROVED" ? "Approved — you can now send the invitation." : "Waiting for host approval.",
      });
      if (v.status === "PENDING") void notifyHostForApproval(v, user);
      onOpenChange(false);
      refresh();
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this request.");
    } finally {
      setSaving(false);
    }
  };

  const input = (key: FormKey, props: Record<string, unknown> = {}) => (
    <Input value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} {...props} />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New visitor request</DialogTitle>
          <DialogDescription>
            "The host you choose will review this request."
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visitor type">
            <Select value={form.visitor_type} onValueChange={(v) => {
              setForm((current) => ({
                ...current,
                visitor_type: v,
                visitor_employee_id: null,
                visitor_branch_id: null,
                ...(current.visitor_type === "EMPLOYEE" && v === "EXTERNAL" ? {
                  visitor_name: "",
                  company: "",
                  email: "",
                  phone: "",
                  designation: "",
                } : {}),
              }));
              setErrors((current) => ({
                ...current,
                visitor_branch_id: undefined,
                visitor_employee_id: undefined,
                visitor_name: undefined,
                company: undefined,
                email: undefined,
                phone: undefined,
              }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{visitorTypes.map((type) => <SelectItem key={type.code} value={type.code}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {form.visitor_type === "EMPLOYEE" ? (
            <>
              <Field label="Employee's branch" error={errors.visitor_branch_id}>
                <Select
                  value={form.visitor_branch_id ?? ""}
                  onValueChange={(id) => {
                    setForm((current) => ({
                      ...current,
                      visitor_branch_id: id,
                      visitor_employee_id: null,
                      visitor_name: "",
                      email: "",
                      phone: "",
                      designation: "",
                      company: employeeOptions?.branches.find((branch) => branch.id === id)?.name ?? "",
                    }));
                    setErrors((current) => ({
                      ...current,
                      visitor_branch_id: undefined,
                      visitor_employee_id: undefined,
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choose source branch" /></SelectTrigger>
                  <SelectContent>
                    {(employeeOptions?.branches ?? [])
                      .filter((branch) => {
                        const destination = locations.find((location) => location.name === form.location);
                        return (employeeOptions?.employees ?? []).some((employee) => employee.branch_id === branch.id)
                          && (!destination || ![branch.name, branch.address].some(
                          (value) => value.trim().toLocaleLowerCase() === destination.name.trim().toLocaleLowerCase(),
                          ));
                      })
                      .map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Internal visitor" error={errors.visitor_employee_id}>
                <Select
                  value={form.visitor_employee_id ?? ""}
                  disabled={!form.visitor_branch_id}
                  onValueChange={(id) => {
                    const employee = employeeOptions?.employees.find((item) => item.id === id);
                    if (!employee) return;
                    setForm((current) => ({
                      ...current,
                      visitor_employee_id: id,
                      visitor_name: employee.name,
                      email: employee.email,
                      phone: employee.phone ?? "",
                      designation: employee.designation ?? "",
                      company: employeeOptions.branches.find((branch) => branch.id === employee.branch_id)?.name ?? "",
                    }));
                    setErrors((current) => ({ ...current, visitor_employee_id: undefined }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                  <SelectContent>
                    {(employeeOptions?.employees ?? [])
                      .filter((employee) => employee.branch_id === form.visitor_branch_id)
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
          {employeeOptionsError ? (
            <p role="alert" className="sm:col-span-2 text-[13px] text-danger">
              Unable to load internal visitor employees: {employeeOptionsError.message}
            </p>
          ) : null}
          {hostsError ? (
            <p role="alert" className="sm:col-span-2 text-[13px] text-danger">
              Unable to load hosts for this branch: {hostsError.message}
            </p>
          ) : null}
          {form.visitor_type !== "EMPLOYEE" ? (
            <>
              <Field label="Visitor name" error={errors.visitor_name}>
                {input("visitor_name")}
              </Field>
              <Field label="Company / branch" error={errors.company}>
                {input("company")}
              </Field>
            </>
          ) : null}
          <Field label="Email" error={errors.email}>{input("email", { type: "email", readOnly: form.visitor_type === "EMPLOYEE" })}</Field>
          <Field label="Phone" error={errors.phone}>{input("phone", { readOnly: form.visitor_type === "EMPLOYEE" })}</Field>
          <Field label="Designation">{input("designation", { readOnly: form.visitor_type === "EMPLOYEE" })}</Field>
          <Field label="Person to visit (host)" error={errors.host_name}>
            <Select
              value={form.host_id ?? ""}
              disabled={!destinationBranch}
              onValueChange={(id) => {
                const host = hosts.find((candidate) => candidate.id === id);
                setForm((current) => ({ ...current, host_id: id, host_name: host?.name ?? "" }));
                setErrors((current) => ({ ...current, host_name: undefined }));
              }}
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
          <Field label="Host department">{input("host_department", { placeholder: "e.g. Engineering" })}</Field>
          <Field label="Location" error={errors.location}>
            <Select value={form.location} onValueChange={(v) => {
              const newDestination = employeeOptions?.branches.find((branch) =>
                [branch.name, branch.address].some(
                  (value) => value.trim().toLocaleLowerCase() === v.trim().toLocaleLowerCase(),
                ),
              );
              const selectedHost = hosts.find((host) => host.id === form.host_id);
              const selectedHostChangesBranch = selectedHost && selectedHost.branch_id !== newDestination?.id;
              const source = employeeOptions?.branches.find((branch) => branch.id === form.visitor_branch_id);
              const sourceMatchesDestination = source && [source.name, source.address].some(
                (value) => value.trim().toLocaleLowerCase() === v.trim().toLocaleLowerCase(),
              );
              setForm((current) => ({
                ...current,
                location: v,
                ...(selectedHostChangesBranch ? { host_id: null, host_name: "" } : {}),
                ...(sourceMatchesDestination ? {
                  visitor_branch_id: null,
                  visitor_employee_id: null,
                  visitor_name: "",
                  email: "",
                  phone: "",
                  designation: "",
                  company: "",
                } : {}),
              }));
              setErrors((current) => ({
                ...current,
                location: undefined,
                ...(selectedHostChangesBranch ? { host_name: undefined } : {}),
                ...(sourceMatchesDestination ? { visitor_branch_id: undefined, visitor_employee_id: undefined } : {}),
              }));
            }}>
              <SelectTrigger><SelectValue placeholder="Choose location" /></SelectTrigger>
              <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Visit date" error={errors.visit_date}>{input("visit_date", { type: "date", min: todayBusinessISO() })}</Field>
          <TimeField
            label="Start time"
            value={form.expected_arrival}
            onChange={(value) => set("expected_arrival", value)}
            error={errors.expected_arrival}
          />
          <TimeField
            label="End time"
            value={form.expected_departure}
            onChange={(value) => set("expected_departure", value)}
            error={errors.expected_departure}
          />
          <div className="sm:col-span-2">
            <Field label="Purpose" error={errors.purpose}>{input("purpose")}</Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Remarks">
              <Textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {isVisitReviewer(user) ? "Schedule" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
