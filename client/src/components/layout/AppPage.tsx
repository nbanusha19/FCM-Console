import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useApp } from "@/context/app-context";
import { AppShell } from "@/components/layout/AppShell";
import { HOME_BY_ROLE } from "@/constants/nav";
import type { RoleKey } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export function AppPage({ roles, children }: { roles?: RoleKey[]; children: ReactNode }) {
  const { user, hydrated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    if (roles && !roles.includes(user.role)) {
      navigate({ to: HOME_BY_ROLE[user.role] });
    }
  }, [hydrated, user, roles, navigate]);

  if (!hydrated || !user || (roles && !roles.includes(user.role))) {
    return (
      <div className="w-full space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
