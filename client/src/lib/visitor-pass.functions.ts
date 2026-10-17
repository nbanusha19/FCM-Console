import { z } from "zod";
import { apiRequest } from "@/lib/api";

const visitorPassInput = z.object({
  id: z.string().min(1),
  token: z.string().min(32).max(128),
});

export interface PublicVisitorPass {
  id: string;
  request_no: string;
  visitor_name: string;
  visitor_code: string;
  company: string;
  purpose: string;
  location: string;
  visit_date: string;
  expected_arrival: string;
  expected_departure: string;
  host_name: string;
  status: string;
  check_in_available: boolean;
  check_in_verified: boolean;
  check_in_window_message: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
}

export async function getVisitorPass({ data }: { data: { id: string; token: string } }) {
  const { id, token } = visitorPassInput.parse(data);
  return apiRequest<PublicVisitorPass>(`/public/visits/${encodeURIComponent(id)}/pass`, {
    method: "POST",
    body: JSON.stringify({ token }),
    auth: false,
  });
}

export async function getVisitorPassByQrToken(token: string) {
  const validToken = z.string().min(32).max(128).parse(token);
  return apiRequest<PublicVisitorPass>(`/public/visitor-passes/${encodeURIComponent(validToken)}`, {
    auth: false,
  });
}

export interface VisitorLocation {
  latitude: number;
  longitude: number;
}

export async function requestVisitorCheckInOtp(
  id: string,
  token: string,
  location: VisitorLocation,
) {
  return apiRequest<{
    sent: boolean;
    destination: string;
    expiresInSeconds: number;
    resendAfterSeconds: number;
  }>(`/public/visits/${encodeURIComponent(id)}/check-in/otp`, {
    method: "POST",
    body: JSON.stringify({ token, ...location }),
    auth: false,
  });
}

export async function verifyVisitorCheckInOtp(
  id: string,
  token: string,
  code: string,
  location: VisitorLocation,
) {
  return apiRequest<PublicVisitorPass>(`/public/visits/${encodeURIComponent(id)}/check-in/verify`, {
    method: "POST",
    body: JSON.stringify({ token, code, ...location }),
    auth: false,
  });
}

export async function checkInVisitorWithEmailPass(
  id: string,
  token: string,
  location: VisitorLocation,
) {
  return apiRequest<PublicVisitorPass>(`/public/visits/${encodeURIComponent(id)}/check-in`, {
    method: "POST",
    body: JSON.stringify({ token, ...location }),
    auth: false,
  });
}

export async function checkOutVisitorWithEmailPass(id: string, token: string) {
  return apiRequest<PublicVisitorPass>(`/public/visits/${encodeURIComponent(id)}/check-out`, {
    method: "POST",
    body: JSON.stringify({ token }),
    auth: false,
  });
}
