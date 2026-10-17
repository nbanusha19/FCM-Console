import { localDb } from "@/services/local-client";
import type { Database } from "@/lib/database.types";
import type { AppUser } from "@/lib/types";
import { PERMIT_TYPES, VENDOR_LINK_DAYS } from "@/constants/permit-status";
import { appUrl } from "@/lib/utils";
import { getEwpWorkerPhoto } from "@/services/ewp-worker-photo-local";

type T = Database["public"]["Tables"];
export type Permit = T["work_permits"]["Row"];
export type Vendor = T["ewp_vendors"]["Row"];
export type EwpLocation = T["ewp_locations"]["Row"];
export type Worker = T["ewp_workers"]["Row"];
export type Attendance = T["ewp_attendance"]["Row"];
export type PermitEvent = T["ewp_events"]["Row"];

export const isPermitReviewer = (u: AppUser | null) => u?.role === "ADMIN" || u?.role === "HSE";
export const canReviewPermit = (u: AppUser | null) => u?.role === "HSE";
export const isPermitSecurity = (u: AppUser | null) =>
  u?.role === "ADMIN" || u?.role === "SECURITY";
export const locationLabel = (l: EwpLocation) =>
  [l.building, l.floor && `Floor ${l.floor}`, l.area].filter(Boolean).join(" · ");

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function logPermitEvent(
  permitId: string,
  action: string,
  note: string,
  user: AppUser,
) {
  await localDb
    .from("ewp_events")
    .insert({ permit_id: permitId, action, note, actor_id: user.id, actor_name: user.name });
}

export async function listPermits(): Promise<Permit[]> {
  const { data, error } = await localDb
    .from("work_permits")
    .select("*")
    .order("created_at", { ascending: false });
  fail(error);
  return data ?? [];
}

export async function getPermit(id: string): Promise<Permit | null> {
  const { data, error } = await localDb.from("work_permits").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data;
}

export async function listVendors(all = false) {
  let q = localDb.from("ewp_vendors").select("*").order("name");
  if (!all) q = q.eq("active", true);
  const { data, error } = await q;
  fail(error);
  return data ?? [];
}
export async function saveVendor(v: Partial<Vendor> & { name: string }) {
  const { error } = v.id
    ? await localDb.from("ewp_vendors").update(v).eq("id", v.id)
    : await localDb.from("ewp_vendors").insert(v);
  fail(error);
}
export async function deleteVendor(id: string) {
  const { error } = await localDb.from("ewp_vendors").delete().eq("id", id);
  fail(error);
}
export async function listEwpLocations(all = false) {
  let q = localDb.from("ewp_locations").select("*").order("building");
  if (!all) q = q.eq("active", true);
  const { data, error } = await q;
  fail(error);
  const locations = data ?? [];
  return all
    ? locations
    : locations.filter((location) =>
        ["Bengaluru Office", "Hosur Office"].includes(location.building),
      );
}
export async function saveEwpLocation(l: Partial<EwpLocation> & { building: string }) {
  const { error } = l.id
    ? await localDb.from("ewp_locations").update(l).eq("id", l.id)
    : await localDb.from("ewp_locations").insert(l);
  fail(error);
}
export async function deleteEwpLocation(id: string) {
  const { error } = await localDb.from("ewp_locations").delete().eq("id", id);
  fail(error);
}

export interface NewPermitInput {
  permit_type: string;
  service: string;
  work_description: string;
  location: string;
  start_date: string;
  end_date: string;
  vendor: Vendor;
  additional_details: string;
}

export interface EditPermitDetailsInput {
  permit_type: string;
  service: string;
  work_description: string;
  location: string;
  start_date: string;
  end_date: string;
  vendor: Vendor;
  additional_details: string;
}

export async function createPermit(i: NewPermitInput, user: AppUser) {
  if (i.end_date < i.start_date) throw new Error("End date must be on or after the start date.");
  const { data, error } = await localDb
    .from("work_permits")
    .insert({
      permit_type: i.permit_type,
      service: i.service,
      work_description: i.work_description,
      location: i.location,
      start_date: i.start_date,
      end_date: i.end_date,
      work_date: i.start_date,
      vendor_id: i.vendor.id,
      vendor_name: i.vendor.name,
      vendor_email: i.vendor.email,
      contractor: i.vendor.name,
      additional_details: i.additional_details,
      raised_by: user.id,
      raised_by_name: user.name,
    })
    .select()
    .single();
  fail(error);
  await logPermitEvent(
    data!.id,
    "SUBMITTED",
    "Permit created — pending Health & Safety approval",
    user,
  );
  return data!;
}

export async function updatePermitDetails(
  permitId: string,
  details: EditPermitDetailsInput,
  user: AppUser,
) {
  if (!isPermitReviewer(user)) throw new Error("Only Admin or HSE can edit permit details.");
  if (!(PERMIT_TYPES as readonly string[]).includes(details.permit_type)) {
    throw new Error("Choose Cold Work or Hot Work.");
  }
  if (!details.service.trim() || details.work_description.trim().length < 10) {
    throw new Error("Add the work / service and a description (at least 10 characters).");
  }
  if (!details.location.trim()) throw new Error("Choose the work location.");
  if (!details.vendor?.id) throw new Error("Choose the vendor.");
  if (!details.start_date || !details.end_date || details.end_date < details.start_date) {
    throw new Error("End date must be on or after the start date.");
  }

  const { data, error } = await localDb
    .from("work_permits")
    .update({
      permit_type: details.permit_type,
      service: details.service.trim(),
      work_description: details.work_description.trim(),
      location: details.location.trim(),
      start_date: details.start_date,
      end_date: details.end_date,
      work_date: details.start_date,
      vendor_id: details.vendor.id,
      vendor_name: details.vendor.name,
      vendor_email: details.vendor.email,
      contractor: details.vendor.name,
      additional_details: details.additional_details.trim(),
    })
    .eq("id", permitId)
    .select()
    .single();
  fail(error);
  await logPermitEvent(permitId, "DETAILS_UPDATED", `Permit details updated by ${user.name}`, user);
  return data!;
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function update(id: string, patch: T["work_permits"]["Update"]) {
  const { data, error } = await localDb
    .from("work_permits")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  fail(error);
  return data!;
}

export async function approvePermit(p: Permit, user: AppUser) {
  if (!canReviewPermit(user)) throw new Error("Only HSE can approve permits.");
  if (p.status !== "PENDING_HSE") throw new Error("Only pending permits can be approved.");
  const now = new Date();
  const data = await update(p.id, {
    status: "VENDOR_ACTION_REQUIRED",
    approved_by_name: user.name,
    approved_at: now.toISOString(),
    reviewed_by_name: user.name,
    reviewed_at: now.toISOString(),
    vendor_token: randomToken(),
    vendor_token_expires_at: new Date(now.getTime() + VENDOR_LINK_DAYS * 86_400_000).toISOString(),
  });
  await logPermitEvent(p.id, "APPROVED", `Approved by ${user.name} — vendor action required`, user);
  return data;
}

export async function rejectPermit(p: Permit, reason: string, user: AppUser) {
  if (!canReviewPermit(user)) throw new Error("Only HSE can reject permits.");
  if (p.status !== "PENDING_HSE") throw new Error("Only pending permits can be rejected.");
  if (reason.trim().length < 3) throw new Error("A rejection reason is required.");
  const now = new Date().toISOString();
  const data = await update(p.id, {
    status: "REJECTED",
    rejected_by_name: user.name,
    rejected_at: now,
    rejection_reason: reason.trim(),
    reviewed_by_name: user.name,
    reviewed_at: now,
    review_note: reason.trim(),
  });
  await logPermitEvent(p.id, "REJECTED", `Rejected by ${user.name}: ${reason.trim()}`, user);
  return data;
}

export async function markVendorNotified(p: Permit, user: AppUser, messageId: string) {
  await update(p.id, { vendor_notified_at: new Date().toISOString() });
  await logPermitEvent(
    p.id,
    "VENDOR_NOTIFIED",
    `Vendor email accepted by Resend for ${p.vendor_email || p.vendor_name} (message ${messageId})`,
    user,
  );
}

export function vendorLink(p: Permit) {
  return appUrl(`/vendor-response/${p.vendor_token}`);
}

export async function listWorkers(permitId?: string) {
  let q = localDb.from("ewp_workers").select("*").order("created_at");
  if (permitId) q = q.eq("permit_id", permitId);
  const { data, error } = await q;
  fail(error);
  return data ?? [];
}

export async function listAttendance(opts: { permitId?: string; day?: string } = {}) {
  let q = localDb.from("ewp_attendance").select("*").order("check_in_at", { ascending: false });
  if (opts.permitId) q = q.eq("permit_id", opts.permitId);
  if (opts.day) q = q.eq("day", opts.day);
  const { data, error } = await q;
  fail(error);
  return data ?? [];
}

export async function listPermitEvents(permitId: string) {
  const { data, error } = await localDb
    .from("ewp_events")
    .select("*")
    .eq("permit_id", permitId)
    .order("created_at");
  fail(error);
  return data ?? [];
}

export async function registerWorker(p: Permit, w: Worker, index: number, user: AppUser) {
  if (!getEwpWorkerPhoto(w.id))
    throw new Error("Capture or upload the worker's photo before issuing the pass.");
  const { error } = await localDb
    .from("ewp_workers")
    .update({
      pass_no: `${p.permit_no}-W${index + 1}`,
      registered_at: new Date().toISOString(),
      registered_by_name: user.name,
    })
    .eq("id", w.id);
  fail(error);
  await logPermitEvent(
    p.id,
    "WORKER_REGISTERED",
    `${w.name} registered, pass ${p.permit_no}-W${index + 1} issued`,
    user,
  );
  const workers = await listWorkers(p.id);
  if (p.status === "VENDOR_SUBMITTED" && workers.every((x) => x.registered_at)) {
    await update(p.id, { status: "SECURITY_REGISTERED" });
    await logPermitEvent(p.id, "SECURITY_REGISTERED", "All workers registered by security", user);
  }
}

export async function checkInWorker(p: Permit, w: Worker, user: AppUser) {
  if (!w.registered_at) throw new Error("Register the worker before check-in.");
  const today = new Date().toISOString().slice(0, 10);
  if (p.vendor_start_date && today < p.vendor_start_date)
    throw new Error("The work period has not started yet.");
  if (p.vendor_end_date && today > p.vendor_end_date) throw new Error("The work period has ended.");
  const { error } = await localDb
    .from("ewp_attendance")
    .insert({ worker_id: w.id, permit_id: p.id, day: today, check_in_by_name: user.name });
  if (error?.code === "23505") throw new Error(`${w.name} is already checked in today.`);
  fail(error);
  if (p.status === "SECURITY_REGISTERED")
    await update(p.id, {
      status: "ACTIVE",
      arrived_at: new Date().toISOString(),
      arrived_by_name: user.name,
    });
  await logPermitEvent(p.id, "CHECK_IN", `${w.name} checked in`, user);
}

export async function checkOutWorker(p: Permit, a: Attendance, workerName: string, user: AppUser) {
  const { error } = await localDb
    .from("ewp_attendance")
    .update({ check_out_at: new Date().toISOString(), check_out_by_name: user.name })
    .eq("id", a.id);
  fail(error);
  await logPermitEvent(p.id, "CHECK_OUT", `${workerName} checked out`, user);
}

export async function completePermit(p: Permit, user: AppUser) {
  if (p.status !== "ACTIVE") throw new Error("Only active permits can be completed.");
  await update(p.id, { status: "COMPLETED", completed_at: new Date().toISOString() });
  await logPermitEvent(p.id, "COMPLETED", `Work marked completed by ${user.name}`, user);
}
