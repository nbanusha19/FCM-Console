import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/app-context";
import { employeeService, responseService } from "@/services/emergency";

export function ReportOtherEmployee({
  incidentId,
  location,
}: {
  incidentId: string;
  location: string;
}) {
  const { user } = useApp();
  const qc = useQueryClient();
  const { data: employees = [], isError: employeesError } = useQuery({
    queryKey: ["emg-employees", location],
    queryFn: () => employeeService.list(location),
    enabled: !!user && ["ADMIN", "HSE", "FIRE_WARDEN"].includes(user.role),
  });
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState<"SAFE" | "NEEDS_ASSISTANCE">("SAFE");
  const [busy, setBusy] = useState(false);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter(
      (employee) => !term || `${employee.name} ${employee.ntid}`.toLowerCase().includes(term),
    );
  }, [employees, search]);

  const submit = async () => {
    if (!employeeId || !user) {
      toast.error("Choose an employee first.");
      return;
    }
    setBusy(true);
    try {
      await responseService.reportOther(incidentId, employeeId, status, user);
      await qc.invalidateQueries();
      toast.success("Employee safety status recorded.");
      setSearch("");
      setEmployeeId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record employee status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-card space-y-3 p-5">
      <div>
        <h2 className="font-display text-[16px] font-bold">Report safety for another employee</h2>
        <p className="text-[13px] text-muted-foreground">
          Search employees and security staff by name or NTID. Your identity will be recorded as the
          reporter.
        </p>
      </div>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search employee name or NTID"
      />
      <Select value={employeeId} onValueChange={setEmployeeId}>
        <SelectTrigger>
          <SelectValue placeholder="Select employee" />
        </SelectTrigger>
        <SelectContent>
          {matches.map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              {employee.name}
              {employee.ntid ? ` · ${employee.ntid}` : ""}
            </SelectItem>
          ))}
          {employeesError ? (
            <div className="px-2 py-1.5 text-[13px] text-destructive">
              Unable to load employees for this branch.
            </div>
          ) : matches.length === 0 ? (
            <div className="px-2 py-1.5 text-[13px] text-muted-foreground">No employees found.</div>
          ) : null}
        </SelectContent>
      </Select>
      {employeeId
        ? (() => {
            const employee = employees.find((row) => row.id === employeeId);
            return employee ? (
              <p className="text-[13px] text-muted-foreground">
                Employee: <strong className="text-foreground">{employee.name}</strong> · NTID:{" "}
                {employee.ntid || "—"} · Reported by: {user?.name}
              </p>
            ) : null;
          })()
        : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as "SAFE" | "NEEDS_ASSISTANCE")}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SAFE">Safe</SelectItem>
            <SelectItem value="NEEDS_ASSISTANCE">Need Support</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={busy || !employeeId} onClick={() => void submit()}>
          {busy ? "Saving…" : "Record safety status"}
        </Button>
      </div>
    </section>
  );
}
