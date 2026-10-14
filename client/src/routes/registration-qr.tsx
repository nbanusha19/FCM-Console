import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Printer } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { QrImage } from "@/components/common/QrImage";
import { Button } from "@/components/ui/button";
import { appUrl, isLoopbackUrl } from "@/lib/utils";

export const Route = createFileRoute("/registration-qr")({
  head: () => ({
    meta: [
      { title: "Walk-in registration QR — FCM Console" },
      { name: "description", content: "Printable QR poster that walk-in guests scan to register their visit." },
      { property: "og:title", content: "Walk-in registration QR — FCM Console" },
      { property: "og:description", content: "Print this QR for the security desk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "SECURITY"]}>
      <RegistrationQr />
    </AppPage>
  ),
});

function RegistrationQr() {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(appUrl("/register")), []);
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Visitor Management" title="Walk-in registration QR" subtitle="This QR opens the visitor registration form. It is different from a visitor's personal visit QR." actions={<Button onClick={() => window.print()}><Printer className="size-4" /> Print poster</Button>} />
      <div className="surface-card mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h2 className="text-[22px] font-bold">Visiting us?</h2>
        <p className="text-[14px] text-muted-foreground">Scan to register and request your visit.</p>
        {url ? <QrImage value={url} size={280} /> : null}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-[12px] text-primary underline">
            {url}
          </a>
        ) : null}
        {url ? (
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Open link
            </a>
          </Button>
        ) : null}
        {url && isLoopbackUrl(url) ? <p className="text-[12px] text-warning">This QR uses localhost and only opens on this computer. Configure VITE_PUBLIC_APP_URL to print a code for other devices.</p> : null}
      </div>
    </div>
  );
}
