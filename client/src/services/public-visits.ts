import { apiRequest } from "@/lib/api";
import type { Visit } from "@/lib/types";

const TOKEN_KEY = "vms_visitor_token";

export function getVisitorToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function saveVisitorToken(token: string) {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearVisitorToken() {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

function visitorRequest<T>(path: string, options: RequestInit & { token?: string } = {}) {
  const headers = new Headers(options.headers);
  const token = options.token ?? getVisitorToken();
  if (token) headers.set("X-Visitor-Token", token);
  return apiRequest<T>(path, { ...options, auth: false, headers });
}

export interface GatePreview {
  name: string;
  visitorId: string;
  visitDate: string;
  status: string;
  maskedEmail: string;
  maskedPhone: string;
}

export function getGatePreview(token: string) {
  return apiRequest<GatePreview>(`/public/gate/${token}`, { auth: false });
}

export function requestGateOtp(token: string, identifier: string) {
  return apiRequest<{ sent: boolean; channel: string }>(`/public/gate/${token}/otp`, {
    auth: false,
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export function verifyGateOtp(token: string, identifier: string, code: string) {
  return apiRequest<{ token: string; visit: Visit }>(`/public/gate/${token}/verify`, {
    auth: false,
    method: "POST",
    body: JSON.stringify({ identifier, code }),
  });
}

export function getVisitorSession() {
  return visitorRequest<Visit>("/public/session");
}

export function portalCheckIn() {
  return visitorRequest<Visit>("/public/check-in", { method: "POST" });
}

export function portalCheckOut() {
  return visitorRequest<Visit>("/public/check-out", { method: "POST" });
}

export function getScanPreview(token: string) {
  return apiRequest<{ branchId: string; branchName: string }>(`/public/scan/${token}`, { auth: false });
}

export function requestScanOtp(token: string, identifier: string) {
  return apiRequest<{ sent: boolean; channel: string }>(`/public/scan/${token}/otp`, {
    auth: false,
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export function verifyScanOtp(token: string, identifier: string, code: string) {
  return apiRequest<{ token: string; visit: Visit }>(`/public/scan/${token}/verify`, {
    auth: false,
    method: "POST",
    body: JSON.stringify({ identifier, code }),
  });
}

export interface WalkInPreview {
  branchId: string;
  branchName: string;
}

export function getWalkInPreview(token: string) {
  return apiRequest<WalkInPreview>(`/public/walk-in/${token}`, { auth: false });
}

export function submitWalkIn(
  token: string,
  payload: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    purpose: string;
    personToMeet?: string;
  },
) {
  return apiRequest<{ id: string; requestId: string; status: string; message: string }>(`/public/walk-in/${token}`, {
    auth: false,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ApprovalPreview {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string | null;
  purpose: string;
  visitDate: string;
  status: string;
  visitorId?: string | null;
  remarks?: string | null;
}

export function getApprovalPreview(token: string) {
  return apiRequest<ApprovalPreview>(`/public/approve/${token}`, { auth: false });
}

export function decideApproval(token: string, action: "approve" | "reject", reason?: string) {
  return apiRequest<Visit>(`/public/approve/${token}`, {
    auth: false,
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}
