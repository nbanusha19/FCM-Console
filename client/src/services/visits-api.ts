import { apiRequest } from "@/lib/api";
import type { Visit } from "@/lib/types";

export function listVisits(): Promise<Visit[]> {
  return apiRequest<Visit[]>("/visits");
}

export function createVisit(payload: Record<string, unknown>): Promise<Visit> {
  return apiRequest<Visit>("/visits", { method: "POST", body: JSON.stringify(payload) });
}

export function approveVisitRequest(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/approve`, { method: "POST" });
}

export function rejectVisitRequest(id: string, reason: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function cancelVisitRequest(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/cancel`, { method: "POST" });
}

export function checkInVisitRequest(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/check-in`, { method: "POST" });
}

export function checkOutVisitRequest(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/check-out`, { method: "POST" });
}

export function resendVisitInvite(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/resend-invite`, { method: "POST" });
}

export function getVisitorPassLink(id: string): Promise<{ portalUrl: string | null }> {
  return apiRequest<{ portalUrl: string | null }>(`/visits/${id}/pass-link`);
}

export function issueVisitorGuestPass(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${encodeURIComponent(id)}/issue-guest-pass`, { method: "POST" });
}

export function returnVisitorCard(id: string): Promise<{ visit_id: string; card: import("@/services/visitor-requests").GuestCard }> {
  return apiRequest<{ visit_id: string; card: import("@/services/visitor-requests").GuestCard }>(
    `/visitor-requests/${encodeURIComponent(id)}/return-card`,
    { method: "POST" },
  );
}

export function saveVisitPhotoRequest(id: string, photo: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/${id}/photo`, {
    method: "POST",
    body: JSON.stringify({ photo }),
  });
}

export function lookupVisit(code: string): Promise<Visit> {
  return apiRequest<Visit>(`/visits/lookup?code=${encodeURIComponent(code)}`);
}

export interface WalkInQr {
  branchId: string;
  branchName: string;
  token: string;
  url: string;
  qrImageUrl: string;
  gateUrl: string;
  gateQrImageUrl: string;
}

export function getWalkInQr(): Promise<WalkInQr> {
  return apiRequest<WalkInQr>("/visits/walk-in-qr");
}

export function authorizeVisitorCardIssue(id: string): Promise<{ authorized: boolean }> {
  return apiRequest<{ authorized: boolean }>(`/visits/${id}/authorize-card-issue`, { method: "POST" });
}
