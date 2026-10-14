/**
 * Central localStorage data layer. UI components never touch localStorage
 * directly — they go through this module (and services/vms.ts).
 *
 * Swapping to a real backend later = replace the bodies of getData/saveData
 * with fetch calls; the rest of the app stays untouched.
 */

export const KEYS = {
  users: "visitflow_users",
  roles: "visitflow_roles",
  branches: "visitflow_branches",
  employees: "visitflow_employees",
  departments: "visitflow_departments",
  designations: "visitflow_designations",
  visitorTypes: "visitflow_visitor_types",
  visitors: "visitflow_visitors",
  visitorCards: "visitflow_visitor_cards",
  notifications: "visitflow_notifications",
  auditLogs: "visitflow_audit_logs",
  emails: "visitflow_emails",
  settings: "visitflow_settings",
  currentUser: "visitflow_current_user",
  counters: "visitflow_counters",
  theme: "visitflow_theme",
  visitorCardPhotos: "visitflow_visitor_card_photos",
  issuedVisitorCards: "visitflow_issued_visitor_cards",
  ewpWorkerPhotos: "visitflow_ewp_worker_photos",
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

const isBrowser = () => typeof window !== "undefined";

export function getData<T>(key: StorageKey, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveData<T>(key: StorageKey, value: T): T {
  if (!isBrowser()) return value;
  window.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function getList<T>(key: StorageKey): T[] {
  return getData<T[]>(key, []);
}

export function insertData<T extends { id: string }>(key: StorageKey, row: T): T {
  const list = getList<T>(key);
  saveData(key, [row, ...list]);
  return row;
}

export function updateData<T extends { id: string }>(
  key: StorageKey,
  id: string,
  patch: Partial<T>,
): T | null {
  const list = getList<T>(key);
  let updated: T | null = null;
  const next = list.map((row) => {
    if (row.id !== id) return row;
    updated = { ...row, ...patch };
    return updated;
  });
  saveData(key, next);
  return updated;
}

export function deleteData(key: StorageKey, id: string): void {
  const list = getList<{ id: string }>(key);
  saveData(
    key,
    list.filter((row) => row.id !== id),
  );
}

export function findById<T extends { id: string }>(key: StorageKey, id: string): T | undefined {
  return getList<T>(key).find((row) => row.id === id);
}

/* ---------- id generators ---------- */

interface Counters {
  visitor: number;
  request: number;
}

function counters(): Counters {
  return getData<Counters>(KEYS.counters, { visitor: 0, request: 0 });
}

export function setCounters(next: Counters) {
  saveData(KEYS.counters, next);
}

export function generateVisitorId(prefix = "VIS"): string {
  const c = counters();
  const next = { ...c, visitor: c.visitor + 1 };
  setCounters(next);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(next.visitor).padStart(6, "0")}`;
}

export function generateRequestId(): string {
  const c = counters();
  const next = { ...c, request: c.request + 1 };
  setCounters(next);
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(next.request).padStart(4, "0")}`;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
