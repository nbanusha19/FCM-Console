import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, ChevronDown, Grid2X2, LogOut, Menu, Search, UserRound, X } from "lucide-react";
import { useApp, type Theme } from "@/context/app-context";
import { Palette, Check } from "lucide-react";
import { EmergencyBanner } from "@/components/emergency/EmergencyBanner";
import { AppIcon } from "@/components/common/AppIcon";

const THEME_OPTIONS: { id: Theme; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "linear-gradient(135deg,#ffffff,#dbeafe)" },
  { id: "dark", label: "Dark", swatch: "linear-gradient(135deg,#2a2b30,#111214)" },
  { id: "ocean", label: "Ocean", swatch: "linear-gradient(135deg,#b9f3fa,#087e9b)" },
  { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg,#ffe1ad,#db4d61)" },
];
import { useVms } from "@/hooks/use-vms";
import { listVisitRequests } from "@/services/visitor-requests";
import { NAV_BY_ROLE, ROLE_LABEL } from "@/constants/nav";
import { APP_NAME, APP_TAGLINE } from "@/constants/brand";
import { modulesForRole } from "@/constants/modules";
import { initials, relativeTime } from "@/lib/format";
import { branchName } from "@/services/vms";
import { notificationService } from "@/services/helpdesk-api";
import {
  listVmsNotifications,
  markVmsNotificationsRead as markVmsNotificationsReadRequest,
} from "@/services/vms-notifications";
import { listEwpNotifications, markEwpNotificationsRead } from "@/services/work-permits-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusPill } from "@/components/common/StatusBadge";

const PRIMARY_COUNT = 7;
const MODULE_ROUTE_PREFIXES = {
  vms: ["/visitors", "/vms-", "/gate-desk", "/registration-qr", "/masters", "/activity"],
  eworkpermit: ["/ework-permit", "/ework-permit-"],
  helpdesk: ["/helpdesk", "/hd-"],
  emergency: ["/emergency"],
} as const;
function routeMatchesPrefix(route: string, prefix: string) {
  return prefix.endsWith("-")
    ? route.startsWith(prefix)
    : route === prefix || route.startsWith(`${prefix}/`);
}

function moduleForRoute(route: string) {
  return Object.entries(MODULE_ROUTE_PREFIXES).find(([, prefixes]) =>
    prefixes.some((prefix) => routeMatchesPrefix(route, prefix)),
  )?.[0] as keyof typeof MODULE_ROUTE_PREFIXES | undefined;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, theme, setTheme } = useApp();
  const { settings } = useVms();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHomePage = pathname === "/home";
  const isReferencePage =
    pathname === "/vms-dashboard" ||
    pathname === "/visitors" ||
    pathname === "/vms-upcoming" ||
    pathname === "/vms-today" ||
    pathname === "/vms-reports" ||
    pathname === "/masters" ||
    pathname === "/activity";
  const isVmsPage =
    isReferencePage ||
    pathname.startsWith("/vms-") ||
    pathname === "/gate-desk" ||
    pathname === "/registration-qr";
  const activeModule = moduleForRoute(pathname);
  const moduleBrandName = activeModule
    ? {
        vms: "FCM VMS",
        eworkpermit: "FCM E-Work Permit",
        helpdesk: "FCM Helpdesk",
        emergency: "FCM Emergency Evacuation",
      }[activeModule]
    : settings.appName || APP_NAME;
  const moduleBrandTagline = activeModule
    ? {
        vms: "Visitor Management System",
        eworkpermit: "E-Work Permit Portal",
        helpdesk: "Helpdesk Portal",
        emergency: "Emergency Evacuation Portal",
      }[activeModule]
    : APP_TAGLINE;
  const brandInitial = activeModule
    ? {
        vms: "V",
        eworkpermit: "E",
        helpdesk: "H",
        emergency: "E",
      }[activeModule]
    : "F";
  const isHelpdeskModule = activeModule === "helpdesk";
  const showVmsNotifications = activeModule === "vms" || pathname === "/notifications";
  const isVmsStaff = user && ["ADMIN", "BRANCH_MANAGER", "SECURITY"].includes(user.role);
  const canViewVmsVisits = isVmsStaff || user?.role === "EMPLOYEE";
  const visitorRequestsQuery = useQuery({
    queryKey: ["visit-requests"],
    queryFn: listVisitRequests,
    enabled: Boolean(isVmsPage && canViewVmsVisits),
  });
  const helpdeskNotificationsQuery = useQuery({
    queryKey: ["hd-notifications", user?.id],
    queryFn: () => {
      if (!user) throw new Error("You must be signed in to load Helpdesk notifications.");
      return notificationService.list(user.id);
    },
    enabled: Boolean(user && isHelpdeskModule),
    refetchInterval: 30_000,
  });
  const vmsNotificationsQuery = useQuery({
    queryKey: ["vms-notifications", user?.id],
    queryFn: listVmsNotifications,
    enabled: Boolean(user && showVmsNotifications),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const ewpNotificationsQuery = useQuery({
    queryKey: ["ewp-notifications", user?.id],
    queryFn: listEwpNotifications,
    enabled: Boolean(user && activeModule === "eworkpermit"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = user
    ? NAV_BY_ROLE[user.role].map((i) =>
        i.to === "/vms-dashboard" ? { ...i, label: "VMS Dashboard" } : i,
      )
    : [];
  const moduleItems = activeModule
    ? items.filter((item) =>
        MODULE_ROUTE_PREFIXES[activeModule].some((prefix) => routeMatchesPrefix(item.to, prefix)),
      )
    : items.filter((item) => !item.sub);
  const vmsPrimary = [
    { to: "/vms-dashboard", label: "Dashboard" },
    { to: "/visitors", label: "Visitors" },
    ...(user?.role === "SECURITY" ? [{ to: "/registration-qr", label: "Sudden visit" }] : []),
    { to: "/vms-upcoming", label: "Upcoming" },
    { to: "/vms-today", label: "Inside" },
    { to: "/vms-reports", label: "Reports" },
  ];
  const moduleLinks = user
    ? activeModule === "vms" && user.role === "EMPLOYEE"
      ? []
      : modulesForRole(user.role)
          .filter((module) => module.key !== activeModule)
          .map((module) => ({ to: module.to, label: module.name }))
    : [];
  const homeModuleLinks = user
    ? modulesForRole(user.role).map((module) => ({
        to: module.to,
        label:
          module.key === "vms"
            ? "FCM VMS"
            : module.key === "eworkpermit"
              ? "FCM E-Work Permit"
              : module.key === "helpdesk"
                ? "FCM Helpdesk"
                : "FCM Evacuation",
      }))
    : [];
  const primary = isHomePage
    ? homeModuleLinks
    : activeModule === "vms" && isVmsStaff
      ? vmsPrimary.filter((link) => moduleItems.some((item) => item.to === link.to))
      : activeModule === "vms" && user?.role === "EMPLOYEE"
        ? [
            ...moduleItems.map((item) => ({
              to: item.to,
              label: item.to === "/vms-dashboard" ? "Dashboard" : item.label,
            })),
          ]
        : moduleItems.slice(0, PRIMARY_COUNT).map((item) => ({
            to: item.to,
            label: item.to === "/vms-dashboard" ? "Dashboard" : item.label,
          }));
  const vmsMoreItems = [
    ...(user?.role === "ADMIN" ? [{ to: "/masters", label: "Masters" }] : []),
    { to: "/activity", label: "Activity Log" },
    ...(user?.role === "ADMIN" ? [{ to: "/settings", label: "Settings" }] : []),
  ];
  const overflow = isHomePage
    ? []
    : activeModule === "vms" && isVmsStaff
      ? vmsMoreItems
      : [
          ...moduleItems.filter(
            (item) => !primary.some((primaryItem) => primaryItem.to === item.to),
          ),
          ...moduleLinks.filter(
            (item) => !primary.some((primaryItem) => primaryItem.to === item.to),
          ),
        ];
  const showMoreMenu =
    !isHomePage &&
    ((activeModule === "vms" && user?.role !== "EMPLOYEE") || activeModule === undefined);
  const menuItems = [...primary, ...overflow];

  const myNotifications = showVmsNotifications ? (vmsNotificationsQuery.data ?? []) : [];
  const vmsUnread = myNotifications.filter((n) => !n.read).length;
  const helpdeskNotifications = isHelpdeskModule ? (helpdeskNotificationsQuery.data ?? []) : [];
  const helpdeskUnread = helpdeskNotifications.filter((n) => !n.is_read).length;
  const ewpNotifications = activeModule === "eworkpermit" ? (ewpNotificationsQuery.data ?? []) : [];
  const ewpUnread = ewpNotifications.filter((n) => !n.isRead).length;
  const activeModuleUnread = showVmsNotifications
    ? vmsUnread
    : isHelpdeskModule
      ? helpdeskUnread
      : activeModule === "eworkpermit"
        ? ewpUnread
        : 0;
  const headerNotifications = showVmsNotifications
    ? myNotifications
        .slice(0, 8)
        .map((n) => ({
          id: n.id,
          source: "vms" as const,
          title: n.title,
          message: n.body,
          createdAt: n.createdAt,
          isRead: n.read,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : isHelpdeskModule
      ? helpdeskNotifications
          .map((n) => ({
            id: n.id,
            source: "helpdesk" as const,
            title: n.title,
            message: n.message,
            createdAt: n.created_at ?? "",
            isRead: n.is_read,
            ticketId: n.ticket_id,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : activeModule === "eworkpermit"
        ? ewpNotifications
            .map((n) => ({
              id: n.id,
              source: "ewp" as const,
              title: n.title,
              message: n.message,
              createdAt: n.createdAt ?? "",
              isRead: n.isRead,
              permitId: n.permitId,
              permitNo: n.permitNo,
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [];
  const helpdeskNotificationsLoaded =
    !isHelpdeskModule ||
    (!helpdeskNotificationsQuery.isLoading && !helpdeskNotificationsQuery.isError);
  const vmsNotificationsLoaded =
    !showVmsNotifications || (!vmsNotificationsQuery.isLoading && !vmsNotificationsQuery.isError);
  const ewpNotificationsLoaded =
    activeModule !== "eworkpermit" ||
    (!ewpNotificationsQuery.isLoading && !ewpNotificationsQuery.isError);
  const notificationFeedsLoaded =
    helpdeskNotificationsLoaded && vmsNotificationsLoaded && ewpNotificationsLoaded;

  const openHelpdeskNotification = async (notification: (typeof helpdeskNotifications)[number]) => {
    try {
      await notificationService.markRead(notification.id);
      await queryClient.invalidateQueries({ queryKey: ["hd-notifications", user?.id] });
      if (notification.ticket_id) {
        navigate({ to: "/hd-ticket/$id", params: { id: notification.ticket_id } });
      } else {
        navigate({ to: "/helpdesk" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open the notification.");
    }
  };

  const markVmsNotificationsRead = async () => {
    if (!vmsUnread) return;
    try {
      await markVmsNotificationsReadRequest();
      await queryClient.invalidateQueries({ queryKey: ["vms-notifications", user?.id] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to mark VMS notifications as read.",
      );
    }
  };

  const markEwpNotificationsReadOnClose = async () => {
    if (!ewpUnread) return;
    try {
      await markEwpNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: ["ewp-notifications", user?.id] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to mark E-Work Permit notifications as read.",
      );
    }
  };

  const openEwpNotification = async (id: string) => {
    try {
      await markEwpNotificationsRead([id]);
      await queryClient.invalidateQueries({ queryKey: ["ewp-notifications", user?.id] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update the E-Work Permit notification.",
      );
    }
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const visibleRequests = (visitorRequestsQuery.data ?? []).filter(
      (visit) =>
        user?.role === "ADMIN" ||
        user?.role === "EMPLOYEE" ||
        ((user?.role === "BRANCH_MANAGER" || user?.role === "SECURITY") &&
          visit.location === branchName(user.branchId)),
    );
    return visibleRequests
      .filter((visit) =>
        [
          visit.visitor_name,
          visit.visitor_code,
          visit.request_no,
          visit.company,
          visit.source,
          visit.host_name,
          visit.email,
          visit.phone,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 6);
  }, [query, visitorRequestsQuery.data, user]);

  const isActive = (to: string) => pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));

  return (
    <div
      className={
        isHomePage
          ? "flex h-svh flex-col overflow-hidden bg-background text-foreground"
          : "min-h-screen bg-background text-foreground"
      }
    >
      <header className="sticky top-0 z-40 shrink-0">
        <div className="w-full px-4 pt-4 sm:px-6 lg:px-8">
          <div className="floating-bar flex items-center gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2.5 pr-2">
              <AppIcon initial={brandInitial} />
              <span className="leading-tight">
                <span className="block font-display text-[13px] font-extrabold tracking-tight">
                  {moduleBrandName}
                </span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {isVmsPage ? "Visitor Management System" : moduleBrandTagline}
                </span>
              </span>
            </div>

            <nav className="hidden items-center gap-1 lg:flex">
              {primary.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive(item.to)
                      ? "bg-primary-soft font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {overflow.length && showMoreMenu ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
                    More <ChevronDown className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {overflow.map((item) => (
                      <DropdownMenuItem key={item.to} onClick={() => navigate({ to: item.to })}>
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </nav>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {isVmsPage ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex size-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background text-[13px] text-muted-foreground transition-colors hover:text-foreground ${isVmsPage ? "xl:w-auto xl:px-3" : "2xl:w-auto 2xl:px-3"}`}
                    >
                      <Search className="size-4" />
                      <span className={isVmsPage ? "hidden xl:inline" : "hidden 2xl:inline"}>
                        Search visitors, IDs, companies...
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3">
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, Visitor ID, company"
                    />
                    <div className="mt-2 max-h-72 space-y-1 overflow-auto">
                      {query.trim().length < 2 ? (
                        <p className="px-1 py-2 text-[12px] text-muted-foreground">
                          Type at least 2 characters.
                        </p>
                      ) : visitorRequestsQuery.isLoading ? (
                        <p className="px-1 py-2 text-[12px] text-muted-foreground">
                          Searching visitors…
                        </p>
                      ) : visitorRequestsQuery.error ? (
                        <p className="px-1 py-2 text-[12px] text-danger">
                          Unable to search visitors: {visitorRequestsQuery.error.message}
                        </p>
                      ) : results.length === 0 ? (
                        <p className="px-1 py-2 text-[12px] text-muted-foreground">
                          No matching visitors.
                        </p>
                      ) : (
                        results.map((v) => (
                          <Link
                            key={v.id}
                            to="/vms-visit/$id"
                            params={{ id: v.id }}
                            className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"
                          >
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-[11px] font-bold text-primary">
                              {initials(v.visitor_name)}
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block truncate text-[13px] font-semibold">
                                {v.visitor_name}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                {v.visitor_code || v.request_no}
                              </span>
                            </span>
                            <StatusPill status={v.status} />
                          </Link>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}

              {activeModule ? (
                <Link
                  to="/home"
                  aria-label="Go to the apps home page"
                  title="Apps"
                  className="flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Grid2X2 className="size-4" />
                  <span className="hidden sm:inline">Apps</span>
                </Link>
              ) : null}

              {!isHomePage ? (
                <Popover
                  onOpenChange={(open) => {
                    if (!open && showVmsNotifications) void markVmsNotificationsRead();
                    if (!open && activeModule === "eworkpermit") {
                      void markEwpNotificationsReadOnClose();
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground">
                      <Bell className="size-4" />
                      {activeModuleUnread ? (
                        <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-card">
                          {activeModuleUnread}
                        </span>
                      ) : null}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-96 p-0">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <p className="font-display text-[14px] font-bold">Notifications</p>
                      {showVmsNotifications ? (
                        <Link
                          to="/notifications"
                          className="text-[12px] font-semibold text-primary hover:underline"
                        >
                          View all
                        </Link>
                      ) : null}
                    </div>
                    <div className="max-h-96 divide-y divide-border overflow-auto">
                      {headerNotifications.map((n) => (
                        <div key={`${n.source}-${n.id}`} className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <span
                              className={cn(
                                "mt-1.5 size-2 shrink-0 rounded-full",
                                n.isRead ? "bg-border" : "bg-primary",
                              )}
                            />
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold">{n.title}</p>
                              <p className="text-[12px] text-muted-foreground">{n.message}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {n.createdAt ? relativeTime(n.createdAt) : "—"}
                              </p>
                            </div>
                          </div>
                          {n.source === "helpdesk" ? (
                            <button
                              type="button"
                              className="mt-2 text-[11px] font-semibold text-primary hover:underline"
                              onClick={() => {
                                const notification = helpdeskNotifications.find(
                                  (item) => item.id === n.id,
                                );
                                if (notification) void openHelpdeskNotification(notification);
                              }}
                            >
                              Open ticket
                            </button>
                          ) : null}
                          {n.source === "ewp" ? (
                            <Link
                              to="/ework-permit/$id"
                              params={{ id: n.permitId }}
                              className="mt-2 inline-block text-[11px] font-semibold text-primary hover:underline"
                              onClick={() => void openEwpNotification(n.id)}
                            >
                              Open permit {n.permitNo}
                            </Link>
                          ) : null}
                        </div>
                      ))}
                      {isHelpdeskModule &&
                      helpdeskNotificationsQuery.isLoading &&
                      myNotifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                          Loading notifications…
                        </p>
                      ) : null}
                      {isHelpdeskModule && helpdeskNotificationsQuery.isError ? (
                        <p className="px-4 py-3 text-center text-[12px] text-destructive">
                          Helpdesk notifications could not be loaded.
                        </p>
                      ) : null}
                      {showVmsNotifications && vmsNotificationsQuery.isLoading ? (
                        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                          Loading VMS notifications…
                        </p>
                      ) : null}
                      {showVmsNotifications && vmsNotificationsQuery.isError ? (
                        <p className="px-4 py-3 text-center text-[12px] text-destructive">
                          VMS notifications could not be loaded.
                        </p>
                      ) : null}
                      {activeModule === "eworkpermit" && ewpNotificationsQuery.isLoading ? (
                        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                          Loading E-Work Permit notifications…
                        </p>
                      ) : null}
                      {activeModule === "eworkpermit" && ewpNotificationsQuery.isError ? (
                        <p className="px-4 py-3 text-center text-[12px] text-destructive">
                          E-Work Permit notifications could not be loaded.
                        </p>
                      ) : null}
                      {notificationFeedsLoaded && headerNotifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                          Nothing new right now.
                        </p>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Change theme"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Palette className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {THEME_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.id}
                      onClick={() => setTheme(opt.id)}
                      className="gap-2"
                    >
                      <span
                        className="size-4 rounded-full border border-border"
                        style={{ background: opt.swatch }}
                      />
                      <span className="flex-1">{opt.label}</span>
                      {theme === opt.id ? <Check className="size-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-2.5 text-left">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
                    {user ? initials(user.name) : "?"}
                  </span>
                  <span className="hidden whitespace-nowrap leading-tight sm:block">
                    <span className="block text-[12px] font-semibold">{user?.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {user ? ROLE_LABEL[user.role] : ""}
                    </span>
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <span className="block text-[13px] font-semibold">{user?.name}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {user?.email}
                    </span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {branchName(user?.branchId)}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {activeModule !== "eworkpermit" ? (
                    <DropdownMenuItem onClick={() => navigate({ to: "/notifications" })}>
                      <Bell className="size-4" /> Notifications
                    </DropdownMenuItem>
                  ) : null}
                  {user?.role === "ADMIN" ? (
                    <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                      <UserRound className="size-4" /> Settings
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      logout();
                      navigate({ to: "/" });
                    }}
                  >
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label="Menu"
              >
                {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </div>
          </div>

          {mobileOpen ? (
            <div className="floating-bar mt-2 grid gap-1 p-2 lg:hidden">
              {menuItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-[14px] font-medium",
                    isActive(item.to) ? "bg-primary-soft text-primary" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div
        className={
          isHomePage
            ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-2 sm:px-6 lg:px-8"
            : "w-full px-4 py-7 sm:px-6 lg:px-8"
        }
      >
        <main className={isHomePage ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "min-w-0"}>
          <div className="-mt-4 mb-4 empty:hidden">
            <EmergencyBanner />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
