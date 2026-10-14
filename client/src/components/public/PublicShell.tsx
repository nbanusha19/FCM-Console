import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/constants/brand";

export function PublicShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="font-display text-[13px] font-bold tracking-[0.18em] text-primary">{APP_NAME}</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{APP_TAGLINE}</p>
          <h1 className="mt-3 font-display text-[24px] font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        <section className="surface-card p-5">{children}</section>
      </div>
    </main>
  );
}
