import { localDb } from "@/services/local-client";
import type { Database } from "@/lib/database.types";
import type { AppUser } from "@/lib/types";
import { canMove } from "@/constants/visit-status";
import { isSelectableVisitorType, visitorTypeLabel } from "@/constants/visitor-types";
import { appUrl } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { db } from "@/services/vms";
import { listBranches } from "@/services/branches";
import type { Branch } from "@/lib/types";

type T = Database["public"]["Tables"];
export type VisitRequest = T["visit_requests"]["Row"];
export type GuestCard = T["guest_cards"]["Row"];
export type VisitEvent = T["visit_events"]["Row"];
export type VisitorType = T["visitor_types"]["Row"];
export type VisitStatus = string;
export interface VisitorEmployee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  branch_id: string;
  role: string;
}
export interface BranchUser {
  id: string;
  name: string;
  designation: string;
  role: string;
}

export function branchHostOptionLabel(host: BranchUser): string {
  const designation = host.designation.trim();
  if (designation) return `${host.name} — Designation: ${designation}`;

  const role = host.role
    .trim()
    .toLocaleLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ");
  return role ? `${host.name} — Role: ${role}` : host.name;
}

export const isVisitReviewer = (u: AppUser | null) => u?.role === "ADMIN" || u?.role === "BRANCH_MANAGER";
export const isVmsStaff = (u: AppUser | null) => isVisitReviewer(u) || u?.role === "SECURITY";
export const canCreateVisitRequest = (u: AppUser | null) =>
  u?.role === "ADMIN" || u?.role === "BRANCH_MANAGER" || u?.role === "EMPLOYEE";
export const canConfirmArrival = isVmsStaff;
export const canDecide = (u: AppUser | null, v: VisitRequest) =>
  !!u &&
  (u.role === "ADMIN" || v.source === "WALK_IN" || v.requested_by !== u.id) &&
  (isVisitReviewer(u) || v.host_id === u.id);

export function canIssueVisitorCard(user: AppUser | null, visit: VisitRequest) {
  if (!["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(visit.status) || visit.guest_card_id) return false;
  return ["ADMIN", "BRANCH_MANAGER", "SECURITY"].includes(user?.role ?? "");
}

export function canOpenVisitorCardDialog(user: AppUser | null, visit: VisitRequest) {
  if (!["APPROVED", "CARD_ISSUED", "CHECKED_IN"].includes(visit.status) || visit.guest_card_id) return false;
  return ["ADMIN", "BRANCH_MANAGER", "SECURITY"].includes(user?.role ?? "");
}

export interface VisitInput {
  visitor_name: string;
  visitor_type: string;
  visitor_employee_id: string | null;
  visitor_branch_id: string | null;
  company: string;
  email: string;
  phone: string;
  designation: string;
  purpose: string;
  host_id: string | null;
  host_name: string;
  host_department: string;
  location: string;
  visit_date: string;
  expected_arrival: string;
  expected_departure: string;
  remarks: string;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listVisitRequests(): Promise<VisitRequest[]> {
  const { data, error } = await localDb.from("visit_requests").select("*").order("created_at", { ascending: false });
  fail(error);
  return data ?? [];
}

export async function getVisit(id: string) {
  const { data, error } = await localDb.from("visit_requests").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data;
}

export async function listVisitorTypes() {
  const { data } = await localDb.from("visitor_types").select("*").eq("active", true).order("sort_order");
  return (data ?? [])
    .filter((visitorType) => isSelectableVisitorType(visitorType.code))
    .map((visitorType) => ({ ...visitorType, label: visitorTypeLabel(visitorType.code, visitorType.label) }));
}
export async function listLocations() {
  const { data } = await localDb.from("vms_locations").select("*").eq("active", true).order("name");
  return (data ?? []).filter((location) => ["Bengaluru Office", "Hosur Office"].includes(location.name));
}
export async function listVisitorEmployeeOptions(): Promise<{
  branches: Branch[];
  employees: VisitorEmployee[];
}> {
  const [branchRows, employeeRows] = await Promise.all([
    listBranches(false),
    localDb
      .from("profiles")
      .select("id, name, email, phone, department, designation, branch_id, role, status")
      .eq("status", "ACTIVE")
      .order("name"),
  ]);
  fail(employeeRows.error);
  return {
    branches: branchRows.filter((branch) => branch.status === "ACTIVE"),
    employees: (employeeRows.data ?? []).filter(
      (account) => account.status === "ACTIVE"
        && account.branch_id,
    ) as VisitorEmployee[],
  };
}
export async function listBranchHosts(branchId: string): Promise<BranchUser[]> {
  return apiRequest<BranchUser[]>(`/branches/${encodeURIComponent(branchId)}/hosts`);
}

export async function logVisitEvent(visitId: string, event: string, note: string, actor: AppUser | null) {
  await localDb.from("visit_events").insert({ visit_id: visitId, event, note, actor_id: actor?.id ?? null, actor_name: actor?.name ?? "" });
}
export async function listVisitEvents(visitId?: string, limit = 50) {
  let q = localDb.from("visit_events").select("*").order("created_at", { ascending: false }).limit(limit);
  if (visitId) q = q.eq("visit_id", visitId);
  const { data } = await q;
  return data ?? [];
}

export async function createVisitRequest(input: VisitInput, user: AppUser) {
  if (!canCreateVisitRequest(user)) {
    throw new Error("You are not allowed to raise visitor requests.");
  }
  if (!isSelectableVisitorType(input.visitor_type)) {
    throw new Error("Please choose an available visitor type.");
  }
  if (input.visitor_type === "EMPLOYEE" && (!input.visitor_employee_id || !input.visitor_branch_id)) {
    throw new Error("Choose the internal visitor's branch and employee.");
  }
  const { data, error } = await localDb
    .from("visit_requests")
    .insert({
      ...input,
      requested_by: user.id,
      requested_by_name: user.name,
      status: "PENDING",
    })
    .select()
    .single();
  fail(error);
  await logVisitEvent(data!.id, "CREATED", "Request submitted", user);
  return data!;
}

async function transition(id: string, expectedStatus: string, values: T["visit_requests"]["Update"]) {
  const { data, error } = await localDb
    .from("visit_requests")
    .update(values)
    .eq("id", id)
    .eq("status", expectedStatus)
    .select()
    .single();
  fail(error);
  return data!;
}

export async function approveVisitRequest(
  id: string,
  user: AppUser,
  onApproved?: (visit: VisitRequest) => void,
) {
  const current = await getVisit(id);
  if (!current || current.status !== "PENDING") {
    throw new Error("Only pending requests can be approved.");
  }
  if (!canDecide(user, current)) throw new Error("You are not allowed to approve this request.");
  const result = await apiRequest<{
    status: string;
    visitorId?: string | null;
    emailSentAt?: string | null;
  }>(`/visits/${encodeURIComponent(id)}/approve`, { method: "POST" });
  const v: VisitRequest = {
    ...current,
    status: result.status,
    visitor_code: result.visitorId || current.visitor_code,
    invitation_sent_at: result.emailSentAt ?? current.invitation_sent_at,
    reviewed_by_name: user.name,
    reviewed_at: new Date().toISOString(),
  };
  onApproved?.(v);
  await logVisitEvent(id, "APPROVED", "Approved — visit QR issued", user);
  return v;
}
export async function rejectVisitRequest(id: string, reason: string, user: AppUser) {
  const current = await getVisit(id);
  if (!current || current.status !== "PENDING") throw new Error("Only pending requests can be rejected.");
  if (!canDecide(user, current)) throw new Error("You are not allowed to reject this request.");
  if (reason.trim().length < 3) throw new Error("A rejection reason is required.");
  const note = reason.trim();
  const v = await transition(id, "PENDING", { status: "REJECTED", rejection_reason: note, reviewed_by_name: user.name, reviewed_at: new Date().toISOString() });
  await logVisitEvent(id, "REJECTED", note, user);
  return v;
}
export async function cancelVisitRequest(id: string, user: AppUser) {
  const current = await getVisit(id);
  if (!current || current.requested_by !== user.id) throw new Error("You can only cancel your own visit requests.");
  if (!canMove(current.status, "CANCELLED")) throw new Error("This request can no longer be cancelled.");
  const v = await transition(id, current.status, { status: "CANCELLED", cancelled_at: new Date().toISOString() });
  await logVisitEvent(id, "CANCELLED", "Request cancelled", user);
  return v;
}
export async function resendVisitorInvitation(id: string) {
  await apiRequest(`/visits/${encodeURIComponent(id)}/resend-invite`, { method: "POST" });
  return getVisit(id);
}

// ---------- QR validation ----------
export function parseQr(raw: string) {
  return raw.trim().replace(/^FCM-VISIT:/i, "");
}

export type QrResult = { ok: true; visit: VisitRequest } | { ok: false; reason: string; visit?: VisitRequest };

export async function validateVisitQr(raw: string, mode: "checkin" | "checkout"): Promise<QrResult> {
  const token = parseQr(raw);
  if (!token) return { ok: false, reason: "Invalid QR — nothing was read." };
  let visit: VisitRequest | null = null;
  try {
    const url = new URL(token);
    const match = url.pathname.match(/\/pass\/([^/]+)$/);
    const urlToken = new URLSearchParams(url.hash.slice(1)).get("token");
    if (match && urlToken) {
      const pass = await apiRequest<{ id: string; status: string }>(
        `/public/visits/${encodeURIComponent(decodeURIComponent(match[1]!))}/pass`,
        { method: "POST", body: JSON.stringify({ token: urlToken }) },
      );
      visit = await getVisit(pass.id);
      if (!visit) return { ok: false, reason: "This visitor is not visible to your account." };
    }
  } catch (error) {
    if (error instanceof Error && error.name !== "TypeError") {
      return { ok: false, reason: error.message };
    }
  }
  if (!visit && /^[a-f0-9]{64}$/i.test(token)) {
    visit = await apiRequest<VisitRequest>("/visitor-requests/lookup-qr", {
      method: "POST",
      body: JSON.stringify({ token: token.toLowerCase() }),
    });
  } else if (/^[A-Z0-9]{6}$/i.test(token)) {
    const { data } = await localDb.from("visit_requests").select("*").eq("visitor_code", token.toUpperCase()).order("visit_date", { ascending: false }).limit(1).maybeSingle();
    visit = data;
  }
  if (!visit) {
    return { ok: false, reason: "Invalid token — this is not an FCM visit QR." };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (mode === "checkout") {
    if (visit.status === "CHECKED_OUT" || visit.status === "COMPLETED") return { ok: false, reason: "Already checked out.", visit };
    if (visit.status !== "CHECKED_IN") return { ok: false, reason: "This visitor is not checked in, so they can't check out.", visit };
    return { ok: true, visit };
  }
  switch (visit.status) {
    case "PENDING": return { ok: false, reason: "This visit is still waiting for host approval.", visit };
    case "REJECTED": return { ok: false, reason: `Request rejected${visit.rejection_reason ? `: ${visit.rejection_reason}` : "."}`, visit };
    case "CANCELLED": return { ok: false, reason: "This request was cancelled.", visit };
    case "EXPIRED": return { ok: false, reason: "Expired QR — the visit date has passed.", visit };
    case "CHECKED_IN": return { ok: false, reason: "Already checked in.", visit };
    case "CHECKED_OUT":
    case "COMPLETED": return { ok: false, reason: "Already used — this visit is finished.", visit };
  }
  if (!["APPROVED", "CARD_ISSUED"].includes(visit.status)) return { ok: false, reason: "This visit is not approved for check-in.", visit };
  if (visit.visit_date < today) return { ok: false, reason: "Expired QR — the visit date has passed.", visit };
  if (visit.visit_date > today) return { ok: false, reason: `Not valid yet — this visit is on ${visit.visit_date}.`, visit };
  return { ok: true, visit };
}

// ---------- Guest cards ----------
export async function listGuestCards() {
  const { data, error } = await localDb.from("guest_cards").select("*").order("code");
  fail(error);
  return data ?? [];
}
export async function setCardStatus(id: string, status: string, visitId: string | null = null) {
  const { error } = await localDb.from("guest_cards").update({ status, current_visit_id: visitId }).eq("id", id);
  fail(error);
}

export async function checkInVisit(v: VisitRequest, cardId: string, gate: string, user: AppUser) {
  if (!isVisitReviewer(user)) throw new Error("Security staff cannot check visitors in.");
  const updated = await apiRequest<VisitRequest>(`/visitor-requests/${encodeURIComponent(v.id)}/check-in`, {
    method: "POST",
    body: JSON.stringify({ card_id: cardId, gate }),
  });
  await logVisitEvent(v.id, "CHECKED_IN", `Checked in at ${gate}`, user);
  return updated;
}

export async function checkOutVisit(v: VisitRequest, user: AppUser) {
  if (!isVmsStaff(user)) throw new Error("You are not allowed to check visitors out.");
  const current = await getVisit(v.id);
  if (!current || !canMove(current.status, "CHECKED_OUT")) throw new Error("Only checked-in visitors can check out.");
  const updated = await apiRequest<VisitRequest>(`/visitor-requests/${encodeURIComponent(current.id)}/check-out`, {
    method: "POST",
  });
  await logVisitEvent(current.id, "CHECKED_OUT", "Checked out, card returned", user);
  return updated;
}

export async function issueVisitorCard(visitId: string, cardId: string) {
  return apiRequest<{ visit_id: string; card: GuestCard }>(
    `/visitor-requests/${encodeURIComponent(visitId)}/issue-card`,
    { method: "POST", body: JSON.stringify({ card_id: cardId }) },
  );
}

// ---------- Helpers ----------
export function visitDuration(v: Pick<VisitRequest, "checked_in_at" | "checked_out_at">) {
  if (!v.checked_in_at || !v.checked_out_at) return "";
  const mins = Math.max(0, Math.round((+new Date(v.checked_out_at) - +new Date(v.checked_in_at)) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

export function invitationMailto(v: VisitRequest) {
  const subject = `Your visit invitation — ${v.visit_date}`;
  const body = [
    `Dear ${v.visitor_name},`,
    "",
    `You are invited to visit us on ${v.visit_date}, ${v.expected_arrival}–${v.expected_departure}${v.location ? ` at ${v.location}` : ""}.`,
    v.host_name ? `Your host: ${v.host_name}` : "",
    v.purpose ? `Purpose: ${v.purpose}` : "",
    "",
    `Request ID: ${v.request_no}`,
    "Please print or save your visit QR code and show it at the security desk.",
    typeof window !== "undefined" ? `Your visit QR / pass: ${appUrl(`/pass/${v.id}`)}` : "",
    "",
    `Regards,`,
    v.requested_by_name,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
  return `mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function expireStaleRequests() {
  const { data } = await localDb.rpc("expire_stale_visit_requests");
  return data ?? 0;
}
