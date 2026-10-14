import { apiRequest } from "@/lib/api";
import type { WorkPermit, WorkPermitCatalog } from "@/lib/work-permit";

export interface EwpNotification {
  id: string;
  permitId: string;
  permitNo: string;
  action: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string | null;
}

export function listEwpNotifications() {
  return apiRequest<EwpNotification[]>("/work-permit-notifications");
}

export function markEwpNotificationsRead(ids?: string[]) {
  return apiRequest<{ updated: number }>("/work-permit-notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function getWorkPermitCatalog() {
  return apiRequest<WorkPermitCatalog>("/work-permits/catalog");
}

export function listWorkPermits() {
  return apiRequest<WorkPermit[]>("/work-permits");
}

export function getWorkPermit(id: string) {
  return apiRequest<WorkPermit>(`/work-permits/${id}`);
}

export function lookupWorkPermit(code: string) {
  return apiRequest<WorkPermit>(`/work-permits/lookup?code=${encodeURIComponent(code)}`);
}

export function saveWorkPermit(payload: Record<string, unknown>) {
  return apiRequest<WorkPermit>("/work-permits", {
    method: "POST",
    body: JSON.stringify({ permit: payload }),
  });
}

export function submitWorkPermit(id: string) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/submit`, { method: "POST" });
}

export function sendContractorOtp(id: string, contractorEmail?: string) {
  return apiRequest<{ sent: boolean; destination: string; expiresInSeconds: number }>(
    `/work-permits/${id}/contractor-otp/send`,
    {
      method: "POST",
      ...(contractorEmail ? { body: JSON.stringify({ contractorEmail }) } : {}),
    },
  );
}

export function verifyContractorOtp(id: string, code: string, contractorEmail?: string) {
  return apiRequest<{ verified: boolean; verifiedAt: string }>(
    `/work-permits/${id}/contractor-otp/verify`,
    {
      method: "POST",
      body: JSON.stringify({ code, ...(contractorEmail ? { contractorEmail } : {}) }),
    },
  );
}

export function fesSignoffWorkPermit(id: string) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/fes-signoff`, { method: "POST" });
}

export function approveWorkPermit(id: string, hseValidation: WorkPermit["hseValidation"]) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ hseValidation }),
  });
}

export function resendWorkPermitApprovalEmail(id: string) {
  return apiRequest<{ message: string }>(`/work-permits/${id}/resend-approval-email`, {
    method: "POST",
  });
}

export function sendBackWorkPermit(
  id: string,
  note: string,
  hseValidation: WorkPermit["hseValidation"],
) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/send-back`, {
    method: "POST",
    body: JSON.stringify({ note, hseValidation }),
  });
}

export function rejectWorkPermit(
  id: string,
  reason: string,
  hseValidation: WorkPermit["hseValidation"],
) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason, hseValidation }),
  });
}

export function sendGateOtp(id: string, qrToken: string) {
  return apiRequest<{ sent: boolean; destination: string; expiresInSeconds: number }>(
    `/work-permits/${id}/gate-otp/send`,
    {
      method: "POST",
      body: JSON.stringify({ qrToken }),
    },
  );
}

export function verifyGateOtp(id: string, qrToken: string, code: string) {
  return apiRequest<{ verified: boolean; verifiedAt: string }>(
    `/work-permits/${id}/gate-otp/verify`,
    {
      method: "POST",
      body: JSON.stringify({ qrToken, code }),
    },
  );
}

export function getGateOtpStatus(id: string, qrToken: string) {
  return apiRequest<{ verified: boolean }>(
    `/work-permits/${id}/gate-otp/status?qrToken=${encodeURIComponent(qrToken)}`,
  );
}

export function verifyPublicGateOtp(id: string, qrToken: string, code: string) {
  return apiRequest<{ verified: boolean; verifiedAt: string }>(
    `/public/work-permits/${id}/gate-otp/verify`,
    {
      auth: false,
      method: "POST",
      body: JSON.stringify({ qrToken, code }),
    },
  );
}

export function gateWorkPermit(
  id: string,
  payload: {
    grant: boolean;
    qrToken?: string;
    consent?: boolean;
    contractorIdCard?: string;
    reason?: string;
    note?: string;
  },
) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/gate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function closeWorkPermit(id: string, payload: Record<string, unknown>) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmWorkPermitClosure(id: string, payload: Record<string, unknown>) {
  return apiRequest<WorkPermit>(`/work-permits/${id}/confirm-closure`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
