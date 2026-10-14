/**
 * Built-in demo backend. Used automatically when the external API server is
 * unreachable, so every workflow can run end to end in the browser.
 */
import type { AppUser, Branch, RoleMaster, Visit } from "@/lib/types";
import type { WorkPermit, WorkPermitCatalog, WorkPermitEvent } from "@/lib/work-permit";
import { KEYS, getData, getList, saveData, insertData, updateData, uid } from "@/services/storage";
import { ensureDevUsers } from "@/services/dev-auth";
import { ensureProductDefaults } from "@/data/defaults";
import {
  approveVisit,
  cancelVisit,
  checkInVisit,
  checkOutVisit,
  createVisitRequest,
  findVisitByVisitorId,
  rejectVisit,
  saveVisitPhoto,
  sendInvitationEmail,
  type VisitDraft,
} from "@/services/vms";

export class LocalApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const DEMO_BRANCH_ID = "BR-HQ";
const HOSUR_BRANCH_ID = "BR-HOS";
const PERMITS_KEY = "fcm_work_permits" as never;

function me(): AppUser {
  const u = getData<AppUser | null>(KEYS.currentUser, null);
  if (!u) throw new LocalApiError("Please sign in again.", 401);
  return u;
}

export function ensureDemoBranch(): Branch[] {
  const list = getList<Branch>(KEYS.branches);
  const bengaluru: Branch = {
    id: DEMO_BRANCH_ID,
    code: "BLR-OFFICE",
    name: "Bengaluru Office",
    address: "geethanjali complex in nagar bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    phone: "",
    email: "",
    managerId: null,
    status: "ACTIVE",
  };
  const hosur: Branch = {
    id: HOSUR_BRANCH_ID,
    code: "HOSUR-FACTORY",
    name: "Hosur Factory",
    address: "Hosur Tamilnadu",
    city: "Hosur",
    state: "Tamil Nadu",
    phone: "",
    email: "",
    managerId: null,
    status: "ACTIVE",
  };

  let next = list;
  const defaultIndex = next.findIndex((branch) => branch.id === DEMO_BRANCH_ID);
  if (defaultIndex < 0) {
    next = [bengaluru, ...next];
  } else if (
    next[defaultIndex]?.name === "Head Office" &&
    next[defaultIndex]?.address === "1 Main Road"
  ) {
    next = next.map((branch) => (branch.id === DEMO_BRANCH_ID ? bengaluru : branch));
  }
  if (!next.some((branch) => branch.id === HOSUR_BRANCH_ID)) {
    next = [...next, hosur];
  }
  if (next !== list) saveData(KEYS.branches, next);
  return next;
}

const item = (key: string, name: string, extra: Record<string, unknown> = {}) => ({
  key,
  name,
  ...extra,
});

const CATALOG: WorkPermitCatalog = {
  permitTypes: [
    item("HOT_WORK", "Hot work", { prefix: "HW", color: "#dc2626" }),
    item("HEIGHT", "Work at height", { prefix: "WH", color: "#2563eb" }),
    item("ELECTRICAL", "Electrical", { prefix: "EL", color: "#ca8a04" }),
    item("CONFINED", "Confined space", { prefix: "CS", color: "#7c3aed" }),
    item("EXCAVATION", "Excavation", { prefix: "EX", color: "#92400e" }),
    item("COLD", "Cold work", { prefix: "CW", color: "#0891b2" }),
  ],
  specializedTypes: [item("GENERAL", "General")],
  natures: [
    item("MAINTENANCE", "Maintenance"),
    item("INSTALLATION", "Installation"),
    item("REPAIR", "Repair"),
  ],
  buildings: [item("A", "Block A"), item("B", "Block B")],
  floors: [item("G", "Ground"), item("1", "First"), item("2", "Second")],
  wings: [item("N", "North"), item("S", "South")],
  areas: [item("LOBBY", "Lobby"), item("PLANT", "Plant room"), item("ROOF", "Roof")],
  workDescriptions: [item("GENERAL_WORK", "General work as described")],
  jsaRefs: [item("JSA-001", "JSA-001 Standard")],
  contractors: [
    item("ACME", "Acme Facility Services"),
    item("BUILDRIGHT", "BuildRight Contractors"),
  ],
  ppe: [
    item("HELMET", "Helmet"),
    item("GLOVES", "Gloves"),
    item("SHOES", "Safety shoes"),
    item("HARNESS", "Harness"),
  ],
  rejectionReasons: [item("UNSAFE", "Unsafe conditions")],
  nightWorkItems: [
    item("SECURITY_NOTIFIED", "Security notified and approval obtained"),
    item("SUPERVISOR_PRESENT", "Designated supervisor present on site"),
    item("BUDDY_SYSTEM", "Buddy system available"),
    item("FIRE_WATCHER", "Fire watcher assigned (where applicable)", { allowNa: true }),
    item("MEDICAL_SUPPORT", "Medical emergency support ready"),
  ],
  checklists: {
    HOT_WORK: [
      "Area cleared of flammable material",
      "Fire extinguisher available at the spot",
      "Welding set and cables in sound condition",
      "Gas cutting torch has flash-back arrester and NRV",
      "Work area barricaded, caution boards displayed",
      "Combustible floors protected",
      "Sprinkler / fire detection isolated only if authorised",
      "Hot-work screens / blankets in place",
      "Gas cylinders secured and upright",
      "Drains and pits covered",
      "Spark containment arranged",
      "Housekeeping completed before start",
      "Emergency exit path kept clear",
      "FES / fire department informed",
    ],
    HEIGHT: ["Harness inspected", "Barricade in place"],
    ELECTRICAL: ["Isolation done (LOTO)", "Tester verified"],
    CONFINED: ["Gas test done", "Standby person assigned"],
    EXCAVATION: ["Underground services checked", "Edge protection"],
    COLD: ["Area barricaded", "Tools inspected"],
  },
  hseBlocks: [
    item("SCOPE", "Scope & location"),
    item("SAFETY", "Checklist & PPE"),
    item("PEOPLE", "Contractor & supervisor"),
  ],
  roleMatrix: [],
};

function permits(): WorkPermit[] {
  return getList<WorkPermit>(PERMITS_KEY);
}

function event(p: WorkPermit, action: string, detail: string, user: AppUser): WorkPermitEvent {
  return {
    id: uid("EVT"),
    permitId: p.id,
    action,
    actorName: user.name,
    actorUserId: user.id,
    detail,
    at: new Date().toISOString(),
  };
}

function patchPermit(
  id: string,
  patch: Partial<WorkPermit>,
  action: string,
  detail: string,
): WorkPermit {
  const user = me();
  const current = permits().find((p) => p.id === id);
  if (!current) throw new LocalApiError("Permit not found.", 404);
  const next = updateData<WorkPermit>(PERMITS_KEY, id, {
    ...patch,
    events: [...current.events, event(current, action, detail, user)],
    updatedAt: new Date().toISOString(),
  });
  return next!;
}

function minutesBetween(from: string, to: string) {
  const [fh = 0, fm = 0] = from.split(":").map(Number);
  const [th = 0, tm = 0] = to.split(":").map(Number);
  return Math.max(0, th * 60 + tm - (fh * 60 + fm));
}

function savePermit(body: Partial<WorkPermit>): WorkPermit {
  const user = me();
  const base = {
    ...body,
    durationMinutes: minutesBetween(body.timeFrom ?? "00:00", body.timeTo ?? "00:00"),
    updatedAt: new Date().toISOString(),
  };
  if (body.id && permits().some((p) => p.id === body.id)) {
    return updateData<WorkPermit>(PERMITS_KEY, body.id, base as Partial<WorkPermit>)!;
  }
  const now = new Date().toISOString();
  const permit = {
    specializedType: "",
    nature: "",
    natureOther: "",
    building: "",
    floor: "",
    wing: "",
    area: "",
    workDescription: "",
    jsaRef: "",
    workmenCount: 1,
    contractor: "",
    supervisorName: "",
    supervisorMobile: "",
    workDate: now.slice(0, 10),
    timeFrom: "09:00",
    timeTo: "17:00",
    overNineHours: {},
    nightWork: {},
    checklist: [],
    ppe: { items: [], special: "" },
    attachments: [],
    signatures: {},
    fireWatch: {},
    ownerEvaluation: {},
    hseEvaluation: {},
    ...base,
    id: uid("WP"),
    permitNo: null,
    status: "DRAFT",
    permitType: body.permitType ?? "COLD",
    branchId: body.branchId || user.branchId || DEMO_BRANCH_ID,
    hseValidation: {},
    gates: { execution: "PENDING", fes: "NA", hse: "LOCKED" },
    raisedById: user.id,
    raisedByName: user.name,
    consentCaptured: false,
    events: [],
    expiringSoon: false,
    qrWindow: {},
    createdAt: now,
  } as WorkPermit;
  permit.events = [event(permit, "CREATED", "Draft created", user)];
  return insertData<WorkPermit>(PERMITS_KEY, permit);
}

function body<T>(init: RequestInit): T {
  return (typeof init.body === "string" ? JSON.parse(init.body) : {}) as T;
}

export async function localApi<T>(path: string, init: RequestInit): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const [pathname = "", query = ""] = path.split("?");
  const parts = pathname.split("/").filter(Boolean);
  const [root, id, action] = parts;
  const r = <R>(v: R) => v as unknown as T;

  if (root === "branches") {
    const branches = ensureDemoBranch();
    if (method === "GET") {
      const includeInactive = new URLSearchParams(query).get("includeInactive") !== "false";
      const filtered = includeInactive
        ? branches
        : branches.filter((branch) => branch.status === "ACTIVE");
      return r(id ? (filtered.find((branch) => branch.id === id) ?? null) : filtered);
    }
    if (method === "POST" && !id) {
      const input = body<{
        name: string;
        location?: string;
        phone?: string;
        email?: string;
        status?: Branch["status"];
      }>(init);
      if (!input.name?.trim()) throw new LocalApiError("Branch name is required.");
      const branch: Branch = {
        id: uid("BR"),
        code: input.name
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .slice(0, 12),
        name: input.name.trim(),
        address: input.location ?? "",
        city: "",
        state: "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        managerId: null,
        status: input.status ?? "ACTIVE",
      };
      saveData(KEYS.branches, [branch, ...branches]);
      return r(branch);
    }
    if (id && method === "PUT") {
      const input = body<{
        name: string;
        location?: string;
        phone?: string;
        email?: string;
        status?: Branch["status"];
      }>(init);
      const branch = branches.find((row) => row.id === id);
      if (!branch) throw new LocalApiError("Branch not found.", 404);
      const updated = {
        ...branch,
        name: input.name.trim(),
        address: input.location ?? branch.address,
        phone: input.phone ?? branch.phone,
        email: input.email ?? branch.email,
        status: input.status ?? branch.status,
      };
      saveData(
        KEYS.branches,
        branches.map((row) => (row.id === id ? updated : row)),
      );
      return r(updated);
    }
    if (id && method === "DELETE") {
      saveData(
        KEYS.branches,
        branches.filter((branch) => branch.id !== id),
      );
      return r(null);
    }
  }

  if (root === "roles") {
    ensureProductDefaults();
    const roles = getList<RoleMaster>(KEYS.roles);
    if (method === "GET") {
      const includeInactive = new URLSearchParams(query).get("includeInactive") !== "false";
      const filtered = includeInactive ? roles : roles.filter((role) => role.status === "ACTIVE");
      return r(id ? (filtered.find((role) => role.id === id) ?? null) : filtered);
    }
    if (id && method === "PUT") {
      const input = body<Pick<RoleMaster, "name" | "description" | "status">>(init);
      const role = roles.find((row) => row.id === id);
      if (!role) throw new LocalApiError("Role not found.", 404);
      const updated = { ...role, ...input };
      saveData(
        KEYS.roles,
        roles.map((row) => (row.id === id ? updated : row)),
      );
      return r(updated);
    }
  }

  if (root === "users" && method === "GET") {
    ensureDemoBranch();
    return r(
      ensureDevUsers().map(({ password: _p, ...u }) => ({
        ...u,
        branchId: u.branchId ?? DEMO_BRANCH_ID,
      })),
    );
  }
  if (root === "users" && method === "POST" && !id) {
    const input = body<Omit<AppUser, "id" | "status"> & { password: string }>(init);
    const users = ensureDevUsers();
    if (users.some((user) => user.email.toLowerCase() === input.email.trim().toLowerCase()))
      throw new LocalApiError("A user with this email already exists.");
    const user: AppUser = {
      ...input,
      id: uid("USR"),
      status: "ACTIVE",
      branchId: input.branchId ?? DEMO_BRANCH_ID,
      phone: input.phone ?? "",
    };
    saveData(KEYS.users, [...users, user]);
    const { password: _password, ...safe } = user;
    return r(safe);
  }
  if (root === "users" && id && method === "PUT") {
    const input = body<Partial<AppUser> & { password?: string }>(init);
    const users = ensureDevUsers();
    const previous = users.find((user) => user.id === id);
    if (!previous) throw new LocalApiError("User not found.", 404);
    const updated = { ...previous, ...input, password: input.password || previous.password };
    saveData(
      KEYS.users,
      users.map((user) => (user.id === id ? updated : user)),
    );
    const { password: _password, ...safe } = updated;
    return r(safe);
  }
  if (root === "users" && id && method === "DELETE") {
    saveData(
      KEYS.users,
      ensureDevUsers().filter((user) => user.id !== id),
    );
    return r(null);
  }

  if (root === "visits") {
    if (method === "GET" && id === "lookup") {
      const code = new URLSearchParams(query).get("code") ?? "";
      const found = findVisitByVisitorId(code);
      if (!found.visit) throw new LocalApiError(found.error ?? "Visitor not found.", 404);
      return r(found.visit);
    }
    if (method === "GET" && !id) return r(getList<Visit>(KEYS.visitors));
    const user = me();
    if (method === "POST" && !id) return r(createVisitRequest(body<VisitDraft>(init), user));
    if (id && method === "POST") {
      const map: Record<string, () => unknown> = {
        approve: () => approveVisit(id, user),
        reject: () => rejectVisit(id, body<{ reason: string }>(init).reason, user),
        cancel: () => cancelVisit(id, user),
        "check-in": () => checkInVisit(id, user),
        "check-out": () => checkOutVisit(id, user),
        "resend-invite": () => {
          const result = sendInvitationEmail(id, user);
          if ("error" in result) throw new LocalApiError(result.error, 404);
          return result.visit;
        },
        photo: () => {
          const result = saveVisitPhoto(id, body<{ photo: string }>(init).photo, user);
          if (!result) throw new LocalApiError("Visitor not found.", 404);
          return result;
        },
      };
      const fn = action ? map[action] : undefined;
      if (fn) return r(fn());
    }
  }

  if (root === "work-permits") {
    if (id === "catalog") return r(CATALOG);
    if (method === "GET" && !id) return r(permits());
    if (method === "GET" && id === "lookup") {
      const code = new URLSearchParams(query).get("code") ?? "";
      const found = permits().find((p) => p.permitNo === code || p.id === code);
      if (!found) throw new LocalApiError("Permit not found.", 404);
      return r(found);
    }
    if (method === "GET" && id) {
      const found = permits().find((p) => p.id === id);
      if (!found) throw new LocalApiError("Permit not found.", 404);
      return r(found);
    }
    if (method === "POST" && !id) return r(savePermit(body<Partial<WorkPermit>>(init)));
    if (method === "POST" && id) {
      const b = body<{
        note?: string;
        reason?: string;
        hseValidation?: WorkPermit["hseValidation"];
      }>(init);
      const user = me();
      switch (action) {
        case "submit":
          return r(
            patchPermit(
              id,
              {
                status: "PENDING_HSE",
                sendBackNote: null,
                gates: { execution: "DONE", fes: "NA", hse: "PENDING" },
              },
              "SUBMITTED",
              "Submitted for approval",
            ),
          );
        case "fes-signoff":
          return r(
            patchPermit(
              id,
              { gates: { execution: "DONE", fes: "DONE", hse: "PENDING" } },
              "FES_SIGNOFF",
              "Internal sign-off recorded",
            ),
          );
        case "approve": {
          const seq = permits().filter((p) => p.permitNo).length + 1;
          const current = permits().find((p) => p.id === id);
          const prefix =
            CATALOG.permitTypes.find((t) => t.key === current?.permitType)?.prefix ?? "WP";
          return r(
            patchPermit(
              id,
              {
                status: "APPROVED",
                permitNo: `${prefix}-${String(seq).padStart(4, "0")}`,
                approvedById: user.id,
                approvedAt: new Date().toISOString(),
                hseValidation: b.hseValidation ?? {},
                gates: { execution: "DONE", fes: "DONE", hse: "DONE" },
              },
              "APPROVED",
              `Approved by ${user.name}`,
            ),
          );
        }
        case "send-back":
          return r(
            patchPermit(
              id,
              {
                status: "SENT_BACK",
                sendBackNote: b.note ?? "",
                hseValidation: b.hseValidation ?? {},
              },
              "SENT_BACK",
              b.note ?? "",
            ),
          );
        case "reject":
          return r(
            patchPermit(
              id,
              {
                status: "REJECTED",
                rejectionReason: b.reason ?? "",
                hseValidation: b.hseValidation ?? {},
              },
              "REJECTED",
              b.reason ?? "",
            ),
          );
        case "close":
          return r(
            patchPermit(
              id,
              { status: "CLOSURE_REQUESTED" },
              "CLOSURE_REQUESTED",
              "Closure requested",
            ),
          );
        case "confirm-closure":
          return r(patchPermit(id, { status: "CLOSED" }, "CLOSED", "Closure confirmed"));
      }
    }
  }

  throw new LocalApiError(
    "This action needs the full FCM server, which isn't connected in this demo.",
    501,
  );
}
