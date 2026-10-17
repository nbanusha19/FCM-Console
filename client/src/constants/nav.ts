import type { RoleKey } from "@/lib/types";

export interface NavItem {
  to: string;
  label: string;
  /** Sub-page: shown in the module sidebar only, not the top bar. */
  sub?: boolean;
}

const HOME: NavItem = { to: "/home", label: "Home" };
const s = (to: string, label: string): NavItem => ({ to, label, sub: true });
const EWP: NavItem = { to: "/ework-permit", label: "Dashboard" };
const EWP_NEW = s("/ework-permit/new", "Create permit");
const EWP_ALL = s("/ework-permit/all", "All permits");
const EWP_REVIEW = s("/ework-permit/review", "Pending HSE review");
const EWP_SEC = s("/ework-permit/security", "Gate verification");
const EWP_REP = s("/ework-permit/reports", "Permit reports");
const EWP_SET = s("/ework-permit/setup", "Vendors");
const EMG: NavItem = { to: "/emergency", label: "Dashboard" };
const EMG_WARDEN: NavItem[] = [
  EMG,
  s("/emergency/history", "Incident history"),
  s("/emergency/reports", "Employee accountability & reports"),
];
const EMG_ADMIN: NavItem[] = [
  EMG,
  s("/emergency/new", "Trigger Emergency"),
  s("/emergency/history", "Incident history"),
  s("/emergency/reports", "Emergency reports"),
  s("/emergency/setup", "Emergency Administration"),
];

/** Full VMS area for admin / security / managers. */
const VMS_STAFF: NavItem[] = [
  { to: "/vms-dashboard", label: "Visitor dashboard" },
  s("/visitors", "Visitor requests"),
  s("/vms-approvals", "Approvals"),
  s("/vms-today", "Today's visits"),
  s("/vms-upcoming", "Upcoming visits"),
  s("/vms-history", "Visit history"),
  s("/registration-qr", "Walk-in QR"),
  s("/vms-reports", "Reports"),
];
const VMS_EMPLOYEE: NavItem[] = [
  { to: "/vms-dashboard", label: "Dashboard" },
  { to: "/visitors", label: "My visits" },
  s("/vms-upcoming", "Upcoming visits"),
];
/** Helpdesk area per audience. */
const HD_EMPLOYEE: NavItem[] = [
  { to: "/helpdesk", label: "Dashboard" },
  s("/hd-tickets", "My tickets"),
  s("/hd-history", "Ticket history"),
];
const HD_PROVIDER: NavItem[] = [
  { to: "/helpdesk", label: "Dashboard" },
  s("/hd-assigned", "Service request queue"),
  s("/hd-history", "Ticket history"),
];
const HD_ADMIN: NavItem[] = [
  { to: "/helpdesk", label: "Dashboard" },
  s("/hd-tickets", "All tickets"),
  s("/hd-feedback", "Building feedback"),
  s("/hd-reports", "Reports"),
  s("/hd-history", "Ticket history"),
  s("/hd-masters", "Masters"),
];

export const NAV_BY_ROLE: Record<RoleKey, NavItem[]> = {
  ADMIN: [
    HOME,
    ...VMS_STAFF,
    s("/vms-cards", "Guest cards"),
    EWP,
    EWP_NEW,
    EWP_ALL,
    EWP_SEC,
    EWP_REP,
    EWP_SET,
    ...EMG_ADMIN,
    ...HD_ADMIN,
  ],
  BRANCH_MANAGER: [HOME, ...VMS_STAFF, EWP, EWP_NEW, ...HD_EMPLOYEE],
  EMPLOYEE: [HOME, ...VMS_EMPLOYEE, EWP, EWP_NEW, EMG, ...HD_EMPLOYEE],
  SECURITY: [HOME, ...VMS_STAFF.filter((i) => i.to !== "/vms-approvals"), EWP, EWP_SEC],
  HSE: [HOME, EWP, EWP_ALL, EWP_REVIEW, EWP_REP, ...EMG_ADMIN],
  FIRE_WARDEN: [HOME, ...EMG_WARDEN],
  SERVICE_PROVIDER: [HOME, ...HD_PROVIDER],
};

export const ROLE_LABEL: Record<RoleKey, string> = {
  ADMIN: "Admin",
  BRANCH_MANAGER: "Branch Manager",
  SECURITY: "Security",
  EMPLOYEE: "Employee",
  HSE: "HSE",
  FIRE_WARDEN: "Fire Warden",
  SERVICE_PROVIDER: "Service Provider",
};

export const HOME_BY_ROLE: Record<RoleKey, string> = {
  ADMIN: "/home",
  BRANCH_MANAGER: "/home",
  EMPLOYEE: "/home",
  SECURITY: "/home",
  HSE: "/home",
  FIRE_WARDEN: "/home",
  SERVICE_PROVIDER: "/home",
};
