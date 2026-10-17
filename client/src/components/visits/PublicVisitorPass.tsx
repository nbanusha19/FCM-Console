import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { QrImage } from "@/components/common/QrImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/constants/brand";
import {
  checkInVisitorWithEmailPass,
  checkOutVisitorWithEmailPass,
  getVisitorPass,
  getVisitorPassByQrToken,
  requestVisitorCheckInOtp,
  verifyVisitorCheckInOtp,
} from "@/lib/visitor-pass.functions";
import { getVisitorCardPhoto } from "@/services/visitor-card-local";
import { toast } from "sonner";

function getDeviceLocation(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("This browser does not support device location."));
  }
  if (!window.isSecureContext) {
    return Promise.reject(
      new Error(
        "Location access requires HTTPS. Open the visitor pass using the secure site address.",
      ),
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

function PassMessage({ text }: { text: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">
      {text}
    </main>
  );
}

export function PublicVisitorPass({
  passId,
  routeToken,
}: {
  passId?: string;
  routeToken?: string;
}) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(routeToken ?? "");
  const [origin, setOrigin] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const {
    data: visit,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["visitor-pass", passId ?? routeToken ?? "legacy", token],
    queryFn: () =>
      passId ? getVisitorPass({ data: { id: passId, token } }) : getVisitorPassByQrToken(token),
    enabled: Boolean(token && (passId || routeToken)),
    retry: false,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!routeToken) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      setToken(params.get("token") ?? "");
    }
    setOrigin(window.location.origin);
    if (passId) setPhoto(getVisitorCardPhoto(passId));
  }, [passId, routeToken]);

  useEffect(() => {
    if (
      token &&
      visit &&
      ["APPROVED", "CARD_ISSUED"].includes(visit.status) &&
      !visit.check_in_verified &&
      !window.location.pathname.endsWith("/verify")
    ) {
      window.location.replace(`/gate/${encodeURIComponent(token)}/verify`);
    }
  }, [token, visit]);

  if (!token)
    return (
      <PassMessage text="This pass link is incomplete. Open the secure link from your invitation email." />
    );
  if (!origin || isLoading) return <PassMessage text="Loading visitor pass…" />;
  if (error || !visit) {
    return (
      <PassMessage
        text={
          error instanceof Error
            ? error.message
            : "This pass isn't valid. It may not be approved yet."
        }
      />
    );
  }
  if (["APPROVED", "CARD_ISSUED"].includes(visit.status) && !visit.check_in_verified) {
    return <PassMessage text="Opening email verification…" />;
  }

  const queryKey = ["visitor-pass", passId ?? routeToken ?? "legacy", token];
  const checkIn = async () => {
    setCheckingIn(true);
    try {
      const location = await getDeviceLocation();
      const updated = await checkInVisitorWithEmailPass(visit.id, token, location);
      queryClient.setQueryData(queryKey, updated);
      toast.success("You are checked in.");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to check in with this visitor pass.",
      );
    } finally {
      setCheckingIn(false);
    }
  };
  const checkOut = async () => {
    setCheckingOut(true);
    try {
      const updated = await checkOutVisitorWithEmailPass(visit.id, token);
      queryClient.setQueryData(queryKey, updated);
      toast.success("You are checked out. Thank you for visiting.");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to check out with this visitor pass.",
      );
    } finally {
      setCheckingOut(false);
    }
  };
  const startVerification = () => {
    window.location.assign(`/gate/${encodeURIComponent(token)}/verify`);
  };
  const qrValue = `${origin}/gate/${encodeURIComponent(token)}/verify`;

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-6">
      <div className="visitor-pass-print visitor-pass-print-area print-area mx-auto max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
        <div className="badge-gradient px-6 py-5 text-primary-foreground">
          <p className="text-[11px] uppercase tracking-[0.16em] text-primary-foreground/70">
            {APP_NAME} · Visitor pass
          </p>
          <p className="mt-1 font-display text-[24px] font-extrabold leading-tight">
            {visit.visitor_name}
          </p>
          <p className="text-[14px] text-primary-foreground/80">{visit.company}</p>
        </div>
        <div className="flex flex-col items-center gap-3 p-6">
          {photo ? (
            <img
              src={photo}
              alt={`${visit.visitor_name} visitor photo`}
              className="size-20 rounded-xl object-cover"
            />
          ) : null}
          <QrImage value={qrValue} size={240} />
          <p className="font-mono text-[26px] font-semibold tracking-[0.2em]">
            {visit.visitor_code}
          </p>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-[12px] font-semibold text-primary">
            {visit.status === "CHECKED_IN"
              ? "Checked in"
              : visit.status === "CHECKED_OUT"
                ? "Checked out"
                : visit.status === "CARD_ISSUED"
                  ? "Card Issued"
                  : "Approved"}
          </span>
          <p className="text-[12px] text-muted-foreground">
            Request {visit.request_no}
            {visit.location ? ` · ${visit.location}` : ""}
          </p>
          <dl className="mt-2 grid w-full grid-cols-2 gap-3 text-[14px]">
            <div>
              <dt className="text-[11px] text-muted-foreground">Date</dt>
              <dd className="font-medium">{visit.visit_date}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Time</dt>
              <dd className="font-medium">
                {visit.expected_arrival}–{visit.expected_departure}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Host</dt>
              <dd className="font-medium">{visit.host_name}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Purpose</dt>
              <dd className="font-medium">{visit.purpose}</dd>
            </div>
          </dl>
          {["APPROVED", "CARD_ISSUED"].includes(visit.status) ? (
            <div className="w-full space-y-3">
              {visit.check_in_available ? (
                visit.check_in_verified ? (
                  <>
                    <p className="text-center text-[12px] text-success" role="status">
                      Email verified. Confirm below to complete check-in.
                    </p>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={checkingIn}
                      onClick={() => void checkIn()}
                    >
                      {checkingIn ? "Checking in…" : "Check in"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-center text-[12px] text-muted-foreground">
                      Check-in requires email verification and your location within the branch
                      check-in area.
                    </p>
                    <Button type="button" className="w-full" onClick={startVerification}>
                      Check in now
                    </Button>
                  </>
                )
              ) : (
                <p
                  className="rounded-lg bg-muted px-3 py-2 text-center text-[12px] text-muted-foreground"
                  role="status"
                >
                  {visit.check_in_window_message}
                </p>
              )}
            </div>
          ) : visit.status === "CHECKED_IN" ? (
            <div className="w-full space-y-2">
              <p className="text-center text-[12px] text-muted-foreground">
                Return the printed guest card to Security manually, then check out here.
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={checkingOut}
                onClick={() => void checkOut()}
              >
                {checkingOut ? "Checking out…" : "Check out"}
              </Button>
            </div>
          ) : (
            <p className="w-full rounded-xl bg-emerald-50 px-4 py-3 text-center text-[13px] font-semibold text-emerald-800">
              {visit.status === "CHECKED_OUT"
                ? "Check-out complete. Thank you for visiting."
                : "Check-in complete."}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export function VisitorCheckInVerification({ token }: { token: string }) {
  const {
    data: visit,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["visitor-pass-verification", token],
    queryFn: () => getVisitorPassByQrToken(token),
    enabled: Boolean(token),
    retry: false,
  });
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);

  const requestCode = async () => {
    if (!visit) return;
    setSending(true);
    try {
      const location = await getDeviceLocation();
      const result = await requestVisitorCheckInOtp(visit.id, token, location);
      setDestination(result.destination);
      setCode("");
      toast.success(`Verification code sent to ${result.destination}.`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to request check-in verification.",
      );
    } finally {
      setSending(false);
    }
  };

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!visit || !/^\d{6}$/.test(code)) {
      toast.error("Enter the six-digit code sent to your email.");
      return;
    }
    setVerifying(true);
    try {
      const location = await getDeviceLocation();
      await verifyVisitorCheckInOtp(visit.id, token, code, location);
      setEmailVerified(true);
      setCode("");
      toast.success("Email verified. Confirm check-in to complete your visit entry.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to verify the code.");
    } finally {
      setVerifying(false);
    }
  };

  const checkIn = async () => {
    if (!visit) return;
    setCheckingIn(true);
    try {
      const location = await getDeviceLocation();
      await checkInVisitorWithEmailPass(visit.id, token, location);
      setCheckedIn(true);
      toast.success("Check-in complete.");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to check in with this visitor pass.",
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const checkOut = async () => {
    if (!visit) return;
    setCheckingOut(true);
    try {
      await checkOutVisitorWithEmailPass(visit.id, token);
      setCheckedOut(true);
      toast.success("Check-out complete. Thank you for visiting.");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to check out with this visitor pass.",
      );
    } finally {
      setCheckingOut(false);
    }
  };

  const verified = emailVerified || visit?.check_in_verified;
  const isCheckedOut = checkedOut || visit?.status === "CHECKED_OUT";
  const isCheckedIn = !isCheckedOut && (checkedIn || visit?.status === "CHECKED_IN");

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-4">
      <div className="w-full max-w-[340px] space-y-4">
        <header className="space-y-2 text-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">VMS</p>
            <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
              Visitor Management System
            </p>
          </div>
          <h1 className="font-display text-lg font-bold text-slate-900">
            Welcome{visit?.visitor_name ? `, ${visit.visitor_name}` : ""}
          </h1>
          <p className="text-xs text-slate-500">
            Use check-in when you arrive and check-out when you leave.
          </p>
        </header>

        <section className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
          {visit ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                    Visitor ID
                  </p>
                  <p className="font-mono text-sm font-bold text-slate-900">{visit.visitor_code}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    isCheckedIn
                      ? "bg-sky-100 text-sky-700"
                      : isCheckedOut
                        ? "bg-slate-100 text-slate-600"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {isCheckedIn ? "Checked in" : isCheckedOut ? "Checked out" : "Approved"}
                </span>
              </div>
              <p className="text-center text-[10px] text-slate-500">
                {visit.visit_date} · {visit.expected_arrival} – {visit.expected_departure}
              </p>
            </>
          ) : null}

          {isLoading ? (
            <p className="text-center text-xs text-slate-500">Loading visitor details…</p>
          ) : null}
          {error || !visit ? (
            !isLoading ? (
              <p role="alert" className="text-center text-xs text-danger">
                {error instanceof Error
                  ? error.message
                  : "This verification link is invalid or expired."}
              </p>
            ) : null
          ) : isCheckedOut ? (
            <p className="text-center text-xs text-slate-500">
              This visit has been checked out. Thank you for visiting.
            </p>
          ) : isCheckedIn ? (
            <>
              <Button
                className="h-9 w-full bg-[#2563eb] text-xs text-white hover:bg-[#1d4ed8]"
                disabled={checkingOut}
                onClick={() => void checkOut()}
              >
                <LogOut className="size-3.5" />
                {checkingOut ? "Checking out…" : "Check out"}
              </Button>
              <p className="text-center text-[9px] text-slate-500">
                You are inside. Check out when you leave. You can check in again today if you
                return.
              </p>
            </>
          ) : verified ? (
            <>
              {visit.check_in_available ? (
                <Button
                  className="h-9 w-full bg-[#2563eb] text-xs text-white hover:bg-[#1d4ed8]"
                  disabled={checkingIn}
                  onClick={() => void checkIn()}
                >
                  <LogIn className="size-3.5" />
                  {checkingIn ? "Checking in…" : "Check in"}
                </Button>
              ) : (
                <p role="status" className="text-center text-xs text-slate-500">
                  {visit.check_in_window_message}
                </p>
              )}
              <p className="text-center text-[9px] text-slate-500">
                Check in to enter. Check-out appears after you are inside.
              </p>
            </>
          ) : !visit.check_in_available ? (
            <p role="status" className="text-center text-xs text-slate-500">
              {visit.check_in_window_message}
            </p>
          ) : destination ? (
            <form className="space-y-3" onSubmit={(event) => void verify(event)}>
              <p className="text-center text-[11px] text-slate-600">
                Verification code sent to <strong>{destination}</strong>. The code expires in 10
                minutes.
              </p>
              <div className="space-y-2">
                <Label htmlFor="visitor-check-in-code">Email verification code</Label>
                <Input
                  id="visitor-check-in-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  disabled={verifying}
                />
              </div>
              <Button className="w-full" type="submit" disabled={verifying || code.length !== 6}>
                {verifying ? "Verifying…" : "Verify email"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={sending || verifying}
                onClick={() => void requestCode()}
              >
                {sending ? "Sending…" : "Resend code"}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              className="h-9 w-full bg-[#2563eb] text-xs text-white hover:bg-[#1d4ed8]"
              disabled={sending}
              onClick={() => void requestCode()}
            >
              {sending ? "Checking location and sending code…" : "Send verification code"}
            </Button>
          )}

          {visit ? (
            <Button
              type="button"
              variant="ghost"
              className="mx-auto h-7 px-3 text-[10px] font-medium text-slate-700"
              disabled={isLoading}
              onClick={() => void refetch()}
            >
              <RefreshCw className="size-3" />
              Refresh status
            </Button>
          ) : null}
        </section>
      </div>
    </main>
  );
}
