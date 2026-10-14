import type { AppSettings, AppUser, Branch, RoleMaster, VisitorTypeMaster } from "@/lib/types";
import { KEYS, getData, getList, saveData } from "@/services/storage";

export const DEFAULT_SETTINGS: AppSettings = {
  appName: "FCM Console",
  defaultBranchId: "",
  timeZone: "Asia/Kolkata (GMT+5:30)",
  dateFormat: "dd MMM yyyy",
  visitorIdPrefix: "VIS",
  defaultVisitDurationMins: 120,
  enableVisitorCard: true,
  requireApproval: true,
  notifyEmail: true,
  notifyApproval: true,
  notifyCheckIn: true,
  notifyCheckOut: true,
};

export const DEFAULT_ROLES: RoleMaster[] = [
  { id: "ROL-1", key: "ADMIN", name: "Admin", description: "Full system access and configuration", status: "ACTIVE" },
  { id: "ROL-2", key: "BRANCH_MANAGER", name: "Branch Manager", description: "Approves and manages visitors for a branch", status: "ACTIVE" },
  { id: "ROL-3", key: "SECURITY", name: "Security", description: "Front desk check-in and check-out operations", status: "ACTIVE" },
  { id: "ROL-4", key: "EMPLOYEE", name: "Employee", description: "Raises and tracks own visitor requests", status: "ACTIVE" },
  { id: "ROL-5", key: "HSE", name: "HSE", description: "Reviews, approves and closes work permits", status: "ACTIVE" },
  { id: "ROL-6", key: "FIRE_WARDEN", name: "Fire Warden", description: "Monitors evacuations and employee accountability", status: "ACTIVE" },
];

export const DEFAULT_VISITOR_TYPES: VisitorTypeMaster[] = [
  {
    id: "VT-1",
    key: "EMPLOYEE",
    name: "Internal Visitor",
    description: "Employee or internal visitor",
    status: "ACTIVE",
  },
  {
    id: "VT-2",
    key: "EXTERNAL",
    name: "External Visitor",
    description: "Guest from another company or organisation",
    status: "ACTIVE",
  },
];

const DEMO_CLEARED_FLAG = "vms_legacy_demo_cleared";
const SEED_BRANCH_IDS = new Set(["BR-BLR", "BR-MAA", "BR-HYD", "BR-BOM", "BR-PNQ"]);

function isSeedEmail(email?: string | null) {
  return Boolean(email?.endsWith("@visitflow.local"));
}

/** Keep role and visitor-type catalogs available without planting sample people or visits. */
export function ensureProductDefaults() {
  if (!getList<RoleMaster>(KEYS.roles).length) saveData(KEYS.roles, DEFAULT_ROLES);
  else {
    const roles = getList<RoleMaster>(KEYS.roles);
    if (!roles.some((role) => role.key === "FIRE_WARDEN")) saveData(KEYS.roles, [...roles, DEFAULT_ROLES[5]!]);
  }
  if (!getList<VisitorTypeMaster>(KEYS.visitorTypes).length) {
    saveData(KEYS.visitorTypes, DEFAULT_VISITOR_TYPES);
  }
}

function stripSeededMasters() {
  const branches = getList<Branch>(KEYS.branches);
  const nextBranches = branches.filter((b) => !SEED_BRANCH_IDS.has(b.id) && !isSeedEmail(b.email));
  if (nextBranches.length !== branches.length) saveData(KEYS.branches, nextBranches);

  const users = getList<AppUser>(KEYS.users);
  const nextUsers = users.filter((u) => !isSeedEmail(u.email));
  if (nextUsers.length !== users.length) saveData(KEYS.users, nextUsers);

  const settings = getData<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
  const seededBranch = SEED_BRANCH_IDS.has(settings.defaultBranchId);
  const rename = settings.appName === "VisitFlow" || settings.appName === "VMS";
  if (seededBranch || rename) {
    saveData(KEYS.settings, {
      ...DEFAULT_SETTINGS,
      ...settings,
      appName: rename ? DEFAULT_SETTINGS.appName : settings.appName,
      defaultBranchId: seededBranch ? "" : settings.defaultBranchId,
    });
  }
}

/** One-time wipe of the old localStorage sample dataset, plus a cheap strip of leftover seed masters. */
export function clearLegacyDemoData() {
  if (typeof window === "undefined") return;

  stripSeededMasters();
  ensureProductDefaults();

  if (window.localStorage.getItem(DEMO_CLEARED_FLAG) === "1") return;

  for (const key of [
    KEYS.visitors,
    KEYS.emails,
    KEYS.notifications,
    KEYS.auditLogs,
    KEYS.visitorCards,
    KEYS.employees,
    KEYS.departments,
    KEYS.designations,
  ]) {
    window.localStorage.removeItem(key);
  }

  window.localStorage.setItem(DEMO_CLEARED_FLAG, "1");
  ensureProductDefaults();
}
