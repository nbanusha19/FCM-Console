import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyPublicGateOtp } from "@/services/work-permits-api";

export const Route = createFileRoute("/ework-permit-checkin")({
  validateSearch: (search: Record<string, unknown>) => ({
    permitId: typeof search.permitId === "string" ? search.permitId : "",
  }),
  head: () => ({
    meta: [
      { title: "E-Work Permit check-in verification — FCM Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContractorGateCheckIn,
});

function ContractorGateCheckIn() {
  const { permitId } = Route.useSearch();
  const [qrToken, setQrToken] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setQrToken(params.get("qrToken") ?? "");
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!permitId || !qrToken || !/^\d{6}$/.test(code)) {
      toast.error(
        "Open the verification link from the contractor email and enter its six-digit code.",
      );
      return;
    }
    setBusy(true);
    try {
      await verifyPublicGateOtp(permitId, qrToken, code);
      setVerified(true);
      setCode("");
      toast.success("Check-in verified. Security has been notified.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify the check-in code.");
    } finally {
      setBusy(false);
    }
  };

  if (verified) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-4">
        <section className="surface-card w-full max-w-md space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h1 className="font-display text-xl font-bold">Check-in verified</h1>
          <p className="text-sm text-muted-foreground">
            Your email code has been verified. Security has been notified and will continue the gate
            checks.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <section className="surface-card w-full max-w-md space-y-5 p-6">
        <div className="space-y-2 text-center">
          <ShieldAlert className="mx-auto size-10 text-primary" />
          <h1 className="font-display text-xl font-bold">Contractor check-in verification</h1>
          <p className="text-sm text-muted-foreground">
            Enter the six-digit code from this email to verify your arrival. Security will be
            notified when verification is complete.
          </p>
        </div>
        {!permitId || !qrToken ? (
          <p role="alert" className="text-sm text-danger">
            This verification link is incomplete. Open the link from the latest E-Work Permit
            check-in email.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="space-y-2">
              <Label htmlFor="contractor-gate-code">Email verification code</Label>
              <Input
                id="contractor-gate-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                disabled={busy}
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify check-in"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
