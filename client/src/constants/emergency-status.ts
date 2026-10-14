/**
 * Central Emergency Evacuation status configuration. Safety status and
 * assistance status are deliberately separate. Screens read only from here.
 */
import type { StatusDef } from "@/constants/visit-status";

export const INCIDENT_STATUS: Record<string, StatusDef> = {
  ACTIVE: { label: "Active", tone: "danger", next: ["CLOSED"], open: true },
  RESOLVED: { label: "Resolved", tone: "warning", next: ["CLOSED"], open: true },
  CLOSED: { label: "Closed", tone: "neutral", next: [] },
};

export const SAFETY_STATUS: Record<string, StatusDef> = {
  NOT_RESPONDED: { label: "Not Reported", tone: "warning", next: ["SAFE", "NEEDS_ASSISTANCE"] },
  SAFE: { label: "Safe", tone: "success", next: [] },
  NEEDS_ASSISTANCE: { label: "Need Support", tone: "danger", next: [] },
};

export const ASSISTANCE_STATUS: Record<string, StatusDef> = {
  NONE: { label: "No assistance required", tone: "neutral", next: [] },
  PENDING: { label: "Assistance pending", tone: "danger", next: ["IN_PROGRESS"] },
  IN_PROGRESS: { label: "Assistance in progress", tone: "warning", next: ["ASSISTED"] },
  ASSISTED: { label: "Assisted", tone: "success", next: [] },
};

export const SAFETY_KEYS = Object.keys(SAFETY_STATUS);
export const canMoveIncident = (from: string, to: string) => INCIDENT_STATUS[from]?.next.includes(to) ?? false;
