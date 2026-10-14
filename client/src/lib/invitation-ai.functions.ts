import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const extractVisitorFromText = createServerFn({ method: "POST" })
  .validator((data) => z.object({ text: z.string().min(5).max(4000), today: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { extractVisitor } = await import("./invitation-ai.server");
    try {
      return { ok: true as const, visitor: await extractVisitor(data.text, data.today) };
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      const msg =
        e.statusCode === 429
          ? "AI is busy right now — please try again in a moment."
          : e.statusCode === 402
            ? "AI credits have run out. Add credits in Settings → Plans & credits."
            : "Couldn't read the invitation. Please fill the form manually.";
      console.error("extractVisitor failed", e.statusCode, e.message);
      return { ok: false as const, error: msg };
    }
  });
