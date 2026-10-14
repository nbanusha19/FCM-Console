import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/app-context";
import { useVms } from "@/hooks/use-vms";
import { APP_NAME, APP_TAGLINE } from "@/constants/brand";
import { HOME_BY_ROLE, ROLE_LABEL } from "@/constants/nav";
import { ApiError } from "@/lib/api";
import { AppIcon } from "@/components/common/AppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — Sign in to Visitor Management` },
      {
        name: "description",
        content:
          "Sign in to VMS to raise visitor requests, approve visits, issue visitor cards and track check-in and check-out across branches.",
      },
      { property: "og:title", content: `${APP_NAME} — Sign in to Visitor Management` },
      {
        property: "og:description",
        content:
          "Enterprise visitor management: requests, approvals, visitor IDs, badges and security desk operations.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, hydrated, login } = useApp();
  const { settings } = useVms();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (hydrated && user) navigate({ to: HOME_BY_ROLE[user.role] as "/home" });
  }, [hydrated, user, navigate]);

  const submit = async (mail: string, pass: string) => {
    if (!mail || !pass) {
      setError("Email and password are required.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const result = await login(mail, pass);
      toast.success(`Welcome back, ${result.name}`, {
        description: `Signed in as ${ROLE_LABEL[result.role]}`,
      });
      navigate({ to: HOME_BY_ROLE[result.role] as "/home" });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to sign in. Check that the server is running.";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden badge-gradient p-12 text-primary-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.25), transparent 40%)",
          }}
        />
        <Link
          to="/"
          aria-label="Go to sign-in page"
          className="relative flex w-fit items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-primary-foreground focus-visible:outline-offset-4"
        >
          <AppIcon />
          <span className="leading-tight">
            <span className="block font-display text-[17px] font-extrabold tracking-tight">
              {settings.appName || APP_NAME}
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
              {APP_TAGLINE}
            </span>
          </span>
        </Link>

        <div className="relative max-w-lg">
          <h1 className="font-display text-[42px] font-extrabold leading-[1.05] tracking-tight">
            One console for every facility operation.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-primary-foreground/80">
            Visitor management, e-work permits, helpdesk and emergency evacuation in a single
            workspace, with role-based access across every site.
          </p>
          <ul className="mt-8 space-y-3 text-[13px] text-primary-foreground/85">
            {[
              "Visitor requests, approvals and unique 6-digit Visitor IDs",
              "Security desk check-in, card issue and check-out",
              "Work permits, dashboards, reports and CSV export",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <BadgeCheck className="size-4 shrink-0" /> {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-primary-foreground/60">
          Role-based access for admin, branch, security and employees
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-[15px] font-extrabold text-primary-foreground">
              F
            </span>
            <span className="font-display text-[17px] font-extrabold tracking-tight">
              {settings.appName || APP_NAME}
            </span>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Sign in</p>
          <h2 className="mt-2 font-display text-[28px] font-extrabold tracking-tight">
            Welcome back
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Use your work email and password to continue.
          </p>

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(email.trim(), password);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  disabled={pending}
                />
              </div>
            </div>
            {error ? <p className="text-[12px] font-medium text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Signing in
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

        </div>
      </section>
    </main>
  );
}
