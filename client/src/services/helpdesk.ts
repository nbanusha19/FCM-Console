import type { AppUser } from "@/lib/types";
import { getList, saveData, uid } from "@/services/storage";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TicketEvent {
  at: string;
  by: string;
  text: string;
}

export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  category: string;
  location: string;
  priority: TicketPriority;
  status: TicketStatus;
  raisedById: string;
  raisedByName: string;
  createdAt: string;
  updatedAt: string;
  events: TicketEvent[];
}

export const TICKET_CATEGORIES = ["Electrical", "Plumbing", "HVAC / AC", "Housekeeping", "IT / Network", "Furniture", "Security", "Other"];
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const KEY = "fcm_helpdesk_tickets" as never;

export const isAgent = (u: AppUser | null) => u?.role === "ADMIN" || u?.role === "BRANCH_MANAGER";

export function listTickets(): Ticket[] {
  return getList<Ticket>(KEY).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createTicket(
  input: Pick<Ticket, "title" | "description" | "category" | "location" | "priority">,
  user: AppUser,
): Ticket {
  const all = getList<Ticket>(KEY);
  const now = new Date().toISOString();
  const ticket: Ticket = {
    ...input,
    id: uid("TKT"),
    ticketNo: `HD-${String(all.length + 1).padStart(5, "0")}`,
    status: "OPEN",
    raisedById: user.id,
    raisedByName: user.name,
    createdAt: now,
    updatedAt: now,
    events: [{ at: now, by: user.name, text: "Ticket raised" }],
  };
  saveData(KEY, [...all, ticket]);
  return ticket;
}

export function updateTicket(id: string, patch: { status?: TicketStatus; comment?: string }, user: AppUser): Ticket | null {
  const all = getList<Ticket>(KEY);
  let updated: Ticket | null = null;
  const now = new Date().toISOString();
  const next = all.map((t) => {
    if (t.id !== id) return t;
    const events = [...t.events];
    if (patch.status && patch.status !== t.status) events.push({ at: now, by: user.name, text: `Status → ${TICKET_STATUS_LABEL[patch.status]}` });
    if (patch.comment?.trim()) events.push({ at: now, by: user.name, text: patch.comment.trim() });
    updated = { ...t, status: patch.status ?? t.status, updatedAt: now, events };
    return updated;
  });
  saveData(KEY, next);
  return updated;
}
