interface VendorEmailInput {
  to: string;
  subject: string;
  body: string;
  link: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export async function deliverVendorEmail(input: VendorEmailInput) {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["RESEND_FROM_EMAIL"]?.trim();
  if (!apiKey || !from) {
    throw new Error(
      "Vendor email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server.",
    );
  }

  const link = new URL(input.link);
  if (link.protocol !== "https:") {
    throw new Error(
      "Vendor email requires an HTTPS VITE_PUBLIC_APP_URL so the secure link works outside this computer.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.body,
      html: `<pre style="font: inherit; white-space: pre-wrap">${escapeHtml(input.body)}</pre>`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Email provider rejected the message (HTTP ${response.status}). Check the sender domain and Resend configuration.`,
    );
  }

  const result = (await response.json()) as { id?: string };
  if (!result.id) throw new Error("Email provider did not confirm delivery.");
  return { messageId: result.id };
}
