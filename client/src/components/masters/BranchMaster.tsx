import { useCallback, useEffect, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/app-context";
import { MasterTable } from "@/components/masters/MasterTable";
import { MasterViewDialog } from "@/components/masters/MasterViewDialog";
import { BranchGeofenceMap } from "@/components/masters/BranchGeofenceMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Branch, Status } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { KEYS, saveData } from "@/services/storage";
import {
  createBranch,
  deleteBranch,
  getBranchGeofence,
  listBranches,
  saveBranchGeofence,
  updateBranch,
} from "@/services/branches";

type BranchDraft = {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  status: Status;
  latitude: string;
  longitude: string;
  radiusM: string;
};

const EMPTY_BRANCH: BranchDraft = {
  id: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  status: "ACTIVE",
  latitude: "",
  longitude: "",
  radiusM: "100",
};

export function BranchMaster({
  onChanged,
  helpdeskStyle = false,
}: {
  onChanged?: () => Promise<void>;
  helpdeskStyle?: boolean;
}) {
  const { refresh } = useApp();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editing, setEditing] = useState<BranchDraft | null>(null);
  const [viewing, setViewing] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const reload = useCallback(async () => {
    const nextBranches = await listBranches(true);
    setBranches(nextBranches);
    saveData(KEYS.branches, nextBranches);
    refresh();
  }, [refresh]);

  useEffect(() => {
    void reload().catch((error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Could not load branches.");
    });
  }, [reload]);

  const edit = async (branch: Branch) => {
    setEditing({
      ...EMPTY_BRANCH,
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
      status: branch.status,
    });
    try {
      const geofence = await getBranchGeofence(branch.id);
      setEditing((current) =>
        current?.id === branch.id
          ? {
              ...current,
              latitude: geofence.latitude == null ? "" : String(geofence.latitude),
              longitude: geofence.longitude == null ? "" : String(geofence.longitude),
              radiusM: String(geofence.radiusM),
            }
          : current,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not load branch geofence settings.",
      );
    }
  };

  const save = async () => {
    if (!editing) return;
    const latitude = editing.latitude.trim();
    const longitude = editing.longitude.trim();
    if (Boolean(latitude) !== Boolean(longitude)) {
      toast.error("Enter both geofence latitude and longitude.");
      return;
    }
    if (latitude && longitude) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const radius = Number(editing.radiusM || "100");
      if (
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lng) ||
        lng < -180 ||
        lng > 180 ||
        !Number.isInteger(radius) ||
        radius < 25 ||
        radius > 5000
      ) {
        toast.error("Enter valid coordinates and a geofence radius from 25 to 5000 metres.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        location: editing.address.trim(),
        phone: editing.phone.trim(),
        email: editing.email.trim(),
        status: editing.status,
      };
      const branch = editing.id
        ? await updateBranch(editing.id, payload)
        : await createBranch(payload);
      if (latitude && longitude) {
        await saveBranchGeofence(branch.id, {
          latitude: Number(latitude),
          longitude: Number(longitude),
          radiusM: Number(editing.radiusM || "100"),
        });
      }
      await reload();
      await onChanged?.();
      setEditing(null);
      toast.success("Branch saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save this branch.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (branch: Branch) => {
    try {
      await deleteBranch(branch.id);
      await reload();
      await onChanged?.();
      toast.success("Branch deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete this branch.");
    }
  };

  const setCoordinates = (latitude: number, longitude: number) => {
    setEditing((current) =>
      current
        ? { ...current, latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) }
        : current,
    );
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("This browser does not support device location.");
      return;
    }
    if (!window.isSecureContext) {
      toast.error(
        "Current location requires HTTPS. Open the application using its secure address.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates(coords.latitude, coords.longitude);
        setLocating(false);
        toast.success("Branch coordinates filled from your current location.");
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Allow location access in your browser to use your current location."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your device location is unavailable. Check location services and try again."
              : "Location lookup timed out. Try again.";
        toast.error(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  const setField = <K extends keyof BranchDraft>(key: K, value: BranchDraft[K]) => {
    setEditing((current) => (current ? { ...current, [key]: value } : current));
  };

  const masterTableActions = helpdeskStyle
    ? {
        onView: setViewing,
        onStatusChange: async (branch: Branch, active: boolean) => {
          await updateBranch(branch.id, {
            name: branch.name,
            location: branch.address,
            phone: branch.phone,
            email: branch.email,
            status: active ? "ACTIVE" : "INACTIVE",
          });
          await reload();
          await onChanged?.();
          toast.success(`Branch ${active ? "activated" : "deactivated"}.`);
        },
        statusName: (branch: Branch) => branch.name,
      }
    : {};

  return (
    <>
      <MasterTable<Branch>
        title="Branches"
        description={`${branches.length} locations`}
        rows={branches}
        searchOf={(branch) => `${branch.name} ${branch.address} ${branch.phone} ${branch.email}`}
        columns={[
          { key: "name", label: "Branch", render: (branch) => branch.name },
          { key: "location", label: "Location", render: (branch) => branch.address || "—" },
          { key: "phone", label: "Phone", render: (branch) => branch.phone || "—" },
          { key: "email", label: "Email", render: (branch) => branch.email || "—" },
        ]}
        addLabel="Add branch"
        addButtonClassName={
          helpdeskStyle
            ? "bg-primary text-primary-foreground [background-image:none] hover:bg-primary/90"
            : ""
        }
        onAdd={() => {
          setShowMap(false);
          setEditing({ ...EMPTY_BRANCH });
        }}
        onEdit={(branch) => void edit(branch)}
        onDelete={(branch) => void remove(branch)}
        {...masterTableActions}
      />
      {helpdeskStyle && viewing ? (
        <MasterViewDialog
          open
          onOpenChange={(open) => !open && setViewing(null)}
          title={viewing.name}
          description="Branch details"
          fields={[
            { label: "Name", value: viewing.name },
            { label: "Status", value: viewing.status === "ACTIVE" ? "Active" : "Inactive" },
            { label: "Location", value: viewing.address },
            { label: "Phone", value: viewing.phone },
            { label: "Email", value: viewing.email },
          ]}
        />
      ) : null}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditing(null);
            setShowMap(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {editing ? (
            <form
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle>Branch details</DialogTitle>
                <DialogDescription>Saved to the VMS database.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={editing.name}
                    required
                    onChange={(event) => setField("name", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editing.phone}
                    onChange={(event) => setField("phone", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editing.email}
                    onChange={(event) => setField("email", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editing.status}
                    onValueChange={(value) => setField("status", value as Status)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Location</Label>
                  <Textarea
                    value={editing.address}
                    onChange={(event) => setField("address", event.target.value)}
                    rows={2}
                  />
                </div>
                <div className="sm:col-span-2 rounded-lg border border-border p-3">
                  <p className="text-[12px] font-semibold">Visitor check-in geofence</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Set the branch center coordinates to require visitors to be nearby before
                    requesting or verifying a check-in email code. Use the branch’s verified map
                    coordinates.
                  </p>
                </div>
                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      value={editing.latitude}
                      onChange={(event) => setField("latitude", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={editing.longitude}
                      onChange={(event) => setField("longitude", event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={locating}
                    onClick={useCurrentLocation}
                  >
                    <Crosshair className="size-4" />
                    {locating ? "Getting current location…" : "Use current location"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowMap((visible) => !visible)}
                  >
                    <MapPin className="size-4" />
                    {showMap ? "Hide map" : "Choose on map"}
                  </Button>
                  {showMap ? (
                    <div className="sm:col-span-2 space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Click the map to place or move the branch geofence center.
                      </p>
                      <BranchGeofenceMap
                        latitude={editing.latitude ? Number(editing.latitude) : null}
                        longitude={editing.longitude ? Number(editing.longitude) : null}
                        onSelect={setCoordinates}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label>Allowed radius (metres)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="25"
                    max="5000"
                    value={editing.radiusM}
                    onChange={(event) => setField("radiusM", event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
