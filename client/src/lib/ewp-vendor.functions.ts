import { z } from "zod";
import { localDb } from "@/services/local-client";

const token = z.string().regex(/^[a-f0-9]{64}$/);

async function loadByToken(t: string) {
  const { data } = await localDb
    .from("work_permits")
    .select(
      "id, permit_no, permit_type, service, work_description, location, start_date, end_date, vendor_name, status, vendor_token, vendor_token_expires_at, worker_count, vendor_start_date, vendor_end_date, vendor_submitted_at",
    )
    .eq("vendor_token", t)
    .maybeSingle();
  return data;
}

/** Public: vendor opens the secure email link. Only vendor-relevant fields are returned. */
export async function getVendorPermit({ data: input }: { data: unknown }) {
  const data = z.object({ token }).parse(input);
  const p = await loadByToken(data.token);
  if (!p) return { state: "invalid" as const };
  if (p.vendor_token_expires_at && new Date(p.vendor_token_expires_at) < new Date())
    return { state: "expired" as const };
  const { vendor_token_expires_at: _e, vendor_token: _t, id: _i, ...safe } = p;
  if (p.status !== "VENDOR_ACTION_REQUIRED") return { state: "submitted" as const, permit: safe };
  return { state: "open" as const, permit: safe };
}

export async function submitVendorWorkers({ data: input }: { data: unknown }) {
  const data = z
    .object({
      token,
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      workers: z
        .array(
          z.object({
            name: z.string().trim().min(2).max(100),
            worker_ref: z.string().trim().max(50),
            contact: z.string().trim().max(30),
          }),
        )
        .min(1)
        .max(100),
    })
    .refine((v) => v.end_date >= v.start_date, "End date must be on or after the start date")
    .parse(input);
  const p = await loadByToken(data.token);
  if (!p) throw new Error("This link is not valid.");
  if (p.vendor_token_expires_at && new Date(p.vendor_token_expires_at) < new Date())
    throw new Error("This link has expired.");
  if (p.status !== "VENDOR_ACTION_REQUIRED")
    throw new Error("Worker details were already submitted.");
  const { error: workersError } = await localDb
    .from("ewp_workers")
    .insert(data.workers.map((worker) => ({ ...worker, permit_id: p.id })));
  if (workersError) throw new Error("Could not save worker details.");
  await localDb
    .from("work_permits")
    .update({
      status: "VENDOR_SUBMITTED",
      worker_count: data.workers.length,
      workmen_count: data.workers.length,
      vendor_start_date: data.start_date,
      vendor_end_date: data.end_date,
      vendor_submitted_at: new Date().toISOString(),
    })
    .eq("id", p.id);
  await localDb.from("ewp_events").insert({
    permit_id: p.id,
    action: "VENDOR_SUBMITTED",
    note: `${p.vendor_name} submitted ${data.workers.length} worker(s), ${data.start_date} to ${data.end_date}`,
    actor_id: null,
    actor_name: p.vendor_name || "Vendor",
  });
  return { ok: true, permit_no: p.permit_no };
}
