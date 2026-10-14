import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { QrImage } from "@/components/common/QrImage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/app-context";
import { catalogService, qrService } from "@/services/helpdesk-api";
import { isLoopbackUrl } from "@/lib/utils";

export const Route = createFileRoute("/hd-qr")({
  head: () => ({
    meta: [
      { title: "Raise ticket QR — FCM Helpdesk" },
      {
        name: "description",
        content: "Printable QR code to raise a helpdesk ticket from a location.",
      },
      { property: "og:title", content: "Raise ticket QR" },
      { property: "og:description", content: "Printable QR code to raise a helpdesk ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "EMPLOYEE"]}>
      <QrPage />
    </AppPage>
  ),
});

function QrPage() {
  const { user } = useApp();
  const [buildingId, setBuildingId] = useState("");
  const buildingsQuery = useQuery({
    queryKey: ["helpdesk-qr-buildings"],
    queryFn: async () =>
      (await catalogService.listBuildings()).filter(
        (building) => building.active && building.latitude != null && building.longitude != null,
      ),
  });
  const buildings = useMemo(
    () =>
      (buildingsQuery.data ?? []).filter(
        (building) =>
          user?.role === "ADMIN" || (!!user?.branchId && building.branch_id === user.branchId),
      ),
    [buildingsQuery.data, user],
  );
  const isLoading = buildingsQuery.isLoading;
  const error = buildingsQuery.error;
  useEffect(() => {
    if (!buildings.length) return;
    if (!buildings.some((building) => building.id === buildingId)) setBuildingId(buildings[0]!.id);
  }, [buildings, buildingId]);
  const building = buildings.find((item) => item.id === buildingId);
  const url = useMemo(
    () => (buildingId ? qrService.buildingEntryUrl(buildingId) : ""),
    [buildingId],
  );

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title="Building QR code"
        subtitle="Generate a geofenced QR code for feedback and service requests at a building."
      />
      <div className="surface-card space-y-4 p-6">
        <div className="space-y-1.5">
          <Label>Building</Label>
          <Select
            value={buildingId}
            onValueChange={setBuildingId}
            disabled={isLoading || !buildings.length}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a geofenced building" />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {building ? (
          <p className="text-[12px] text-muted-foreground">
            Building QR · {building.radius_m} m geofence · scan to give feedback or raise a ticket.
          </p>
        ) : null}
        {error ? (
          <p className="text-[12px] text-danger">
            Unable to load Helpdesk buildings. Please try again.
          </p>
        ) : null}
        {url ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-6">
            <QrImage value={url} label={building?.name ?? "Building"} size={200} />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-center text-[11px] text-primary underline"
            >
              {url}
            </a>
            {isLoopbackUrl(url) ? (
              <p className="text-[12px] text-warning">
                This QR uses localhost and only opens on this computer. Configure
                VITE_PUBLIC_APP_URL to print a code for other devices.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => toast.success("Helpdesk link copied"))
                    .catch(() =>
                      toast.error(
                        "Unable to copy the link. Check clipboard permissions and try again.",
                      ),
                    );
                }}
              >
                <Copy className="size-4" /> Copy link
              </Button>
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Open link
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
            {isLoading
              ? "Loading geofenced buildings…"
              : user?.role !== "ADMIN" && !user?.branchId
                ? "Your account has no assigned branch. Contact an administrator."
                : "No active geofenced buildings are configured for your branch."}
          </p>
        )}
        <Button className="w-full" disabled={!url} onClick={() => window.print()}>
          <Printer className="size-4" /> Print QR
        </Button>
      </div>
    </div>
  );
}
