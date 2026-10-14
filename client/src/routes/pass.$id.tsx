import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { QrImage } from "@/components/common/QrImage";
import { APP_NAME } from "@/constants/brand";
import { checkOutVisitorWithEmailPass, getVisitorPass } from "@/lib/visitor-pass.functions";
import { downloadPass } from "@/lib/download-pass";
import { printVisitorPass } from "@/lib/print-visitor-pass";
import { getVisitorCardPhoto } from "@/services/visitor-card-local";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestVisitorCheckInOtp,
  verifyVisitorCheckInOtp,
} from "@/lib/visitor-pass.functions";

export const Route = createFileRoute("/pass/$id")({
  head: () => ({
    meta: [
      { title: "Visitor pass — FCM Console" },
      { name: "description", content: "Your visitor pass and QR code to show at the gate." },
      { property: "og:title", content: "Visitor pass — FCM Console" },
      { property: "og:description", content: "Show this pass and QR code at the security gate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <Msg text="We couldn't load this pass. Please try again." />,
  notFoundComponent: () => <Msg text="Pass not found." />,
  component: PassPage,
});

function Msg({ text }: { text: string }) {
  return <main className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">{text}</main>;
}

function getDeviceLocation(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("This browser does not support device location."));
  }
  if (!window.isSecureContext) {
    return Promise.reject(
      new Error("Location access requires HTTPS. Open the visitor pass using the secure site address."),
    );
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Allow location access in your browser to continue check-in."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your device location is unavailable. Check location services and try again."
              : "Location lookup timed out. Try again.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

function PassPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [origin, setOrigin] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [checkInOtp, setCheckInOtp] = useState("");
  const [otpDestination, setOtpDestination] = useState<string | null>(null);
  const { data: v, isLoading, error } = useQuery({
    queryKey: ["visitor-pass", id, token],
    queryFn: () => getVisitorPass({ data: { id, token } }),
    enabled: Boolean(token),
    retry: false,
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setToken(params.get("token") ?? "");
    setOrigin(window.location.origin);
    setPhoto(getVisitorCardPhoto(id));
  }, [id]);
  const qrValue = `${origin}/pass/${encodeURIComponent(id)}#token=${token}`;
  if (!token) return <Msg text="This pass link is incomplete. Open the secure link from your invitation email." />;
  if (!origin) return <Msg text="Loading visitor pass…" />;
  if (isLoading) return <Msg text="Loading visitor pass…" />;
  if (error || !v) return <Msg text={error instanceof Error ? error.message : "This pass isn't valid. It may not be approved yet."} />;
  const checkIn = async () => {
    setCheckingIn(true);
    try {
      const location = await getDeviceLocation();
      const result = await requestVisitorCheckInOtp(id, token, location);
      setOtpDestination(result.destination);
      setCheckInOtp("");
      toast.success(`Verification code sent to ${result.destination}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request check-in verification.");
    } finally {
      setCheckingIn(false);
    }
  };
  const verifyCheckIn = async () => {
    if (!/^\d{6}$/.test(checkInOtp)) {
      toast.error("Enter the six-digit code sent to your email.");
      return;
    }
    setVerifyingOtp(true);
    try {
      const location = await getDeviceLocation();
      const updated = await verifyVisitorCheckInOtp(id, token, checkInOtp, location);
      queryClient.setQueryData(["visitor-pass", id, token], updated);
      setOtpDestination(null);
      setCheckInOtp("");
      toast.success("Email verified and check-in completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify the code and check in.");
    } finally {
      setVerifyingOtp(false);
    }
  };
  const checkOut = async () => {
    setCheckingOut(true);
    try {
      const updated = await checkOutVisitorWithEmailPass(id, token);
      queryClient.setQueryData(["visitor-pass", id, token], updated);
      toast.success("You are checked out. Thank you for visiting.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check out with this visitor pass.");
    } finally {
      setCheckingOut(false);
    }
  };
  return (
    <main className="min-h-screen bg-muted/40 px-4 py-6">
      <div className="visitor-pass-print visitor-pass-print-area print-area mx-auto max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
        <div className="badge-gradient px-6 py-5 text-primary-foreground">
          <p className="text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70">{APP_NAME} · Visitor pass</p>
          <p className="mt-1 font-display text-[24px] font-extrabold leading-tight">{v.visitor_name}</p>
          <p className="text-[14px] text-primary-foreground/80">{v.company}</p>
        </div>
        <div className="flex flex-col items-center gap-3 p-6">
          {photo ? (
            <img
              src={photo}
              alt={`${v.visitor_name} visitor photo`}
              className="size-20 rounded-xl object-cover"
            />
          ) : null}
          <QrImage value={qrValue} size={240} />
          <p className="font-mono text-[26px] font-semibold tracking-[0.2em]">{v.visitor_code}</p>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-[12px] font-semibold text-primary">
            {v.status === "CHECKED_IN" ? "Checked in" : v.status === "CHECKED_OUT" ? "Checked out" : v.status === "CARD_ISSUED" ? "Card Issued" : "Approved"}
          </span>
          <p className="text-[12px] text-muted-foreground">Request {v.request_no}{v.location ? ` · ${v.location}` : ""}</p>
          <dl className="mt-2 grid w-full grid-cols-2 gap-3 text-[14px]">
            <div><dt className="text-[11px] text-muted-foreground">Date</dt><dd className="font-medium">{v.visit_date}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Time</dt><dd className="font-medium">{v.expected_arrival}–{v.expected_departure}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Host</dt><dd className="font-medium">{v.host_name}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Purpose</dt><dd className="font-medium">{v.purpose}</dd></div>
          </dl>
          {["APPROVED", "CARD_ISSUED"].includes(v.status) ? (
            <div className="w-full space-y-3">
              <p className="text-center text-[12px] text-muted-foreground">
                Location is required. Be within your branch’s configured check-in area to receive and verify an email code.
              </p>
              {otpDestination ? (
                <>
                  <p className="text-[12px] text-muted-foreground">
                    Verification code sent to <strong>{otpDestination}</strong>. The code expires in 10 minutes.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="check-in-otp">Email verification code</Label>
                    <Input
                      id="check-in-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={checkInOtp}
                      onChange={(event) => setCheckInOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      disabled={verifyingOtp}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={verifyingOtp || checkInOtp.length !== 6}
                    onClick={() => void verifyCheckIn()}
                  >
                    {verifyingOtp ? "Verifying…" : "Verify code and check in"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={checkingIn || verifyingOtp}
                    onClick={() => void checkIn()}
                  >
                    {checkingIn ? "Sending…" : "Resend code"}
                  </Button>
                </>
              ) : (
                <Button type="button" className="w-full" disabled={checkingIn} onClick={() => void checkIn()}>
                  {checkingIn ? "Checking location and sending code…" : "Check in now"}
                </Button>
              )}
            </div>
          ) : v.status === "CHECKED_IN" ? (
            <div className="w-full space-y-2">
              <p className="text-center text-[12px] text-muted-foreground">
                Return the printed guest card to Security manually, then check out here.
              </p>
              <Button type="button" className="w-full" disabled={checkingOut} onClick={() => void checkOut()}>
                {checkingOut ? "Checking out…" : "Check out"}
              </Button>
            </div>
          ) : (
            <p className="w-full rounded-xl bg-emerald-50 px-4 py-3 text-center text-[13px] font-semibold text-emerald-800">
              {v.status === "CHECKED_OUT" ? "Check-out complete. Thank you for visiting." : "Check-in complete. This printable QR pass is your guest card."}
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              void printVisitorPass().catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Unable to print visitor pass."),
              )
            }
            className="w-full rounded-xl border border-border px-4 py-3 text-[15px] font-semibold print:hidden"
          >
            Print QR confirmation
          </button>
          <button type="button" onClick={() => void downloadPass({ ...v, qr_value: qrValue, requested_by_name: v.host_name, photo }).catch((error: unknown) => alert(error instanceof Error ? `Download failed: ${error.message}` : "Download failed."))} className="mt-2 w-full rounded-xl bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground print:hidden">Download pass to phone</button>
          <p className="mt-2 text-center text-[12px] text-muted-foreground print:hidden">This printable QR pass is your guest card. Return the printed pass to Security manually before checking out.</p>
        </div>
      </div>
    </main>
  );
}
