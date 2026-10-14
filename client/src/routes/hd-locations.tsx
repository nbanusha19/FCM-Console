import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/common/StatusBadge";
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
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
  head: () => ({ meta: [{ title: "Building locations — FCM Helpdesk" }] }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <LocationsPage />
    </AppPage>
  ),
});

export function LocationsPage({
  embedded = false,
  toolbar,
}: {
  embedded?: boolean;
  toolbar?: ReactNode;
} = {}) {
  const [buildings, setBuildings] = useState<HdBuilding[]>([]);
  const [areas, setAreas] = useState<HdBuildingArea[]>([]);
  const [floors, setFloors] = useState<HdBuildingFloor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [buildingEditor, setBuildingEditor] = useState<HdBuilding | "new" | null>(null);
  const [areaEditor, setAreaEditor] = useState<HdBuildingArea | "new" | null>(null);
  const [addingFloor, setAddingFloor] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextBuildings, nextAreas, nextFloors, nextBranches] = await Promise.all([
        catalogService.listBuildings(),
        catalogService.listBuildingAreas(),
        catalogService.listBuildingFloors(),
        listBranches(false),
      ]);
      setBuildings(nextBuildings);
      setAreas(nextAreas);
      setFloors(nextFloors);
      setBranches(nextBranches);
      setSelectedId((current) =>
        nextBuildings.some((building) => building.id === current)
          ? current
          : (nextBuildings[0]?.id ?? ""),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load Helpdesk locations.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = buildings.find((building) => building.id === selectedId);
  const selectedAreas = useMemo(
    () => areas.filter((area) => area.building_id === selectedId),
    [areas, selectedId],
  );
  const selectedBranch = branches.find((branch) => branch.id === selected?.branch_id);
  const selectedFloors = useMemo(() => {
    const configured = floors
      .filter((floor) => floor.building_id === selectedId && floor.active)
      .map((floor) => floor.name);
    const legacy = selectedAreas.map((area) => area.floor);
    return [...new Set([...configured, ...legacy])].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [floors, selectedAreas, selectedId]);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          eyebrow="FCM Helpdesk"
          title="Building locations"
          subtitle="Configure buildings, their geofence, and the floors and areas shown after scanning the building QR."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/hd-qr">
                  <QrCode className="size-4" />
                  Building QR
                </Link>
              </Button>
              <Button onClick={() => setBuildingEditor("new")}>
                <Plus className="size-4" />
                Add building
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {toolbar}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/hd-qr">
                <QrCode className="size-4" />
                Building QR
              </Link>
            </Button>
            <Button onClick={() => setBuildingEditor("new")}>
              <Plus className="size-4" />
              Add building
            </Button>
          </div>
        </div>
      )}
      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label>Building</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={!buildings.length}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading buildings…" : "Select building"} />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>City</Label>
            <Input
              value={selectedBranch?.city ?? ""}
              readOnly
              placeholder="Set the city on the branch master"
            />
          </div>
          {selected ? (
            <Button variant="outline" onClick={() => setBuildingEditor(selected)}>
              <Pencil className="size-4" />
              Edit building
            </Button>
          ) : null}
        </div>
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="font-semibold">{selected.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {branches.find((branch) => branch.id === selected.branch_id)?.name ??
                    "Branch unavailable"}
                  {selectedBranch?.city ? ` · ${selectedBranch.city}` : ""}
                  {" · "}Geofence{" "}
                  {selected.latitude != null && selected.longitude != null
                    ? `${selected.radius_m} m`
                    : "not configured"}
                </p>
              </div>
              <StatusPill
                status={selected.active ? "ACTIVE" : "INACTIVE"}
                label={selected.active ? "Active" : "Inactive"}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Floors and areas</h2>
                <p className="text-[12px] text-muted-foreground">
                  Configure floors first, then add the areas belonging to each floor across this
                  branch office.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAddingFloor(true)}>
                  <Plus className="size-4" />
                  Add floor
                </Button>
                <Button onClick={() => setAreaEditor("new")} disabled={!selectedFloors.length}>
                  <Plus className="size-4" />
                  Add area
                </Button>
              </div>
            </div>
            {selectedFloors.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedFloors.map((floor) => (
                  <span
                    key={floor}
                    className="rounded-full border border-border px-3 py-1 text-[12px] font-medium"
                  >
                    {floor}
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Add a floor before configuring its areas.
              </p>
            )}
            {selectedAreas.length ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {selectedAreas.map((area) => (
                  <div key={area.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">{area.name}</p>
                      <p className="text-[12px] text-muted-foreground">{area.floor}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        status={area.active ? "ACTIVE" : "INACTIVE"}
                        label={area.active ? "Active" : "Inactive"}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${area.name}`}
                        onClick={() => setAreaEditor(area)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No areas configured for this building yet.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading location masters…"
              : "Add a building to configure its geofence and areas."}
          </p>
        )}
      </section>
      <BuildingDialog
        open={buildingEditor !== null}
        value={buildingEditor}
        branches={branches}
        onClose={() => setBuildingEditor(null)}
        onSaved={() => {
          setBuildingEditor(null);
          void reload();
        }}
      />
      <AreaDialog
        open={areaEditor !== null}
        value={areaEditor}
        building={selected ?? null}
        floors={selectedFloors}
        onClose={() => setAreaEditor(null)}
        onSaved={() => {
          setAreaEditor(null);
          void reload();
        }}
      />
      <FloorDialog
        open={addingFloor}
        building={selected ?? null}
        floors={floors.filter((floor) => floor.building_id === selectedId)}
        onClose={() => setAddingFloor(false)}
        onSaved={() => {
          setAddingFloor(false);
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
