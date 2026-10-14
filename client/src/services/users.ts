import { apiRequest } from "@/lib/api";
import { toAppUser, type AuthUserPayload } from "@/services/auth";
import type { AppUser, RoleKey, Status } from "@/lib/types";

export async function listUsers(): Promise<AppUser[]> {
  const rows = await apiRequest<AuthUserPayload[]>("/users");
  return rows.map(toAppUser);
}

export async function createUser(payload: {
  name: string;
  email: string;
  password: string;
  role: RoleKey;
  branchId?: string | null;
  employeeId?: string | null;
  phone?: string | null;
}): Promise<AppUser> {
  const row = await apiRequest<AuthUserPayload>("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return toAppUser(row);
}

export async function updateUser(
  id: string,
  payload: {
    name: string;
    email: string;
    password?: string;
    role: RoleKey;
    branchId?: string | null;
    employeeId?: string | null;
    phone?: string | null;
    status: Status;
  },
): Promise<AppUser> {
  const row = await apiRequest<AuthUserPayload>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return toAppUser(row);
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest<null>(`/users/${id}`, { method: "DELETE" });
}
