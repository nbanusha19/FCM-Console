/**
 * Host notification channel. Real WhatsApp is NOT connected yet — this is a
 * clearly-labelled simulation that records the notice in the visit activity log.
 * Swap `sendWhatsApp` for a real provider later without touching screens.
 */
import { toast } from "sonner";
import { logVisitEvent } from "./visitor-requests";
import type { AppUser } from "@/lib/types";

export const WHATSAPP_CONNECTED = false;

export async function notifyHostForApproval(visit: { id: string; visitor_name: string; host_name: string; request_no: string }, actor: AppUser | null) {
  const msg = `Approval request ${visit.request_no}: ${visit.visitor_name} wants to visit you.`;
  await logVisitEvent(visit.id, "HOST_NOTIFIED", `WhatsApp (simulated) to ${visit.host_name}: ${msg}`, actor).catch(() => {});
  toast.info(`Simulated WhatsApp sent to ${visit.host_name || "the host"}`, {
    description: "Real WhatsApp isn't connected yet — the host sees this request under Approvals.",
  });
}
