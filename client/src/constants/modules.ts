import type { RoleKey } from "@/lib/types";

export interface ConsoleModule {
  key: string;
  name: string;
  description: string;
  to: string;
  roles: RoleKey[];
  available: boolean;
}

/** The four FCM Console business modules. */
export const CONSOLE_MODULES: ConsoleModule[] = [
  {
    key: "vms",
    name: "Visitor Management",
    description: "Visitor requests, approvals, visitor IDs, badges and gate check-in/check-out.",
    to: "/vms-dashboard",
    roles: ["ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"],
    available: true,
  },
  {
    key: "eworkpermit",
    name: "E-Work Permit",
    description: "Raise, review and close work permits with HSE approval and gate verification.",
    to: "/ework-permit",
    roles: ["ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE"],
    available: true,
  },
  {
    key: "helpdesk",
    name: "FCM Helpdesk",
    description: "Raise and track facility service tickets through to resolution.",
    to: "/helpdesk",
    roles: ["ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SERVICE_PROVIDER"],
    available: true,
  },
  {
    key: "emergency",
    name: "Emergency Evacuation",
    description: "Evacuation roll call, fire warden actions and live headcount.",
    to: "/emergency",
    roles: [
      "ADMIN",
      "BRANCH_MANAGER",
      "SECURITY",
      "EMPLOYEE",
      "HSE",
      "FIRE_WARDEN",
      "SERVICE_PROVIDER",
    ],
    available: true,
  },
];

export function modulesForRole(role: RoleKey): ConsoleModule[] {
  return CONSOLE_MODULES.filter((m) => m.roles.includes(role)).map((module) =>
    module.key === "vms" && role === "EMPLOYEE"
      ? { ...module, name: "My Visits", to: "/visitors" }
      : module,
  );
}
