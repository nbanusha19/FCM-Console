import type { AppUser, RoleKey, Status } from "@/lib/types";
import { apiRequest } from "@/lib/api";

const ACCESS_TOKEN_KEY = "visitflow_access_token";

export interface AuthUserPayload {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  roleId?: string;
  branchId: string | null;
  employeeId: string | null;
  phone?: string | null;
  status: Status;
  lastLoginAt?: string | null;
}

export function toAppUser(payload: AuthUserPayload): AppUser {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    password: "",
    role: payload.role,
    branchId: payload.branchId ?? null,
    employeeId: payload.employeeId ?? null,
    phone: payload.phone ?? "",
    status: payload.status,
  };
}

export async function loginRequest(email: string, password: string): Promise<AppUser> {
  const response = await apiRequest<{ access_token: string; user: AuthUserPayload }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    auth: false,
  });
  window.localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token);
  return toAppUser(response.user);
}

export async function restoreSession(): Promise<AppUser | null> {
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;
  try {
    const user = await apiRequest<AuthUserPayload>("/auth/me", { token });
    return toAppUser(user);
  } catch (error) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    if (error instanceof Error && "status" in error && error.status !== 401) throw error;
    return null;
  }
}

export function clearSession(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}
