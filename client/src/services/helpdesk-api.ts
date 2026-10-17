/**
 * FCM Helpdesk service layer. All Helpdesk data access goes through these
 * services — UI components never query the database directly.
 *
 * Services: catalogService (categories/sub-categories/services), providerService,
 * ticketService, evidenceService, notificationService, qrService, reportService.
 */
import { localDb } from "@/services/local-client";
import type { Database } from "@/lib/database.types";
import type { AppUser } from "@/lib/types";
import { canMoveTicket } from "@/constants/ticket-status";
import { apiRequest } from "@/lib/api";
import { appUrl } from "@/lib/utils";

export interface HdCategory {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
}
export interface HdSubcategory {
  id: string;
  category_id: string;
  name: string;
  description: string;
  active: boolean;
}
export interface HdProvider {
  id: string;
  name: string;
  contact: string;
  email: string;
  active: boolean;
}
export interface HdService {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  description: string;
  provider_id: string | null;
  evidence_required: boolean;
  active: boolean;
}
export interface HdBuilding {
  id: string;
  branch_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface HdBuildingArea {
  id: string;
  building_id: string;
  floor: string;
  name: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface HdBuildingFloor {
  id: string;
  building_id: string | null;
  name: string;
  floor_number?: string;
  floor_name?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface HdFeedback {
  id: string;
  feedback_type?: "TICKET" | "BUILDING";
  ticket_id?: string;
  ticket_no?: string;
  branch_id: string;
  branch_name: string;
  building_id: string;
  building_name: string;
  area_id: string | null;
  floor_name: string;
  area_name: string;
  feedback: string;
  rating?: number | null;
  submitted_by: string;
  submitted_by_name: string;
  created_at: string;
}
export interface HdTicket {
  id: string;
  ticket_no: string;
  raiser_id: string;
  raiser_name: string;
  raiser_email: string;
  category_id: string;
  subcategory_id: string | null;
  service_id: string | null;
  provider_id: string | null;
  category_name: string;
  subcategory_name: string;
  service_name: string;
  provider_name: string;
  description: string;
  location: string;
  branch_id?: string | null;
  building_id?: string | null;
  building_area_id?: string | null;
  floor_name?: string | null;
  area_name?: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: string;
  assigned_at: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  created_at: string;
  updated_at: string;
  provider_notification_status?: "SENT" | "PARTIAL" | "FAILED" | "NO_RECIPIENT";
  provider_in_app_notification_status?: "SENT" | "FAILED" | "NO_RECIPIENT";
  feedback_submitted?: boolean;
}

export interface HdFeedbackTicketOption {
  id: string;
  ticket_no: string;
  category_name: string;
  description: string;
  status: string;
  created_at: string;
  feedback_submitted: boolean;
}

export interface HdPublicTicketHistory {
  ticket: {
    id: string;
    ticket_no: string;
    category_name: string;
    subcategory_name: string;
    description: string;
    location: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
    closed_at: string;
  };
  events: Array<{
    action: string;
    remarks: string;
    performed_by_name: string;
    created_at: string;
  }>;
}

export interface PublicHelpdeskBootstrap {
  building: HdBuilding;
  floors: HdBuildingFloor[];
  areas: HdBuildingArea[];
  categories: HdCategory[];
  subcategories: HdSubcategory[];
  services: HdService[];
}
export interface HdEvidence {
  id: string;
  ticket_id: string;
  file_name: string;
  file_url: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}
export interface HdNotification {
  id: string;
  recipient_id: string;
  ticket_id: string | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}
export interface HdTicketEvent {
  id: string;
  ticket_id: string;
  action: string;
  performed_by: string | null;
  performed_by_name: string;
  remarks: string;
  created_at: string;
}

const T = "hd_tickets" as const;

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

async function requireClosureEvidence(ticket: HdTicket): Promise<void> {
  const serviceResult = ticket.service_id
    ? await localDb
        .from("hd_services")
        .select("evidence_required")
        .eq("id", ticket.service_id)
        .maybeSingle()
    : { data: null, error: null };
  if (serviceResult.error) fail(serviceResult.error, "Unable to verify the evidence requirement.");
  if (!(serviceResult.data?.evidence_required ?? true)) return;

  const evidenceResult = await localDb
    .from("hd_evidence")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticket.id);
  if (evidenceResult.error) fail(evidenceResult.error, "Unable to verify ticket evidence.");
  if (!evidenceResult.count) throw new Error("Please upload evidence before closing this ticket.");
}

/* ---------------- catalogService ---------------- */
export const catalogService = {
  async listCategories(): Promise<HdCategory[]> {
    const { data, error } = await localDb.from("hd_categories").select("*").order("sort_order");
    if (error) fail(error, "Unable to load service categories.");
    return (data ?? []) as HdCategory[];
  },
  async listSubcategories(categoryId?: string): Promise<HdSubcategory[]> {
    let q = localDb.from("hd_subcategories").select("*").order("name");
    if (categoryId) q = q.eq("category_id", categoryId);
    const { data, error } = await q;
    if (error) fail(error, "Unable to load sub-categories.");
    return (data ?? []) as HdSubcategory[];
  },
  async listServices(): Promise<HdService[]> {
    const { data, error } = await localDb.from("hd_services").select("*").order("name");
    if (error) fail(error, "Unable to load services.");
    return (data ?? []) as HdService[];
  },
  async listBuildings(): Promise<HdBuilding[]> {
    const { data, error } = await localDb.from("hd_buildings").select("*").order("name");
    if (error) fail(error, "Unable to load Helpdesk buildings.");
    return (data ?? []) as HdBuilding[];
  },
  async saveBuilding(
    row: Partial<HdBuilding> & { branch_id: string; name: string },
  ): Promise<void> {
    const { error } = await localDb.from("hd_buildings").upsert(row);
    if (error) fail(error, "Unable to save the Helpdesk building.");
  },
  async deleteBuilding(id: string): Promise<void> {
    const [tickets, feedback] = await Promise.all([
      localDb.from(T).select("id").eq("building_id", id).limit(1),
      feedbackService.list(),
    ]);
    if (tickets.error) fail(tickets.error, "Unable to check building tickets.");
    if (tickets.data?.length || feedback.some((record) => record.building_id === id)) {
      throw new Error("This building is used by tickets or feedback and cannot be deleted.");
    }
    const { error } = await localDb.from("hd_buildings").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the Helpdesk building.");
  },
  async listBuildingFloors(_buildingId?: string): Promise<HdBuildingFloor[]> {
    const query = localDb.from("hd_building_floors").select("*").order("name");
    const { data, error } = await query;
    if (error) fail(error, "Unable to load building floors.");
    return (data ?? []) as HdBuildingFloor[];
  },
  async saveBuildingFloor(
    row: Partial<HdBuildingFloor> & {
      building_id?: string | null;
      name: string;
      floor_number?: string;
      floor_name?: string;
    },
  ): Promise<void> {
    const { error } = await localDb.from("hd_building_floors").upsert(row);
    if (error) fail(error, "Unable to save the building floor.");
  },
  async deleteBuildingFloor(id: string): Promise<void> {
    const { data: floor, error: floorError } = await localDb
      .from("hd_building_floors")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (floorError) fail(floorError, "Unable to load the floor before deleting it.");
    if (!floor) return;
    const [floors, areas, tickets, feedback] = await Promise.all([
      catalogService.listBuildingFloors(),
      localDb.from("hd_building_areas").select("*"),
      localDb.from(T).select("*"),
      feedbackService.list(),
    ]);
    const normalized = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
    const duplicateRemains = floors.some(
      (candidate) =>
        candidate.id !== floor.id &&
        normalized(candidate.building_id) === normalized(floor.building_id) &&
        normalized(candidate.name) === normalized(floor.name) &&
        normalized(candidate.floor_number || candidate.name) ===
          normalized(floor.floor_number || floor.name),
    );
    if (areas.error) fail(areas.error, "Unable to check floor areas.");
    if (tickets.error) fail(tickets.error, "Unable to check floor tickets.");
    if (
      !duplicateRemains &&
      ((areas.data ?? []).some((area) => area.floor === floor.name) ||
        (tickets.data ?? []).some((ticket) => ticket.floor_name === floor.name) ||
        feedback.some((record) => record.floor_name === floor.name))
    ) {
      throw new Error("This floor is used by areas, tickets, or feedback and cannot be deleted.");
    }
    const { error } = await localDb.from("hd_building_floors").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the building floor.");
  },
  async listBuildingAreas(buildingId?: string): Promise<HdBuildingArea[]> {
    let query = localDb.from("hd_building_areas").select("*").order("floor").order("name");
    if (buildingId) query = query.eq("building_id", buildingId);
    const { data, error } = await query;
    if (error) fail(error, "Unable to load building areas.");
    return (data ?? []) as HdBuildingArea[];
  },
  async saveBuildingArea(
    row: Partial<HdBuildingArea> & { building_id: string; floor: string; name: string },
  ): Promise<void> {
    const { error } = await localDb.from("hd_building_areas").upsert(row);
    if (error) fail(error, "Unable to save the building area.");
  },
  async deleteBuildingArea(id: string): Promise<void> {
    const [tickets, feedback] = await Promise.all([
      localDb.from(T).select("id").eq("building_area_id", id).limit(1),
      feedbackService.list(),
    ]);
    if (tickets.error) fail(tickets.error, "Unable to check area tickets.");
    if (tickets.data?.length || feedback.some((record) => record.area_id === id)) {
      throw new Error("This area is used by tickets or feedback and cannot be deleted.");
    }
    const { error } = await localDb.from("hd_building_areas").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the building area.");
  },
  async saveCategory(row: Partial<HdCategory> & { name: string }): Promise<void> {
    const { error } = await localDb.from("hd_categories").upsert(row);
    if (error) fail(error, "Unable to save the category.");
  },
  async saveSubcategory(
    row: Partial<HdSubcategory> & { category_id: string; name: string },
  ): Promise<void> {
    const { error } = await localDb.from("hd_subcategories").upsert(row);
    if (error) fail(error, "Unable to save the sub-category.");
  },
  async deleteCategory(id: string): Promise<void> {
    const checks = await Promise.all([
      localDb.from("hd_subcategories").select("id").eq("category_id", id).limit(1),
      localDb.from("hd_services").select("id").eq("category_id", id).limit(1),
      localDb.from(T).select("id").eq("category_id", id).limit(1),
    ]);
    if (checks[0].error) fail(checks[0].error, "Unable to check category sub-categories.");
    if (checks[1].error) fail(checks[1].error, "Unable to check category services.");
    if (checks[2].error) fail(checks[2].error, "Unable to check category tickets.");
    if (checks.some((check) => check.data?.length)) {
      throw new Error(
        "This category is used by sub-categories, services, or tickets. Remove or reassign those first.",
      );
    }
    const { error } = await localDb.from("hd_categories").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the category.");
  },
  async deleteSubcategory(id: string): Promise<void> {
    const checks = await Promise.all([
      localDb.from("hd_services").select("id").eq("subcategory_id", id).limit(1),
      localDb.from(T).select("id").eq("subcategory_id", id).limit(1),
    ]);
    if (checks[0].error) fail(checks[0].error, "Unable to check sub-category services.");
    if (checks[1].error) fail(checks[1].error, "Unable to check sub-category tickets.");
    if (checks.some((check) => check.data?.length)) {
      throw new Error("This sub-category is used by services or tickets. Reassign those first.");
    }
    const { error } = await localDb.from("hd_subcategories").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the sub-category.");
  },
  async saveService(
    row: Partial<HdService> & { category_id: string; name: string },
  ): Promise<void> {
    const { error } = await localDb.from("hd_services").upsert(row);
    if (error) fail(error, "Unable to save the service.");
  },
  async deleteService(id: string): Promise<void> {
    const { data: tickets, error: ticketsError } = await localDb
      .from(T)
      .select("id")
      .eq("service_id", id)
      .limit(1);
    if (ticketsError) fail(ticketsError, "Unable to check whether the service is used by tickets.");
    if (tickets?.length)
      throw new Error(
        "This service is used by existing tickets. Deactivate it instead to preserve ticket history.",
      );

    const { error } = await localDb.from("hd_services").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the service.");
  },
};

/* ---------------- providerService ---------------- */
export const providerService = {
  async listProviders(): Promise<HdProvider[]> {
    const { data, error } = await localDb.from("hd_providers").select("*").order("name");
    if (error) fail(error, "Unable to load service providers.");
    return (data ?? []) as HdProvider[];
  },
  async saveProvider(row: Partial<HdProvider> & { name: string }): Promise<void> {
    const { error } = await localDb.from("hd_providers").upsert(row);
    if (error) fail(error, "Unable to save the provider.");
  },
  async deleteProvider(id: string): Promise<void> {
    const [{ data: tickets, error: ticketsError }, { data: services, error: servicesError }] =
      await Promise.all([
        localDb.from(T).select("id").eq("provider_id", id).limit(1),
        localDb.from("hd_services").select("id").eq("provider_id", id).limit(1),
      ]);
    if (ticketsError)
      fail(ticketsError, "Unable to check whether the provider is assigned to tickets.");
    if (servicesError)
      fail(servicesError, "Unable to check whether the provider is mapped to services.");
    if (tickets?.length)
      throw new Error(
        "This provider is assigned to existing tickets. Reassign them before deleting the provider.",
      );
    if (services?.length)
      throw new Error(
        "This provider is mapped to services. Update those service mappings before deleting the provider.",
      );

    const { error } = await localDb.from("hd_providers").delete().eq("id", id);
    if (error) fail(error, "Unable to delete the provider.");
  },
  /** Provider record linked to the signed-in user's email, if any. */
  async myProvider(user: AppUser): Promise<HdProvider | null> {
    return (await this.myProviders(user))[0] ?? null;
  },
  async myProviders(user: AppUser): Promise<HdProvider[]> {
    // A provider login can cover several teams (shared mailbox), so return all matches.
    const { data, error } = await localDb
      .from("hd_providers")
      .select("*")
      .ilike("email", user.email);
    if (error) fail(error, "Unable to find the provider teams for this account.");
    return (data ?? []) as HdProvider[];
  },
};

/* ---------------- notificationService ---------------- */
export const notificationService = {
  async list(userId: string): Promise<HdNotification[]> {
    const { data, error } = await localDb
      .from("hd_notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) fail(error, "Unable to load notifications.");
    return (data ?? []) as HdNotification[];
  },
  async unreadCount(userId: string): Promise<number> {
    const { count } = await localDb
      .from("hd_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);
    return count ?? 0;
  },
  async markRead(id: string): Promise<void> {
    const { error } = await localDb.from("hd_notifications").update({ is_read: true }).eq("id", id);
    if (error) fail(error, "Unable to mark the notification as read.");
  },
  async markAllRead(userId: string): Promise<void> {
    await localDb
      .from("hd_notifications")
      .update({ is_read: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);
  },
  /** Internal: fan-out a notification to a set of recipients. */
  async notify(
    recipientIds: string[],
    n: { ticket_id: string; title: string; message: string; type: string },
  ): Promise<void> {
    const unique = [...new Set(recipientIds.filter(Boolean))];
    if (!unique.length) return;
    const created_at = new Date().toISOString();
    await localDb
      .from("hd_notifications")
      .insert(unique.map((recipient_id) => ({ recipient_id, ...n, created_at })));
  },
};

/** User ids of all admins (for admin notifications). */
async function adminUserIds(): Promise<string[]> {
  const { data } = await localDb.from("user_roles").select("user_id").eq("role", "admin");
  return (data ?? []).map((r) => r.user_id as string);
}
/** User ids of provider accounts linked to a provider record (by email). */
async function providerUserIds(provider: HdProvider | null): Promise<string[]> {
  if (!provider?.email) return [];
  const { data } = await localDb.from("profiles").select("id").ilike("email", provider.email);
  return (data ?? []).map((r) => r.id as string);
}

/* ---------------- ticketService ---------------- */
export const ticketService = {
  async list(scope: "mine" | "assigned" | "all", user: AppUser): Promise<HdTicket[]> {
    let q = localDb.from(T).select("*").order("created_at", { ascending: false });
    if (scope === "mine") q = q.eq("raiser_id", user.id);
    const { data, error } = await q;
    if (error) fail(error, "Unable to load tickets.");
    const tickets = (data ?? []) as HdTicket[];
    if (scope !== "assigned") return tickets;

    const [providers, assignmentEvents] = await Promise.all([
      providerService.myProviders(user),
      localDb
        .from("hd_ticket_events")
        .select("ticket_id")
        .eq("performed_by", user.id)
        .eq("action", "Provider assigned and work started"),
    ]);
    if (assignmentEvents.error) fail(assignmentEvents.error, "Unable to load your assigned work.");
    const providerNames = new Set([user.name, ...providers.map((provider) => provider.name)]);
    const assignedByUser = new Set((assignmentEvents.data ?? []).map((event) => event.ticket_id));
    return tickets.filter(
      (ticket) =>
        (ticket.status === "NEW" && !ticket.provider_name) ||
        (!!ticket.provider_name && providerNames.has(ticket.provider_name)) ||
        assignedByUser.has(ticket.id),
    );
  },

  async get(id: string): Promise<HdTicket | null> {
    const { data, error } = await localDb.from(T).select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "Unable to load the ticket.");
    return (data as HdTicket | null) ?? null;
  },

  async create(
    input: {
      category: HdCategory;
      subcategory: HdSubcategory | null;
      service: HdService | null;
      description: string;
      location: string;
      priority: HdTicket["priority"];
      buildingContext?: {
        buildingId: string;
        areaId: string;
        latitude: number;
        longitude: number;
      };
    },
    user: AppUser,
  ): Promise<HdTicket> {
    const { data, error } = await localDb
      .from(T)
      .insert({
        raiser_id: user.id,
        raiser_name: user.name,
        raiser_email: user.email,
        category_id: input.category.id,
        subcategory_id: input.subcategory?.id ?? null,
        service_id: input.service?.id ?? null,
        category_name: input.category.name,
        subcategory_name: input.subcategory?.name ?? "",
        service_name: input.service?.name ?? "",
        provider_name: "",
        description: input.description,
        location: input.location,
        ...(input.buildingContext
          ? {
              building_id: input.buildingContext.buildingId,
              building_area_id: input.buildingContext.areaId,
              _latitude: input.buildingContext.latitude,
              _longitude: input.buildingContext.longitude,
            }
          : {}),
        priority: input.priority,
        status: "NEW",
        assigned_at: null,
      })
      .select("*")
      .single();
    if (error || !data) fail(error, "Unable to raise the service request. Please try again.");
    const ticket = data as HdTicket;
    await this.logEvent(
      ticket.id,
      "Ticket created",
      user,
      `${input.category.name} · ${input.subcategory?.name ?? "General"}`,
    );
    return ticket;
  },

  async updateStatus(ticket: HdTicket, to: string, user: AppUser, remarks = ""): Promise<HdTicket> {
    if ((to === "IN_PROGRESS" || to === "RESOLVED") && user.role !== "SERVICE_PROVIDER") {
      throw new Error("Only service providers can update work progress.");
    }
    if (!canMoveTicket(ticket.status, to))
      throw new Error(`A ticket cannot move from ${ticket.status} to ${to}.`);
    if (to === "CLOSED") await requireClosureEvidence(ticket);
    const patch: Database["public"]["Tables"]["hd_tickets"]["Update"] = { status: to };
    if (to === "CLOSED") {
      patch["closed_at"] = new Date().toISOString();
      patch["closed_by_name"] = user.name;
    }
    const { data, error } = await localDb
      .from(T)
      .update(patch)
      .eq("id", ticket.id)
      .select("*")
      .single();
    if (error || !data)
      fail(
        error,
        to === "CLOSED"
          ? "Unable to close the ticket. Please try again."
          : "Unable to update the ticket. Please try again.",
      );
    const updated = data as HdTicket;
    const labels: Record<string, string> = {
      ASSIGNED: "Ticket assigned",
      IN_PROGRESS: "Provider started work",
      RESOLVED: "Service completed",
      CLOSED: "Ticket closed",
    };
    await this.logEvent(ticket.id, labels[to] ?? `Status changed to ${to}`, user, remarks);
    if (to === "IN_PROGRESS" || to === "RESOLVED") {
      await notificationService.notify([ticket.raiser_id], {
        ticket_id: ticket.id,
        title: "Ticket updated",
        message: `Ticket ${ticket.ticket_no} status changed to ${to === "IN_PROGRESS" ? "In Progress" : "Resolved"}.`,
        type: "STATUS",
      });
    }
    if (to === "CLOSED") {
      const admins = await adminUserIds();
      await notificationService.notify([ticket.raiser_id, ...admins], {
        ticket_id: ticket.id,
        title: "Ticket closed",
        message: `Ticket ${ticket.ticket_no} (${ticket.category_name}) has been completed and closed by ${user.name}.`,
        type: "CLOSED",
      });
    }
    return updated;
  },

  async validateClosureEvidence(ticket: HdTicket): Promise<void> {
    await requireClosureEvidence(ticket);
  },

  async assignAndStart(ticket: HdTicket, provider: HdProvider): Promise<HdTicket> {
    const updated = await apiRequest<HdTicket>(
      `/helpdesk/tickets/${encodeURIComponent(ticket.id)}/assign-and-start`,
      {
        method: "POST",
        body: JSON.stringify({ providerId: provider.id }),
      },
    );
    const recipients = await providerUserIds(provider);
    await notificationService.notify(recipients, {
      ticket_id: ticket.id,
      title: "Work assigned to your service team",
      message: `Ticket ${ticket.ticket_no} is assigned to ${provider.name} and work has started.`,
      type: "ASSIGNED",
    });
    return updated;
  },

  async claim(ticket: HdTicket, user: AppUser): Promise<HdTicket> {
    const claimed = await apiRequest<HdTicket>(
      `/helpdesk/tickets/${encodeURIComponent(ticket.id)}/claim`,
      {
        method: "POST",
      },
    );
    await this.logEvent(ticket.id, "Ticket claimed", user, `Claimed by ${user.name}`);
    return claimed;
  },

  async events(ticketId: string): Promise<HdTicketEvent[]> {
    const { data, error } = await localDb
      .from("hd_ticket_events")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at");
    if (error) fail(error, "Unable to load ticket activity.");
    return (data ?? []) as HdTicketEvent[];
  },

  async logEvent(ticketId: string, action: string, user: AppUser, remarks = ""): Promise<void> {
    await localDb.from("hd_ticket_events").insert({
      ticket_id: ticketId,
      action,
      performed_by: user.id,
      performed_by_name: user.name,
      remarks,
    });
  },
};

/* ---------------- evidenceService ---------------- */
export const evidenceService = {
  async list(ticketId: string): Promise<HdEvidence[]> {
    const { data, error } = await localDb
      .from("hd_evidence")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at");
    if (error) fail(error, "Unable to load evidence.");
    const rows = (data ?? []) as HdEvidence[];
    // Private bucket: swap stored paths for short-lived signed URLs.
    return Promise.all(
      rows.map(async (r) => {
        const { data: signed } = await localDb.storage
          .from("helpdesk-evidence")
          .createSignedUrl(r.file_url, 3600);
        return { ...r, file_url: signed?.signedUrl ?? r.file_url };
      }),
    );
  },
  async upload(ticket: HdTicket, file: File, user: AppUser): Promise<void> {
    if (user.role !== "SERVICE_PROVIDER") {
      throw new Error("Only service providers can attach evidence.");
    }
    if (file.size > 10 * 1024 * 1024) throw new Error("Files up to 10 MB are allowed.");
    const path = `${ticket.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await localDb.storage.from("helpdesk-evidence").upload(path, file);
    if (upErr) fail(upErr, "Unable to upload the evidence. Please try again.");
    const { error } = await localDb.from("hd_evidence").insert({
      ticket_id: ticket.id,
      file_name: file.name,
      file_url: path,
      uploaded_by: user.id,
      uploaded_by_name: user.name,
    });
    if (error) fail(error, "Unable to upload the evidence. Please try again.");
    await ticketService.logEvent(ticket.id, "Evidence uploaded", user, file.name);
  },
};

/* ---------------- qrService ---------------- */
export const qrService = {
  /** The Helpdesk entry URL encoded in helpdesk QR codes. */
  entryUrl(categoryId?: string): string {
    const base = appUrl("/hd-raise");
    return categoryId ? `${base}?category=${encodeURIComponent(categoryId)}` : base;
  },
  buildingEntryUrl(buildingId: string): string {
    return `${appUrl("/hd-raise")}?building=${encodeURIComponent(buildingId)}`;
  },
  /** Validate a scanned Helpdesk QR value and extract its context. */
  validateQRCode(value: string): {
    valid: boolean;
    categoryId: string;
    location: string;
    buildingId: string;
  } {
    try {
      const url = new URL(value);
      if (!url.pathname.endsWith("/hd-raise"))
        return { valid: false, categoryId: "", location: "", buildingId: "" };
      return {
        valid: true,
        categoryId: url.searchParams.get("category") ?? "",
        location: url.searchParams.get("location") ?? "",
        buildingId: url.searchParams.get("building") ?? "",
      };
    } catch {
      return { valid: false, categoryId: "", location: "", buildingId: "" };
    }
  },
};

export const feedbackService = {
  async submit(input: {
    buildingId: string;
    areaId?: string;
    feedback: string;
    rating: number;
    latitude: number;
    longitude: number;
  }): Promise<HdFeedback> {
    return apiRequest<HdFeedback>("/helpdesk/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async list(): Promise<HdFeedback[]> {
    return apiRequest<HdFeedback[]>("/helpdesk/feedback");
  },
  async submitTicket(
    ticketId: string,
    input: { feedback: string; rating: number },
  ): Promise<HdFeedback> {
    return apiRequest<HdFeedback>(`/helpdesk/tickets/${encodeURIComponent(ticketId)}/feedback`, {
      method: "POST",
      body: JSON.stringify({ ticketId, ...input }),
    });
  },
  async ticketOptions(buildingId: string): Promise<HdFeedbackTicketOption[]> {
    return apiRequest<HdFeedbackTicketOption[]>(
      `/helpdesk/tickets/feedback-options?building_id=${encodeURIComponent(buildingId)}`,
    );
  },
};

export const publicHelpdeskService = {
  async bootstrap(buildingId: string): Promise<PublicHelpdeskBootstrap> {
    return apiRequest<PublicHelpdeskBootstrap>(
      `/public/helpdesk/${encodeURIComponent(buildingId)}/bootstrap`,
      { auth: false },
    );
  },
  async sendOtp(buildingId: string, email: string): Promise<void> {
    await apiRequest(`/public/helpdesk/${encodeURIComponent(buildingId)}/otp`, {
      method: "POST",
      body: JSON.stringify({ email }),
      auth: false,
    });
  },
  async verifyOtp(buildingId: string, email: string, code: string): Promise<string> {
    const result = await apiRequest<{ token: string }>(
      `/public/helpdesk/${encodeURIComponent(buildingId)}/verify`,
      { method: "POST", body: JSON.stringify({ email, code }), auth: false },
    );
    return result.token;
  },
  async tickets(buildingId: string, token: string): Promise<HdFeedbackTicketOption[]> {
    return apiRequest<HdFeedbackTicketOption[]>(
      `/public/helpdesk/${encodeURIComponent(buildingId)}/tickets?token=${encodeURIComponent(token)}`,
      { auth: false },
    );
  },
  async ticketHistory(
    buildingId: string,
    ticketId: string,
    token: string,
  ): Promise<HdPublicTicketHistory> {
    return apiRequest<HdPublicTicketHistory>(
      `/public/helpdesk/${encodeURIComponent(buildingId)}/tickets/${encodeURIComponent(ticketId)}/history?token=${encodeURIComponent(token)}`,
      { auth: false },
    );
  },
  async createTicket(
    buildingId: string,
    input: {
      token: string;
      name: string;
      areaId: string;
      categoryId: string;
      subcategoryId?: string;
      priority: HdTicket["priority"];
      description: string;
      latitude: number;
      longitude: number;
    },
  ): Promise<HdTicket> {
    return apiRequest<HdTicket>(`/public/helpdesk/${encodeURIComponent(buildingId)}/tickets`, {
      method: "POST",
      body: JSON.stringify(input),
      auth: false,
    });
  },
  async submitFeedback(
    buildingId: string,
    input: { token: string; name: string; ticketId: string; feedback: string; rating: number },
  ): Promise<HdFeedback> {
    return apiRequest<HdFeedback>(`/public/helpdesk/${encodeURIComponent(buildingId)}/feedback`, {
      method: "POST",
      body: JSON.stringify(input),
      auth: false,
    });
  },
};

/* ---------------- reportService ---------------- */
export const reportService = {
  summary(tickets: HdTicket[]) {
    const by = (key: (t: HdTicket) => string) => {
      const m = new Map<string, number>();
      for (const t of tickets) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "NEW" || t.status === "ASSIGNED").length,
      inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
      resolved: tickets.filter((t) => t.status === "RESOLVED").length,
      closed: tickets.filter((t) => t.status === "CLOSED").length,
      byCategory: by((t) => t.category_name || "Uncategorised"),
      byProvider: by((t) => t.provider_name || "Unassigned"),
      byDate: by((t) => t.created_at.slice(0, 10)),
    };
  },
};
