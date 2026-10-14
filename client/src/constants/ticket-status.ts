/**
 * Central Helpdesk ticket status / workflow configuration. New steps are added
 * here only — every screen reads labels, tones and allowed moves from this file.
 */
import type { StatusDef } from "@/constants/visit-status";

export type TicketStatusKey = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export const TICKET_STATUS: Record<string, StatusDef> = {
  NEW: { label: "New", tone: "warning", next: ["ASSIGNED"], open: true },
  ASSIGNED: { label: "Assigned", tone: "info", next: ["IN_PROGRESS"], open: true },
  IN_PROGRESS: { label: "In progress", tone: "info", next: ["RESOLVED"], open: true },
  RESOLVED: { label: "Resolved", tone: "success", next: ["CLOSED"], open: true },
  CLOSED: { label: "Closed", tone: "neutral", next: [] },
};

export const TICKET_STATUS_KEYS = Object.keys(TICKET_STATUS) as TicketStatusKey[];
export const ticketStatusLabel = (s: string) => TICKET_STATUS[s]?.label ?? s;
export const canMoveTicket = (from: string, to: string) => TICKET_STATUS[from]?.next.includes(to) ?? false;
export const isTicketOpen = (s: string) => TICKET_STATUS[s]?.open ?? false;
