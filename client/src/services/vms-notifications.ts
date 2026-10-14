import { apiRequest } from "@/lib/api";
import type { AppNotification } from "@/lib/types";

export function listVmsNotifications(): Promise<AppNotification[]> {
  return apiRequest<AppNotification[]>("/vms/notifications");
}

export function markVmsNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>("/vms/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids: ids ?? null }),
  });
}
