/**
 * Central visit status / workflow configuration. Add new steps (e.g. PENDING_HOD)
 * here only — every screen reads labels, tones and allowed moves from this file.
 */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusDef {
  label: string;
  tone: Tone;
  /** Statuses this one may move to. */
  next: string[];
  /** Counts as "open" (still upcoming / active). */
  open?: boolean;
}

export const VISIT_STATUS: Record<string, StatusDef> = {
  PENDING: { label: "Pending", tone: "warning", next: ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED"], open: true },
  APPROVED: { label: "Approved", tone: "success", next: ["CARD_ISSUED", "CHECKED_IN", "CANCELLED", "EXPIRED"], open: true },
  CARD_ISSUED: { label: "Card Issued", tone: "success", next: ["CHECKED_IN", "CANCELLED", "EXPIRED"], open: true },
  REJECTED: { label: "Rejected", tone: "danger", next: [] },
  CANCELLED: { label: "Cancelled", tone: "neutral", next: [] },
  CHECKED_IN: { label: "Checked-in", tone: "info", next: ["CHECKED_OUT"], open: true },
  CHECKED_OUT: { label: "Checked-out", tone: "neutral", next: ["COMPLETED"] },
  COMPLETED: { label: "Completed", tone: "success", next: [] },
  EXPIRED: { label: "Expired", tone: "neutral", next: [] },
};

export const VISIT_STATUS_KEYS = Object.keys(VISIT_STATUS);
export const statusLabel = (s: string) => VISIT_STATUS[s]?.label ?? s;
export const canMove = (from: string, to: string) => VISIT_STATUS[from]?.next.includes(to) ?? false;
/** Visits that are finished (history). */
export const isFinished = (s: string) => ["CHECKED_OUT", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(s);

export const CARD_STATUS: Record<string, StatusDef> = {
  AVAILABLE: { label: "Available", tone: "success", next: ["IN_USE", "LOST"] },
  IN_USE: { label: "In use", tone: "info", next: ["RETURNED", "LOST"] },
  RETURNED: { label: "Returned", tone: "neutral", next: ["AVAILABLE", "IN_USE", "LOST"] },
  LOST: { label: "Lost", tone: "danger", next: ["AVAILABLE"] },
};
