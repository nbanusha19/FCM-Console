/**
 * Development authentication.
 *
 * The production deployment is expected to authenticate through the shared
 * FCM Console identity provider (SSO). Until that is wired up, these local
 * accounts let every role be exercised end to end.
 */
import type { AppUser } from "@/lib/types";
import { KEYS, getData, getList, saveData } from "@/services/storage";

export const DEV_PASSWORD = "FcmConsole#Demo2026";

export const DEV_USERS: AppUser[] = [
  {
    id: "USR-DEV-1",
    name: "Aarthi Raman",
    email: "admin@fcm.local",
    password: DEV_PASSWORD,
    role: "ADMIN",
    branchId: "BR-HQ",
    employeeId: null,
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-2",
    name: "Vikram Shah",
    email: "manager@fcm.local",
    password: DEV_PASSWORD,
    role: "BRANCH_MANAGER",
    branchId: "BR-HQ",
    employeeId: null,
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-3",
    name: "Deepa Nair",
    email: "employee@fcm.local",
    password: DEV_PASSWORD,
    role: "EMPLOYEE",
    branchId: "BR-HQ",
    employeeId: "EMP001",
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-4",
    name: "Suresh Kumar",
    email: "security@fcm.local",
    password: DEV_PASSWORD,
    role: "SECURITY",
    branchId: "BR-HQ",
    employeeId: null,
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-5",
    name: "Nisha Pillai",
    email: "hse@fcm.local",
    password: DEV_PASSWORD,
    role: "HSE",
    branchId: "BR-HQ",
    employeeId: null,
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-6",
    name: "Ravi Menon",
    email: "provider@fcm.local",
    password: DEV_PASSWORD,
    role: "SERVICE_PROVIDER",
    branchId: "BR-HQ",
    employeeId: null,
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-7",
    name: "Anusha Rao",
    email: "warden@fcm.local",
    password: DEV_PASSWORD,
    role: "FIRE_WARDEN",
    branchId: "BR-HQ",
    employeeId: null,
    phone: "",
    status: "ACTIVE",
  },
  {
    id: "USR-DEV-8",
    name: "Rahul Kumar",
    email: "rahul@fcm.local",
    password: DEV_PASSWORD,
    role: "EMPLOYEE",
    branchId: "BR-HQ",
    employeeId: "EMP002",
    phone: "",
    status: "ACTIVE",
  },
];

export function ensureDevUsers(): AppUser[] {
  const existing = getList<AppUser>(KEYS.users);
  const missing = DEV_USERS.filter((seed) => !existing.some((u) => u.email === seed.email));
  const next = existing.map((user) => {
    const seed = DEV_USERS.find((candidate) => candidate.email === user.email);
    if (!seed) return user;
    return {
      ...user,
      ...(!user.password ? { password: seed.password } : {}),
      ...(!user.employeeId && seed.employeeId ? { employeeId: seed.employeeId } : {}),
    };
  });
  if (!missing.length && next.every((user, index) => user === existing[index])) return existing;
  next.push(...missing);
  saveData(KEYS.users, next);
  return next;
}

export function devLogin(email: string, password: string): AppUser {
  const users = ensureDevUsers();
  const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!match) throw new Error("No account found for that email address.");
  if (match.status !== "ACTIVE") throw new Error("This account is inactive.");
  if (match.password !== password) throw new Error("Incorrect password.");
  const user: AppUser = { ...match, password: "" };
  saveData(KEYS.currentUser, user);
  return user;
}

export function devSession(): AppUser | null {
  return getData<AppUser | null>(KEYS.currentUser, null);
}

export function clearDevSession(): void {
  saveData<AppUser | null>(KEYS.currentUser, null);
}
