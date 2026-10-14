/**
 * Central E-Work Permit workflow configuration. Labels, tones, allowed moves,
 * permit types, day-count rule and vendor email template live only here.
 */
import type { StatusDef } from "@/constants/visit-status";

export type PermitStatusKey =
  | "DRAFT"
  | "PENDING_HSE"
  | "SENT_BACK"
  | "APPROVED"
  | "CLOSURE_REQUESTED"
  | "EXTENSION_REQUESTED"
  | "CLOSED"
  | "REJECTED"
  | "VENDOR_ACTION_REQUIRED"
  | "VENDOR_SUBMITTED"
  | "SECURITY_REGISTERED"
  | "ACTIVE"
  | "COMPLETED";

export const PERMIT_STATUS: Record<string, StatusDef> = {
  DRAFT: { label: "Draft", tone: "neutral", next: ["PENDING_HSE"] },
  SENT_BACK: { label: "Sent back for changes", tone: "info", next: ["PENDING_HSE"] },
  APPROVED: { label: "Approved — awaiting gate verification", tone: "success", next: ["ACTIVE"] },
  CLOSURE_REQUESTED: { label: "Closure requested", tone: "warning", next: ["CLOSED"] },
  EXTENSION_REQUESTED: {
    label: "Extension requested",
    tone: "warning",
    next: ["ACTIVE", "CLOSED"],
  },
  CLOSED: { label: "Closed", tone: "neutral", next: [] },
  PENDING_HSE: {
    label: "Pending HSE review",
    tone: "warning",
    next: ["VENDOR_ACTION_REQUIRED", "APPROVED", "SENT_BACK", "REJECTED"],
    open: true,
  },
  REJECTED: { label: "Rejected", tone: "danger", next: [] },
  VENDOR_ACTION_REQUIRED: {
    label: "Vendor action required",
    tone: "info",
    next: ["VENDOR_SUBMITTED"],
    open: true,
  },
  VENDOR_SUBMITTED: {
    label: "Vendor details submitted",
    tone: "info",
    next: ["SECURITY_REGISTERED"],
    open: true,
  },
  SECURITY_REGISTERED: {
    label: "Security registered",
    tone: "success",
    next: ["ACTIVE"],
    open: true,
  },
  ACTIVE: { label: "Active", tone: "success", next: ["COMPLETED"], open: true },
  COMPLETED: { label: "Completed", tone: "neutral", next: [] },
};

export const PERMIT_STATUS_KEYS = Object.keys(PERMIT_STATUS) as PermitStatusKey[];
export const permitStatusLabel = (s: string) => PERMIT_STATUS[s]?.label ?? s;
export const canMovePermit = (from: string, to: string) =>
  PERMIT_STATUS[from]?.next.includes(to) ?? false;

/** Configurable business categories — no safety rules are implied by the type. */
export const PERMIT_TYPES = ["Cold Work", "Hot Work"] as const;

/** Day-count rule: inclusive means 10 Oct → 12 Oct = 3 days. */
export const EWP_DAY_COUNT_INCLUSIVE = true;
/** How long the vendor's secure link stays valid. */
export const VENDOR_LINK_DAYS = 7;

export function dayCount(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const d = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  if (d < 0) return 0;
  return EWP_DAY_COUNT_INCLUSIVE ? d + 1 : d;
}

export function fmtDate(d?: string | null) {
  return d
    ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}

export function vendorEmail(
  p: { permit_no: string; permit_type: string; location: string; service: string },
  link: string,
) {
  return {
    subject: `E-Work Permit ${p.permit_no} — Vendor Action Required`,
    body: `An E-Work Permit has been approved.\n\nPermit: ${p.permit_no}\nWork Type: ${p.permit_type}\nWork: ${p.service}\nLocation: ${p.location}\n\nPlease provide worker details using the secure link below:\n${link}\n`,
  };
}
