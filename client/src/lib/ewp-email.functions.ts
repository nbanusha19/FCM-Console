import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const vendorEmailInput = z.object({
  to: z.string().email().max(254),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  link: z.string().url().max(2000),
});

export const sendEwpVendorEmail = createServerFn({ method: "POST" })
  .validator((input) => vendorEmailInput.parse(input))
  .handler(async ({ data }) => {
    const { deliverVendorEmail } = await import("./ewp-email.server");
    return deliverVendorEmail(data);
  });
