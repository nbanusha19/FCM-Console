import { localDb } from "@/services/local-client";
import type { Database } from "@/lib/database.types";
import type { AppUser } from "@/lib/types";
import { apiRequest } from "@/lib/api";
import { listBranches } from "@/services/branches";

type T = Database["public"]["Tables"];
export type Incident = T["emergencies"]["Row"];
export type IncidentEmployee = T["emg_incident_employees"]["Row"];
export type IncidentActivity = T["emg_activity"]["Row"];
export type AssemblyPoint = T["emg_assembly_points"]["Row"];
export type IncidentType = T["emg_incident_types"]["Row"];
export type EmployeeProfile = {
  id: string;
  name: string;
  email: string;
  department: string;
  ntid: string;
  building: string;
};
export type EmergencyResponse = IncidentEmployee & {
  employee_ntid?: string;
  building?: string;
  reported_by_name?: string | null;
  reporter_id?: string | null;
};

/** Admin / H&S create and manage incidents. */
export const canManageEmergency = (u: AppUser | null) => u?.role === "ADMIN" || u?.role === "HSE";
/** HSE/Admin and fire wardens can see incident-wide employee information. */
export const canMonitorEmergency = (u: AppUser | null) =>
  canManageEmergency(u) || u?.role === "FIRE_WARDEN";
/** Everyone except incident managers and fire wardens must submit their own response. */
export const canRespondEmergency = (u: AppUser | null) =>
  Boolean(u && !["ADMIN", "HSE", "FIRE_WARDEN"].includes(u.role));
export const canUseEmergency = (u: AppUser | null) =>
  canMonitorEmergency(u) || canRespondEmergency(u);

/** User-facing messages — never expose technical errors. */
export const EMG_ERRORS = {
  create: "Unable to create the emergency incident. Please try again.",
  safety: "Unable to record your safety response. Please try again.",
  notify: "Unable to send the emergency notification. Please contact the administrator.",
  assist: "Unable to update the assistance status. Please try again.",
};

function fail(error: { message: string } | null, msg?: string) {
  if (error) throw new Error(msg ?? error.message);
}

export async function logActivity(
  incidentId: string,
  action: string,
  description: string,
  user: AppUser,
) {
  await localDb.from("emg_activity").insert({
    incident_id: incidentId,
    action,
    description,
    performed_by: user.id,
    performed_by_name: user.name,
  });
}

export const employeeService = {
  async list(location: string): Promise<EmployeeProfile[]> {
    const branches = await listBranches(false);
    const normalizedLocation = location.trim().toLocaleLowerCase();
    const branch = branches.find((item) =>
      [item.name, item.address].some(
        (value) => value.trim().toLocaleLowerCase() === normalizedLocation,
      ),
    );
    if (!branch) return [];

    const { data, error } = await localDb
      .from("profiles")
      .select("id,name,email,department,role,ntid,building,branch_id,status");
    fail(error);
    return (data ?? [])
      .filter((row) => {
        const profile = row as unknown as {
          role?: string;
          branch_id?: string | null;
          status?: string;
        };
        return (
          ["EMPLOYEE", "BRANCH_MANAGER", "SECURITY"].includes((profile.role ?? "").toUpperCase()) &&
          profile.status === "ACTIVE" &&
          profile.branch_id?.toLocaleLowerCase() === branch.id.toLocaleLowerCase()
        );
      })
      .map((row) => {
        const profile = row as unknown as {
          id: string;
          name: string;
          email: string;
          department?: string;
          ntid?: string;
          building?: string;
        };
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          department: profile.department ?? "",
          ntid: profile.ntid ?? "",
          building: profile.building ?? "",
        };
      });
  },
};

export const configService = {
  async types(all = false) {
    let q = localDb.from("emg_incident_types").select("*").order("sort_order");
    if (!all) q = q.eq("active", true);
    const { data, error } = await q;
    fail(error);
    return data ?? [];
  },
  async saveType(t: Partial<IncidentType> & { name: string }) {
    const { error } = t.id
      ? await localDb.from("emg_incident_types").update(t).eq("id", t.id)
      : await localDb.from("emg_incident_types").insert(t);
    fail(error);
  },
  async assemblyPoints(all = false) {
    let q = localDb.from("emg_assembly_points").select("*").order("name");
    if (!all) q = q.eq("active", true);
    const { data, error } = await q;
    fail(error);
    return data ?? [];
  },
  async saveAssemblyPoint(a: Partial<AssemblyPoint> & { name: string }) {
    const { error } = a.id
      ? await localDb.from("emg_assembly_points").update(a).eq("id", a.id)
      : await localDb.from("emg_assembly_points").insert(a);
    fail(error);
  },
};

/**
 * Creates in-app response records and sends email alerts to eligible users.
 */
export const notificationService = {
  async sendEmergencyAlert(incident: Incident) {
    return apiRequest<{
      notified: number;
      emails_sent: number;
      emails_failed: number;
      emails_missing: number;
    }>(`/emergencies/${encodeURIComponent(incident.id)}/notify`, { method: "POST" });
  },
};

export const incidentService = {
  async list() {
    const { data, error } = await localDb
      .from("emergencies")
      .select("*")
      .order("triggered_at", { ascending: false });
    fail(error);
    return data ?? [];
  },
  async get(id: string) {
    const { data, error } = await localDb
      .from("emergencies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    fail(error);
    return data;
  },
  async create(
    i: {
      emergency_type: string;
      title: string;
      location: string;
      building: string;
      floor: string;
      area: string;
      description: string;
      assembly: AssemblyPoint;
    },
    user: AppUser,
  ) {
    if (!canManageEmergency(user)) throw new Error("Only Admin or HSE can trigger emergencies.");
    const { data, error } = await localDb
      .from("emergencies")
      .insert({
        emergency_type: i.emergency_type,
        title: i.title,
        location: i.location,
        building: i.building,
        floor: i.floor,
        area: i.area,
        description: i.description,
        assembly_point_id: i.assembly.id,
        triggered_by: user.id,
        triggered_by_name: user.name,
      })
      .select()
      .single();
    fail(error, EMG_ERRORS.create);
    if (!data) throw new Error(EMG_ERRORS.create);
    const incident = { ...data, assembly_point: i.assembly.name };
    await logActivity(
      incident.id,
      "INCIDENT_CREATED",
      `Emergency incident ${incident.incident_no} created and activated`,
      user,
    );
    const notification = await notificationService.sendEmergencyAlert(incident);
    await logActivity(
      incident.id,
      "NOTIFICATION_SENT",
      `Emergency alerts sent to ${notification.notified} responders; ${notification.emails_sent} emails delivered`,
      user,
    );
    return { incident, ...notification };
  },
  async stop(inc: Incident, user: AppUser) {
    if (!canManageEmergency(user)) throw new Error("Only HSE administrators can stop emergencies.");
    if (inc.status !== "ACTIVE") throw new Error("Only an active emergency can be stopped.");
    const now = new Date().toISOString();
    const { error } = await localDb
      .from("emergencies")
      .update({
        status: "CLOSED",
        closed_at: now,
        closed_by_name: user.name,
        stopped_at: now,
        stopped_by_name: user.name,
      })
      .eq("id", inc.id);
    fail(error);
    await logActivity(inc.id, "INCIDENT_STOPPED", `Emergency stopped by ${user.name}`, user);
  },
  async activity(id: string) {
    const { data, error } = await localDb
      .from("emg_activity")
      .select("*")
      .eq("incident_id", id)
      .order("created_at");
    fail(error);
    return data ?? [];
  },
};

export const responseService = {
  async list(incidentId?: string): Promise<EmergencyResponse[]> {
    let q = localDb.from("emg_incident_employees").select("*").order("employee_name");
    if (incidentId) q = q.eq("incident_id", incidentId);
    const [{ data, error }, { data: reports, error: reportsError }] = await Promise.all([
      q,
      localDb.from("safety_reports").select("*"),
    ]);
    fail(error);
    fail(reportsError);
    const reportByPerson = new Map(
      (reports ?? []).map((report) => [`${report.emergency_id}:${report.person_id}`, report]),
    );
    return (data ?? []).map((response) => {
      const report = reportByPerson.get(`${response.incident_id}:${response.employee_id}`);
      return {
        ...response,
        reported_by_name: report?.reported_by_name ?? response.reported_by_name ?? null,
        reporter_id: report?.reported_by ?? response.reporter_id ?? null,
      } as EmergencyResponse;
    });
  },
  /** The signed-in employee's own row for any active incident. */
  async mineActive(userId: string) {
    const { data: active, error: activeError } = await localDb
      .from("emergencies")
      .select("*")
      .eq("status", "ACTIVE")
      .order("triggered_at", { ascending: false });
    fail(activeError);
    if (!active?.length) return null;
    const { data: rows, error: responseError } = await localDb
      .from("emg_incident_employees")
      .select("*")
      .eq("employee_id", userId)
      .in(
        "incident_id",
        active.map((a) => a.id),
      );
    fail(responseError);
    const row = rows?.[0];
    if (!row) return null;
    return { incident: active.find((a) => a.id === row.incident_id)!, response: row };
  },
  async markRead(incidentId: string) {
    await localDb.rpc("emg_mark_read", { _incident: incidentId });
  },
  async confirm(incidentId: string, status: "SAFE" | "NEEDS_ASSISTANCE") {
    const { error } = await localDb.rpc("emg_confirm_safety", {
      _incident: incidentId,
      _status: status,
    });
    if (error)
      throw new Error(
        error.message.includes("already") || error.message.includes("no longer")
          ? error.message
          : EMG_ERRORS.safety,
      );
  },
  async reportOther(
    incidentId: string,
    employeeId: string,
    status: "SAFE" | "NEEDS_ASSISTANCE",
    user: AppUser,
  ) {
    if (!canMonitorEmergency(user))
      throw new Error("You don't have permission to report another employee.");
    const incident = await incidentService.get(incidentId);
    if (!incident || incident.status !== "ACTIVE")
      throw new Error("Reports can only be recorded for an active emergency.");
    const employees = await employeeService.list(incident.location);
    const employee = employees.find((person) => person.id === employeeId);
    if (!employee) throw new Error("Employee not found.");
    const { data: existing, error: findError } = await localDb
      .from("emg_incident_employees")
      .select("*")
      .eq("incident_id", incidentId)
      .eq("employee_id", employeeId)
      .maybeSingle();
    fail(findError);
    const reportedAt = new Date().toISOString();
    const extension = {
      employee_ntid: employee.ntid,
      building: employee.building,
      reported_by_name: user.name,
      reporter_id: user.id,
    };
    if (existing) {
      const { error } = await localDb
        .from("emg_incident_employees")
        .update({
          safety_status: status,
          response_time: reportedAt,
          assistance_status: status === "NEEDS_ASSISTANCE" ? "PENDING" : "NONE",
          ...extension,
        } as Partial<IncidentEmployee>)
        .eq("id", existing.id);
      fail(error, EMG_ERRORS.safety);
    } else {
      const { error } = await localDb.from("emg_incident_employees").insert({
        incident_id: incidentId,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_email: employee.email,
        department: employee.department,
        safety_status: status,
        response_time: reportedAt,
        assistance_status: status === "NEEDS_ASSISTANCE" ? "PENDING" : "NONE",
        ...extension,
      } as Partial<IncidentEmployee>);
      fail(error, EMG_ERRORS.safety);
    }

    const { data: report, error: reportError } = await localDb
      .from("safety_reports")
      .select("*")
      .eq("emergency_id", incidentId)
      .eq("person_id", employee.id)
      .maybeSingle();
    fail(reportError);
    const reportData = {
      emergency_id: incidentId,
      person_id: employee.id,
      person_name: employee.name,
      status,
      reported_by: user.id,
      reported_by_name: user.name,
      recorded_at: reportedAt,
    };
    if (report) {
      const { error } = await localDb.from("safety_reports").update(reportData).eq("id", report.id);
      fail(error);
    } else {
      const { error } = await localDb.from("safety_reports").insert(reportData);
      fail(error);
    }
    await logActivity(
      incidentId,
      "SAFETY_REPORTED_FOR_EMPLOYEE",
      `${user.name} reported ${employee.name} as ${status === "SAFE" ? "Safe" : "Needing Support"}`,
      user,
    );
  },
  async setAssistance(r: IncidentEmployee, to: "IN_PROGRESS" | "ASSISTED", user: AppUser) {
    const { error } = await localDb
      .from("emg_incident_employees")
      .update({
        assistance_status: to,
        handled_by_name: user.name,
        handled_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    fail(error, EMG_ERRORS.assist);
    await logActivity(
      r.incident_id,
      to === "IN_PROGRESS" ? "ASSISTANCE_STARTED" : "EMPLOYEE_ASSISTED",
      `${user.name} ${to === "IN_PROGRESS" ? "started assistance for" : "marked assisted:"} ${r.employee_name}`,
      user,
    );
  },
};

export function summarize(rows: IncidentEmployee[]) {
  return {
    total: rows.length,
    safe: rows.filter((r) => r.safety_status === "SAFE").length,
    assistance: rows.filter((r) => r.safety_status === "NEEDS_ASSISTANCE").length,
    notResponded: rows.filter((r) => r.safety_status === "NOT_RESPONDED").length,
  };
}
