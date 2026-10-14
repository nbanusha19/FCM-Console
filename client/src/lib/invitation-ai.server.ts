import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export interface ExtractedVisitor {
  name: string;
  company: string;
  email: string;
  phone: string;
  designation: string;
  purpose: string;
  visitDate: string;
  expectedArrival: string;
  expectedDeparture: string;
  remarks: string;
}

const FIELDS: (keyof ExtractedVisitor)[] = [
  "name", "company", "email", "phone", "designation", "purpose",
  "visitDate", "expectedArrival", "expectedDeparture", "remarks",
];

export async function extractVisitor(text: string, today: string): Promise<ExtractedVisitor> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system:
      `You extract visitor details from an employee's free-text invitation. Today is ${today}. ` +
      `Reply with ONLY a JSON object with string keys: ${FIELDS.join(", ")}. ` +
      `visitDate as YYYY-MM-DD (resolve relative dates like "tomorrow" or "next Monday"); times as HH:MM 24h. ` +
      `If departure is unknown but arrival is known, use arrival + 2 hours. Use "" for anything not stated. Never invent emails or phone numbers.`,
    prompt: text,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const raw = await result.text;
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  const out = {} as ExtractedVisitor;
  for (const f of FIELDS) out[f] = typeof parsed[f] === "string" ? (parsed[f] as string).trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.visitDate)) out.visitDate = "";
  for (const t of ["expectedArrival", "expectedDeparture"] as const) if (!/^\d{2}:\d{2}$/.test(out[t])) out[t] = "";
  return out;
}
