import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Eye, MapPin, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaged } from "@/components/common/TableCard";
import { MasterViewDialog } from "@/components/masters/MasterViewDialog";
import { MasterDeleteButton } from "@/components/masters/MasterDeleteButton";
import { MasterStatusSwitch } from "@/components/masters/MasterStatusSwitch";
import {
  Dialog,
  DialogContent,
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
import {
  catalogService,
  type HdBuilding,
  type HdBuildingArea,
  type HdBuildingFloor,
} from "@/services/helpdesk-api";
import { listBranches } from "@/services/branches";
import type { Branch } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/hd-locations")({
  head: () => ({ meta: [{ title: "Building Master — FCM Helpdesk" }] }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <LocationsPage />
    </AppPage>
  ),
});

export function LocationsPage({
  embedded = false,
  createBuildingOpen = false,
  onCreateBuildingOpenChange,
}: {
  embedded?: boolean;
  createBuildingOpen?: boolean;
  onCreateBuildingOpenChange?: (open: boolean) => void;
} = {}) {
  const [buildings, setBuildings] = useState<HdBuilding[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buildingEditor, setBuildingEditor] = useState<HdBuilding | "new" | null>(null);
  const [viewing, setViewing] = useState<HdBuilding | null>(null);
  const [loading, setLoading] = useState(true);
  const pagedBuildings = usePaged(buildings);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextBuildings, nextBranches] = await Promise.all([
        catalogService.listBuildings(),
        listBranches(false),
      ]);
      setBuildings(nextBuildings);
      setBranches(nextBranches);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load Helpdesk locations.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const editorValue = buildingEditor ?? (createBuildingOpen ? "new" : null);
  const setBuildingActive = async (building: HdBuilding, active: boolean) => {
    await catalogService.saveBuilding({ ...building, active });
    await reload();
    toast.success(`Building ${active ? "activated" : "deactivated"}.`);
  };
  const removeBuilding = async (building: HdBuilding) => {
    await catalogService.deleteBuilding(building.id);
    await reload();
    toast.success("Building deleted.");
  };

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          eyebrow="FCM Helpdesk"
          title="Building Master"
          subtitle="Configure Helpdesk buildings and their geofence."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/hd-qr">
                  <QrCode className="size-4" />
                  Building QR
                </Link>
              </Button>
            </div>
          }
        />
      ) : null}
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-[15px] font-bold tracking-tight">Buildings</h2>
            <p className="text-[12px] text-muted-foreground">
              {buildings.length} building{buildings.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button
            className="bg-primary text-primary-foreground [background-image:none] hover:bg-primary/90"
            onClick={() => setBuildingEditor("new")}
          >
            <Plus className="size-4" />
            Add building
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Building</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Geofence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedBuildings.rows.map((building) => {
                const branch = branches.find((item) => item.id === building.branch_id);
                return (
                  <TableRow key={building.id}>
                    <TableCell className="font-semibold">{building.name}</TableCell>
                    <TableCell>{branch?.name ?? "Branch unavailable"}</TableCell>
                    <TableCell>{branch?.city || "—"}</TableCell>
                    <TableCell>
                      {building.latitude != null && building.longitude != null
                        ? `${building.radius_m} m`
                        : "Not configured"}
                    </TableCell>
                    <TableCell>
                      <MasterStatusSwitch
                        active={building.active}
                        name={building.name}
                        onChange={(active) => setBuildingActive(building, active)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`View ${building.name}`}
                          title="View building"
                          onClick={() => setViewing(building)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${building.name}`}
                          title="Edit building"
                          onClick={() => setBuildingEditor(building)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <MasterDeleteButton
                          name={`building "${building.name}"`}
                          description="Buildings referenced by tickets or feedback, or with configured floors or areas, cannot be deleted. Deactivate the building to preserve its history."
                          onDelete={() => removeBuilding(building)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!buildings.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {loading
                      ? "Loading location masters…"
                      : "Add a building to configure its geofence."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        {pagedBuildings.footer}
      </section>
      <MasterViewDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? "Building details"}
        description="Building details"
        fields={[
          {
            label: "Branch",
            value: branches.find((branch) => branch.id === viewing?.branch_id)?.name,
          },
          {
            label: "City",
            value: branches.find((branch) => branch.id === viewing?.branch_id)?.city,
          },
          { label: "Latitude", value: viewing?.latitude == null ? "—" : String(viewing.latitude) },
          {
            label: "Longitude",
            value: viewing?.longitude == null ? "—" : String(viewing.longitude),
          },
          { label: "Geofence radius", value: viewing ? `${viewing.radius_m} m` : "—" },
          { label: "Status", value: viewing?.active ? "Active" : "Inactive" },
        ]}
      />
      <BuildingDialog
        open={editorValue !== null}
        value={editorValue}
        branches={branches}
        onClose={() => {
          setBuildingEditor(null);
          onCreateBuildingOpenChange?.(false);
        }}
        onSaved={() => {
          setBuildingEditor(null);
          onCreateBuildingOpenChange?.(false);
          void reload();
        }}
      />
    </div>
  );
}

function BuildingDialog({
  open,
  value,
  branches,
  onClose,
  onSaved,
}: {
  open: boolean;
  value: HdBuilding | "new" | null;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("100");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  useEffect(() => {
    const building = typeof value === "object" ? value : null;
    setBranchId(building?.branch_id ?? branches[0]?.id ?? "");
    setName(building?.name ?? "");
    setLatitude(building?.latitude == null ? "" : String(building.latitude));
    setLongitude(building?.longitude == null ? "" : String(building.longitude));
    setRadius(String(building?.radius_m ?? 100));
    setActive(building?.active ?? true);
  }, [value, branches]);

  const save = async () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const radiusMeters = Number(radius);
    if (!branchId || !name.trim()) {
      toast.error("Choose a branch and enter a building name.");
      return;
    }
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      toast.error("Enter valid latitude and longitude coordinates for the building geofence.");
      return;
    }
    if (!Number.isInteger(radiusMeters) || radiusMeters < 25 || radiusMeters > 5000) {
      toast.error("Geofence radius must be between 25 and 5000 metres.");
      return;
    }
    setSaving(true);
    try {
      const current = typeof value === "object" ? value : null;
      await catalogService.saveBuilding({
        ...(current ? { id: current.id } : {}),
        branch_id: branchId,
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        radius_m: radiusMeters,
        active,
      });
      toast.success("Helpdesk building saved.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the building.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    const current = typeof value === "object" ? value : null;
    if (!current) return;
    setDeleting(true);
    try {
      await catalogService.deleteBuilding(current.id);
      toast.success("Helpdesk building deleted.");
      setConfirmDelete(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete the building.");
    } finally {
      setDeleting(false);
    }
  };
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("This browser does not support device location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(7));
        setLongitude(coords.longitude.toFixed(7));
      },
      () => toast.error("Unable to get device location. Enter the building coordinates manually."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{value === "new" ? "Add building" : "Edit building"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Building name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Bengaluru Office"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Latitude</Label>
            <Input
              type="number"
              step="any"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Longitude</Label>
            <Input
              type="number"
              step="any"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="sm:col-span-2"
            onClick={useCurrentLocation}
          >
            <MapPin className="size-4" />
            Use current location
          </Button>
          <div className="space-y-1.5">
            <Label>Geofence radius (metres)</Label>
            <Input
              type="number"
              min="25"
              max="5000"
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
          <p className="text-[12px] text-muted-foreground sm:col-span-2">
            Use verified building coordinates. An active building must have a configured geofence.
          </p>
        </div>
        <DialogFooter>
          {value !== "new" ? (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={saving || deleting}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete building
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || deleting} onClick={() => void save()}>
            {saving ? "Saving…" : "Save building"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name || "this building"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes its configured floors and areas. Buildings referenced by tickets or
              feedback cannot be deleted; deactivate those buildings to preserve their history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? "Deleting…" : "Delete building"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function FloorDialog({
  open,
  building,
  floors,
  onClose,
  onSaved,
}: {
  open: boolean;
  building: HdBuilding | null;
  floors: HdBuildingFloor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setName("");
  }, [open]);
  const save = async () => {
    if (!building) {
      toast.error("Select a building first.");
      return;
    }
    const normalized = name.trim();
    if (!normalized) {
      toast.error("Enter a floor name.");
      return;
    }
    if (floors.some((floor) => floor.name.trim().toLowerCase() === normalized.toLowerCase())) {
      toast.error("That floor already exists for this building.");
      return;
    }
    setSaving(true);
    try {
      await catalogService.saveBuildingFloor({
        building_id: building.id,
        name: normalized,
        active: true,
      });
      toast.success("Floor saved.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the floor.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add floor</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{building?.name}</p>
        <div className="space-y-1.5">
          <Label>Floor name</Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Floor 1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save floor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AreaDialog({
  open,
  value,
  building,
  floors,
  onClose,
  onSaved,
}: {
  open: boolean;
  value: HdBuildingArea | "new" | null;
  building: HdBuilding | null;
  floors: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const area = typeof value === "object" ? value : null;
    setFloor(area?.floor ?? "");
    setName(area?.name ?? "");
    setActive(area?.active ?? true);
  }, [value]);
  const save = async () => {
    if (!building) {
      toast.error("Select a building first.");
      return;
    }
    if (
      !floor.trim() ||
      !floors.some((configuredFloor) => configuredFloor === floor) ||
      !name.trim()
    ) {
      toast.error("Choose a configured floor and enter an area name.");
      return;
    }
    setSaving(true);
    try {
      const current = typeof value === "object" ? value : null;
      await catalogService.saveBuildingArea({
        ...(current ? { id: current.id } : {}),
        building_id: building.id,
        floor: floor.trim(),
        name: name.trim(),
        active,
      });
      toast.success("Building area saved.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the building area.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value === "new" ? "Add floor and area" : "Edit floor and area"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{building?.name}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Floor</Label>
            <Select value={floor} onValueChange={setFloor}>
              <SelectTrigger>
                <SelectValue placeholder="Select floor" />
              </SelectTrigger>
              <SelectContent>
                {floors.map((configuredFloor) => (
                  <SelectItem key={configuredFloor} value={configuredFloor}>
                    {configuredFloor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Area</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Pantry"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
