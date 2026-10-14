import { apiRequest } from "@/lib/api";
import type { RoleMaster, Status } from "@/lib/types";

export async function listRoles(includeInactive = true): Promise<RoleMaster[]> {
  const query = includeInactive ? "?includeInactive=true" : "";
  return apiRequest<RoleMaster[]>(`/roles${query}`);
}

export async function updateRole(
  id: string,
  payload: { name: string; description: string; status: Status },
): Promise<RoleMaster> {
  return apiRequest<RoleMaster>(`/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
