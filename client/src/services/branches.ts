import { apiRequest } from "@/lib/api";
import type { Branch, Status } from "@/lib/types";

export async function listBranches(includeInactive = true): Promise<Branch[]> {
  const query = includeInactive ? "?includeInactive=true" : "";
  return apiRequest<Branch[]>(`/branches${query}`);
}

export interface BranchWritePayload {
  name: string;
  location?: string;
  phone?: string;
  email?: string;
  status?: Status;
}

export interface BranchGeofence {
  branchId: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  configured: boolean;
}

export async function getBranchGeofence(branchId: string): Promise<BranchGeofence> {
  return apiRequest<BranchGeofence>(`/branches/${encodeURIComponent(branchId)}/geofence`);
}

export async function saveBranchGeofence(
  branchId: string,
  geofence: { latitude: number; longitude: number; radiusM: number },
): Promise<BranchGeofence> {
  return apiRequest<BranchGeofence>(`/branches/${encodeURIComponent(branchId)}/geofence`, {
    method: "PUT",
    body: JSON.stringify(geofence),
  });
}

export async function createBranch(payload: BranchWritePayload): Promise<Branch> {
  return apiRequest<Branch>("/branches", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      location: payload.location,
      phone: payload.phone,
      email: payload.email,
      status: payload.status,
    }),
  });
}

export async function updateBranch(id: string, payload: BranchWritePayload): Promise<Branch> {
  return apiRequest<Branch>(`/branches/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: payload.name,
      location: payload.location,
      phone: payload.phone,
      email: payload.email,
      status: payload.status,
    }),
  });
}

export async function deleteBranch(id: string): Promise<void> {
  await apiRequest<null>(`/branches/${id}`, { method: "DELETE" });
}
