import type {
  AppNotification,
  AppSettings,
  AppUser,
  AuditLog,
  Branch,
  Department,
  Designation,
  EmailRecord,
  Employee,
  NotificationKind,
  RoleKey,
  RoleMaster,
  Visit,
  VisitStatus,
  VisitorCard,
  VisitorTypeMaster,
} from "@/lib/types";
import { createCsv, downloadCsv } from "@/lib/csv-export";
import {
  KEYS,
  generateRequestId,
  generateVisitorId,
  getData,
  getList,
  insertData,
  saveData,
  uid,
  updateData,
} from "@/services/storage";
import { DEFAULT_SETTINGS } from "@/data/defaults";

/* ---------------- reads ---------------- */

export const db = {
  branches: () => getList<Branch>(KEYS.branches),
  employees: () => getList<Employee>(KEYS.employees),
  departments: () => getList<Department>(KEYS.departments),
  designations: () => getList<Designation>(KEYS.designations),
  roles: () => getList<RoleMaster>(KEYS.roles),
  users: () => getList<AppUser>(KEYS.users),
  visitorTypes: () => getList<VisitorTypeMaster>(KEYS.visitorTypes),
  cards: () => getList<VisitorCard>(KEYS.visitorCards),
  visits: () => getList<Visit>(KEYS.visitors),
  notifications: () => getList<AppNotification>(KEYS.notifications),
  logs: () => getList<AuditLog>(KEYS.auditLogs),
  emails: () => getList<EmailRecord>(KEYS.emails),
  settings: () => {
    const current = getData<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
    if (current.appName === "VisitFlow" || current.appName === "VMS") {
      const next = { ...current, appName: DEFAULT_SETTINGS.appName };
      saveData(KEYS.settings, next);
      return next;
    }
    return current;
  },
};

/* ---------------- helpers ---------------- */

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function createAuditLog(entry: Omit<AuditLog, "id" | "at">) {
  insertData<AuditLog>(KEYS.auditLogs, { id: uid("AUD"), at: new Date().toISOString(), ...entry });
}

export function createNotification(entry: {
  kind: NotificationKind;
  title: string;
  body: string;
  refId?: string;
  audience?: RoleKey[] | "ALL";
  branchId?: string | null;
}) {
  insertData<AppNotification>(KEYS.notifications, {
    id: uid("NTF"),
    createdAt: new Date().toISOString(),
    read: false,
    audience: entry.audience ?? "ALL",
    ...entry,
  });
}

export function markNotificationsRead(ids?: string[]) {
  const list = db.notifications().map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n));
  saveData(KEYS.notifications, list);
}

export function saveSettings(patch: Partial<AppSettings>) {
  const next = { ...db.settings(), ...patch };
  saveData(KEYS.settings, next);
  createAuditLog({
    user: "System",
    action: "Settings updated",
    module: "Settings",
    refId: "settings",
    description: `Updated: ${Object.keys(patch).join(", ")}`,
  });
  return next;
}

const nameOf = (id: string, list: { id: string; name: string }[]) =>
  list.find((r) => r.id === id)?.name ?? "—";

export const branchName = (id?: string | null) => (id ? nameOf(id, db.branches()) : "—");
export const employeeName = (id?: string | null) => {
  if (!id) return "—";
  return db.users().find((u) => u.id === id)?.name ?? nameOf(id, db.employees());
};
export const departmentName = (id?: string | null) => (id ? nameOf(id, db.departments()) : "—");
export const userName = (id?: string | null) =>
  id ? (db.users().find((u) => u.id === id)?.name ?? nameOf(id, db.employees())) : "—";

export function visitorOrigin(v: Visit) {
  if (v.origin === "WALK_IN") return v.company || "Walk-in visitor";
  return v.visitorType === "EXTERNAL" ? v.company || "External visitor" : branchName(v.sourceBranchId);
}

/* ---------------- visibility rules ---------------- */

export function visibleVisits(user: AppUser | null, visits: Visit[]): Visit[] {
  if (!user) return [];
  if (user.role === "ADMIN") return visits;
  if (user.role === "HSE") return [];
  if (user.role === "BRANCH_MANAGER" || user.role === "SECURITY")
    return visits.filter((v) => v.branchId === user.branchId);
  return visits.filter(
    (v) => v.requestedById === user.id || v.hostEmployeeId === user.id || v.hostEmployeeId === user.employeeId,
  );
}

/* ---------------- workflow ---------------- */

export type VisitDraft = Omit<
  Visit,
  | "id"
  | "requestId"
  | "visitorId"
  | "status"
  | "requestedById"
  | "requestedAt"
  | "timeline"
  | "approvedById"
  | "approvedAt"
>;

function pushTimeline(visit: Visit, event: Visit["timeline"][number]): Visit["timeline"] {
  return [...visit.timeline, event];
}

export function createVisitRequest(draft: VisitDraft, user: AppUser): Visit {
  const settings = db.settings();
  const autoApprove = user.role !== "EMPLOYEE" || !settings.requireApproval;
  const now = new Date().toISOString();

  const visit: Visit = {
    ...draft,
    id: uid("VST"),
    requestId: generateRequestId(),
    visitorId: null,
    status: "PENDING",
    requestedById: user.id,
    requestedAt: now,
    approvedById: null,
    approvedAt: null,
    timeline: [{ key: "created", label: "Request created", at: now, by: user.name }],
  };

  insertData<Visit>(KEYS.visitors, visit);
  createAuditLog({
    user: user.name,
    action: "Visitor request created",
    module: "Visitor Requests",
    refId: visit.requestId,
    description: `${visit.visitorType === "EXTERNAL" ? "External visitor" : "Other branch employee"} request for ${visit.name}`,
  });
  createNotification({
    kind: "REQUEST_CREATED",
    title: "New visitor request awaiting approval",
    body: `${user.name} raised a request for ${visit.name}${visit.company ? ` (${visit.company})` : ""}.`,
    refId: visit.id,
    audience: ["ADMIN", "BRANCH_MANAGER"],
    branchId: visit.branchId,
  });

  if (autoApprove) return approveVisit(visit.id, user) ?? visit;
  return visit;
}

export function updateVisitRequest(id: string, patch: Partial<Visit>, user: AppUser) {
  const updated = updateData<Visit>(KEYS.visitors, id, patch);
  if (updated) {
    createAuditLog({
      user: user.name,
      action: "Visitor request updated",
      module: "Visitor Requests",
      refId: updated.requestId,
      description: `Details updated for ${updated.name}`,
    });
  }
  return updated;
}

export function approveVisit(id: string, user: AppUser): Visit | null {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit || !["PENDING"].includes(visit.status)) return null;
  const settings = db.settings();
  const now = new Date().toISOString();
  const visitorId = visit.visitorId ?? generateVisitorId(settings.visitorIdPrefix);

  let timeline = pushTimeline(visit, { key: "approved", label: "Approved", at: now, by: user.name });
  timeline = [...timeline, { key: "email", label: "Invitation email created", at: now, note: `Sent to ${visit.email}` }];

  const updated = updateData<Visit>(KEYS.visitors, id, {
    status: "APPROVED",
    visitorId,
    approvedById: user.id,
    approvedAt: now,
    emailSentAt: now,
    timeline,
  });

  insertData<EmailRecord>(KEYS.emails, {
    id: uid("EML"),
    to: visit.email,
    subject: invitationSubject(),
    visitId: visit.id,
    sentAt: now,
  });

  createAuditLog({ user: user.name, action: "Visitor request approved", module: "Visitor Requests", refId: visit.requestId, description: `${visit.name} approved` });
  createAuditLog({ user: user.name, action: "Visitor ID generated", module: "Visitors", refId: visitorId, description: `Visitor ID issued for ${visit.name}` });
  createAuditLog({ user: "System", action: "Email notification created", module: "Notifications", refId: visitorId, description: `Visitor invitation queued for ${visit.email}` });
  createNotification({
    kind: "REQUEST_APPROVED",
    title: "Visitor request approved",
    body: `${visit.name} approved — Visitor ID ${visitorId} generated and invitation email created.`,
    refId: visit.id,
    branchId: visit.branchId,
  });

  return updated;
}

export function invitationSubject() {
  return `Visitor Invitation – ${db.settings().appName || "VMS"}`;
}

export function sendInvitationEmail(id: string, user: AppUser, toEmail?: string) {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit) return { error: "Visitor not found." };
  if (!visit.visitorId) return { error: "Approve this visit first so a Visitor ID can be emailed." };
  if (visit.status === "REJECTED" || visit.status === "CANCELLED") {
    return { error: "This visit cannot receive an invitation." };
  }

  const recipient = (toEmail ?? visit.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { error: "Enter a valid email address." };
  }

  const now = new Date().toISOString();
  const alternate = recipient.toLowerCase() !== visit.email.trim().toLowerCase();

  insertData<EmailRecord>(KEYS.emails, {
    id: uid("EML"),
    to: recipient,
    subject: invitationSubject(),
    visitId: visit.id,
    sentAt: now,
  });

  const updated = updateData<Visit>(KEYS.visitors, id, {
    emailSentAt: now,
    timeline: pushTimeline(visit, {
      key: "email",
      label: alternate ? "Invitation emailed to an alternate address" : "Invitation email sent",
      at: now,
      by: user.name,
      note: `Sent to ${recipient}`,
    }),
  });

  createAuditLog({
    user: user.name,
    action: "Visitor invitation emailed",
    module: "Notifications",
    refId: visit.visitorId,
    description: `Invitation for ${visit.name} sent to ${recipient}`,
  });
  createNotification({
    kind: "EMAIL_SENT",
    title: "Visitor invitation sent",
    body: `${visit.name} — Visitor ID ${visit.visitorId} emailed to ${recipient}.`,
    refId: visit.id,
    audience: ["ADMIN", "SECURITY", "BRANCH_MANAGER"],
    branchId: visit.branchId,
  });

  return { visit: updated ?? undefined, to: recipient };
}

export function saveVisitPhoto(id: string, photoUrl: string, user: AppUser) {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit) return null;
  const now = new Date().toISOString();
  const updated = updateData<Visit>(KEYS.visitors, id, {
    photoUrl,
    timeline: pushTimeline(visit, {
      key: "photo",
      label: visit.photoUrl ? "Visitor photo updated" : "Visitor photo captured",
      at: now,
      by: user.name,
    }),
  });
  createAuditLog({
    user: user.name,
    action: "Visitor photo captured",
    module: "Security",
    refId: visit.visitorId ?? visit.requestId,
    description: `Photo recorded for ${visit.name}`,
  });
  return updated;
}

export function rejectVisit(id: string, reason: string, user: AppUser) {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit) return null;
  const now = new Date().toISOString();
  const updated = updateData<Visit>(KEYS.visitors, id, {
    status: "REJECTED",
    rejectionReason: reason,
    rejectedAt: now,
    timeline: pushTimeline(visit, { key: "rejected", label: "Rejected", at: now, by: user.name, note: reason }),
  });
  createAuditLog({ user: user.name, action: "Visitor request rejected", module: "Visitor Requests", refId: visit.requestId, description: `${visit.name} rejected — ${reason}` });
  createNotification({
    kind: "REQUEST_REJECTED",
    title: "Visitor request rejected",
    body: `${visit.name} rejected — ${reason}`,
    refId: visit.id,
    branchId: visit.branchId,
  });
  return updated;
}

export function cancelVisit(id: string, user: AppUser) {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit) return null;
  const now = new Date().toISOString();
  const updated = updateData<Visit>(KEYS.visitors, id, {
    status: "CANCELLED",
    cancelledAt: now,
    timeline: pushTimeline(visit, { key: "cancelled", label: "Cancelled", at: now, by: user.name }),
  });
  createAuditLog({ user: user.name, action: "Visit cancelled", module: "Visitors", refId: visit.requestId, description: `${visit.name} visit cancelled` });
  return updated;
}

/* ---------------- check-in / check-out ---------------- */

export interface LookupResult {
  visit?: Visit;
  error?: string;
}

export function findVisitByVisitorId(code: string): LookupResult {
  const query = code.trim().toUpperCase();
  if (!query) return { error: "Enter a Visitor ID to continue." };
  const visit = db
    .visits()
    .find((v) => v.visitorId?.toUpperCase() === query || v.requestId.toUpperCase() === query);
  if (!visit) return { error: `No visitor found for “${query}”.` };
  return { visit };
}

export function validateCheckIn(visit: Visit): string | null {
  if (visit.status === "PENDING") return "This request is still awaiting approval.";
  if (visit.status === "REJECTED") return "This visit was rejected and cannot be checked in.";
  if (visit.status === "CANCELLED") return "This visit was cancelled and cannot be checked in.";
  if (visit.status === "CHECKED_IN") return "This visitor is already checked in.";
  if (visit.status === "CHECKED_OUT" && visit.visitDate !== todayISO()) return "This visit is already completed.";
  if (visit.visitDate !== todayISO()) return `Visit is scheduled for ${visit.visitDate}, not today.`;
  return null;
}

export function checkInVisit(id: string, user: AppUser, extras?: { photoUrl?: string | null | undefined } | undefined) {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit) return { error: "Visitor not found." };
  const invalid = validateCheckIn(visit);
  if (invalid) return { error: invalid };

  const settings = db.settings();
  const now = new Date().toISOString();
  let cardNumber: string | null = null;
  const photoUrl = extras?.photoUrl || visit.photoUrl || null;

  if (settings.enableVisitorCard) {
    cardNumber = visit.visitorId ?? visit.requestId;
    createAuditLog({
      user: user.name,
      action: "Visitor card issued",
      module: "Security",
      refId: cardNumber,
      description: `Visitor card issued to ${visit.name}`,
    });
  }

  let timeline = pushTimeline(visit, { key: "checkin", label: "Checked in", at: now, by: user.name });
  if (cardNumber) timeline = [...timeline, { key: "card", label: `Visitor card ${cardNumber} issued`, at: now, by: user.name }];
  if (photoUrl && photoUrl !== visit.photoUrl) {
    timeline = [...timeline, { key: "photo", label: "Visitor photo captured", at: now, by: user.name }];
  }

  const updated = updateData<Visit>(KEYS.visitors, id, {
    status: "CHECKED_IN",
    checkInAt: now,
    checkInBy: user.name,
    cardNumber,
    photoUrl,
    timeline,
  });

  createAuditLog({ user: user.name, action: "Visitor checked in", module: "Security", refId: visit.visitorId ?? visit.requestId, description: `${visit.name} checked in at ${branchName(visit.branchId)}` });
  createNotification({
    kind: "CHECKED_IN",
    title: "Visitor checked in",
    body: `${visit.name} (${visit.visitorId}) checked in${cardNumber ? `. Card ${cardNumber} issued.` : "."}`,
    refId: visit.id,
    branchId: visit.branchId,
  });

  return { visit: updated ?? undefined };
}

export function checkOutVisit(id: string, user: AppUser) {
  const visit = db.visits().find((v) => v.id === id);
  if (!visit) return { error: "Visitor not found." };
  if (visit.status !== "CHECKED_IN") return { error: "This visitor is not currently checked in." };

  const now = new Date().toISOString();
  const card = db.cards().find((c) => c.assignedVisitId === visit.id);
  if (card) {
    updateData<VisitorCard>(KEYS.visitorCards, card.id, { status: "AVAILABLE", assignedVisitId: null });
    createAuditLog({ user: user.name, action: "Visitor card returned", module: "Visitor Cards", refId: card.cardNumber, description: `Card ${card.cardNumber} returned by ${visit.name}` });
  }

  const updated = updateData<Visit>(KEYS.visitors, id, {
    status: "CHECKED_OUT",
    checkOutAt: now,
    checkOutBy: user.name,
    timeline: pushTimeline(visit, { key: "checkout", label: "Checked out", at: now, by: user.name }),
  });

  createAuditLog({ user: user.name, action: "Visitor checked out", module: "Security", refId: visit.visitorId ?? visit.requestId, description: `${visit.name} checked out of ${branchName(visit.branchId)}` });
  createNotification({
    kind: "CHECKED_OUT",
    title: "Visitor checked out",
    body: `${visit.name} checked out${card ? `. Card ${card.cardNumber} returned.` : "."}`,
    refId: visit.id,
    branchId: visit.branchId,
  });

  return { visit: updated ?? undefined };
}

/* ---------------- master CRUD ---------------- */

export function upsertMaster<T extends { id: string }>(
  key: (typeof KEYS)[keyof typeof KEYS],
  row: T,
  label: string,
  user: AppUser,
) {
  const exists = getList<T>(key).some((r) => r.id === row.id);
  if (exists) {
    updateData<T>(key, row.id, row);
    createAuditLog({ user: user.name, action: "Master updated", module: "Masters", refId: row.id, description: `${label} updated` });
  } else {
    insertData<T>(key, row);
    createAuditLog({ user: user.name, action: "Master created", module: "Masters", refId: row.id, description: `${label} created` });
  }
}

export function removeMaster(
  key: (typeof KEYS)[keyof typeof KEYS],
  id: string,
  label: string,
  user: AppUser,
) {
  const list = getList<{ id: string }>(key).filter((r) => r.id !== id);
  saveData(key, list);
  createAuditLog({ user: user.name, action: "Master deleted", module: "Masters", refId: id, description: `${label} deleted` });
}

/* ---------------- derived stats ---------------- */

export interface Stats {
  today: number;
  inside: number;
  pending: number;
  approved: number;
  completed: number;
  rejected: number;
  expected: number;
  overdue: number;
}

export function computeStats(visits: Visit[]): Stats {
  const today = todayISO();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const toMins = (t: string) => {
    const [h = 0, m = 0] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const todays = visits.filter((v) => v.visitDate === today);
  return {
    today: todays.length,
    inside: visits.filter((v) => v.status === "CHECKED_IN").length,
    pending: visits.filter((v) => v.status === "PENDING").length,
    approved: visits.filter((v) => ["APPROVED", "CARD_ISSUED"].includes(v.status)).length,
    completed: visits.filter((v) => v.status === "CHECKED_OUT").length,
    rejected: visits.filter((v) => v.status === "REJECTED").length,
    expected: todays.filter((v) => ["APPROVED", "CARD_ISSUED"].includes(v.status)).length,
    overdue:
      todays.filter((v) => ["APPROVED", "CARD_ISSUED"].includes(v.status) && toMins(v.expectedArrival) < nowMins).length +
      visits.filter((v) => v.status === "CHECKED_IN" && v.visitDate === today && toMins(v.expectedDeparture) < nowMins).length,
  };
}

export const STATUS_LABEL: Record<VisitStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  CARD_ISSUED: "Card Issued",
  REJECTED: "Rejected",
  CHECKED_IN: "Checked In",
  CHECKED_OUT: "Checked Out",
  CANCELLED: "Cancelled",
};

export function toCSV(rows: Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0] ?? {});
  return createCsv(headers, rows.map((row) => headers.map((header) => row[header] ?? "")));
}

export function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] ?? {});
  downloadCsv(filename, headers, rows.map((row) => headers.map((header) => row[header] ?? "")));
}
