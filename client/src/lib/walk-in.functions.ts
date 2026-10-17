import { z } from "zod";
import { localDb } from "@/services/local-client";
import { VMS_BRANCH_FILTERS } from "@/constants/vms-filters";
import { isSelectableVisitorType, visitorTypeLabel } from "@/constants/visitor-types";
import { listBranches } from "@/services/branches";
import { isPastVisitStart, todayBusinessISO } from "@/lib/visit-schedule";

export async function getWalkInOptions() {
  const [types, locs, employees, branches] = await Promise.all([
    localDb.from("visitor_types").select("code, label").eq("active", true).order("sort_order"),
    localDb.from("vms_locations").select("name").eq("active", true).order("name"),
    localDb
      .from("profiles")
      .select("id, name, designation, branch_id, role, status")
      .eq("status", "ACTIVE")
      .order("name"),
    listBranches(false),
  ]);
  if (employees.error) throw new Error(`Unable to load internal visitor employees: ${employees.error.message}`);
  return {
    employees: (employees.data ?? []).filter(
      (account) => account.status === "ACTIVE" && account.branch_id,
    ),
    branches: branches.filter((branch) => branch.status === "ACTIVE"),
    types: (types.data ?? [])
      .filter((visitorType) => isSelectableVisitorType(visitorType.code))
      .map((visitorType) => ({ ...visitorType, label: visitorTypeLabel(visitorType.code, visitorType.label) })),
    locations: (locs.data ?? [])
      .map((location) => location.name)
      .filter((name) => VMS_BRANCH_FILTERS.some((option) => option.value === name)),
  };
}

const schema = z
  .object({
    visitor_name: z.string().trim().min(3).max(100),
    visitor_type: z.string().trim().min(1).max(30),
    visitor_employee_id: z.string().trim().max(100).nullable().optional(),
    visitor_branch_id: z.string().trim().max(100).nullable().optional(),
    company: z.string().trim().max(120).default(""),
    email: z.string().trim().max(200).default(""),
    phone: z.string().trim().max(20).default(""),
    purpose: z.string().trim().min(3).max(300),
    host_id: z.string().min(1).max(100),
    host_department: z.string().trim().max(100).default(""),
    location: z.string().trim().max(100).default(""),
    expected_arrival: z.string().regex(/^\d{2}:\d{2}$/),
    expected_departure: z.string().regex(/^\d{2}:\d{2}$/),
    remarks: z.string().trim().max(500).default(""),
  })
  .refine((d) => d.expected_departure > d.expected_arrival, {
    message: "End time must be after start time",
  })
  .superRefine((data, context) => {
    if (data.visitor_type === "EMPLOYEE") {
      if (!data.visitor_employee_id) {
        context.addIssue({ code: "custom", path: ["visitor_employee_id"], message: "Choose the internal visitor." });
      }
      if (!data.visitor_branch_id) {
        context.addIssue({ code: "custom", path: ["visitor_branch_id"], message: "Choose the employee's branch." });
      }
    } else {
      if (!data.company.trim()) {
        context.addIssue({ code: "custom", path: ["company"], message: "Company is required." });
      }
      if (!/^\S+@\S+\.\S+$/.test(data.email)) {
        context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
      }
      const digits = data.phone.replace(/\D/g, "").length;
      if (digits < 8 || digits > 15 || !/^[\d+\s-]{8,20}$/.test(data.phone)) {
        context.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number." });
      }
    }
  });

/** Public: a walk-in guest submits a same-day request to the chosen host. */
export async function submitWalkIn({ data: input }: { data: unknown }) {
  const data = schema.parse(input);
  if (isPastVisitStart(todayBusinessISO(), data.expected_arrival)) {
    throw new Error("Invalid time. Please select a proper time schedule.");
  }
  if (!isSelectableVisitorType(data.visitor_type)) {
    throw new Error("Please choose an available visitor type.");
  }
  const { data: visitorType } = await localDb
    .from("visitor_types")
    .select("code")
    .eq("code", data.visitor_type)
    .eq("active", true)
    .maybeSingle();
  if (!visitorType) throw new Error("Please choose an available visitor type.");
  if (data.visitor_type === "EMPLOYEE" && (!data.visitor_employee_id || !data.visitor_branch_id)) {
    throw new Error("Choose the internal visitor's branch and employee.");
  }
  const { data: host } = await localDb
    .from("profiles")
    .select("id, name")
    .eq("id", data.host_id)
    .maybeSingle();
  if (!host) throw new Error("Please choose who you are visiting.");
  const today = todayBusinessISO();
  const { data: visit, error } = await localDb
    .from("visit_requests")
    .insert({
      ...data,
      host_name: host.name,
      visit_date: today,
      requested_by: host.id,
      requested_by_name: `${data.visitor_name} (walk-in)`,
      source: "WALK_IN",
    })
    .select("id, request_no")
    .single();
  if (error || !visit)
    throw new Error("Could not submit your request. Please ask security for help.");
  await localDb.from("visit_events").insert([
    {
      visit_id: visit.id,
      event: "CREATED",
      note: "Walk-in registration via QR",
      actor_name: data.visitor_name,
    },
    {
      visit_id: visit.id,
      event: "HOST_NOTIFIED",
      note: `WhatsApp (simulated) to ${host.name}`,
      actor_name: "System",
    },
  ]);
  return { id: visit.id, request_no: visit.request_no, host: host.name };
}

/** Public: walk-in guest polls their request status; returns the pass link once approved. */
export async function getWalkInStatus({ data }: { data: { id: string } }) {
  const params = z.object({ id: z.string().min(1) }).parse(data);
  const { data: visit } = await localDb
    .from("visit_requests")
    .select("status, request_no, host_name, source")
    .eq("id", params.id)
    .maybeSingle();
  if (!visit || visit.source !== "WALK_IN") return null;
  return { status: visit.status, request_no: visit.request_no, host_name: visit.host_name };
}
