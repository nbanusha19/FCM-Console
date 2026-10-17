import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MasterViewDialog } from "@/components/masters/MasterViewDialog";
import { MasterDeleteButton } from "@/components/masters/MasterDeleteButton";
import { MasterStatusSwitch } from "@/components/masters/MasterStatusSwitch";
import { usePaged } from "@/components/common/TableCard";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  catalogService,
  type HdBuilding,
  type HdBuildingArea,
  type HdBuildingFloor,
} from "@/services/helpdesk-api";
import { listBranches } from "@/services/branches";
import type { Branch } from "@/lib/types";

function LocationMasterTable({
  title,
  addLabel,
  onAdd,
  headers,
  footer,
  children,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  headers: string[];
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-[15px] font-bold tracking-tight">{title}</h2>
          <p className="text-[12px] text-muted-foreground">
            Manage records and their active status.
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground [background-image:none] hover:bg-primary/90"
          onClick={onAdd}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>
      {footer}
    </section>
  );
}

export function FloorsPage() {
  const [floors, setFloors] = useState<HdBuildingFloor[]>([]);
  const [editing, setEditing] = useState<HdBuildingFloor | "new" | null>(null);
  const [viewing, setViewing] = useState<HdBuildingFloor | null>(null);
  const [floorNumber, setFloorNumber] = useState("");
  const [floorName, setFloorName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const pagedFloors = usePaged(floors);

  const reload = useCallback(async () => {
    try {
      const nextFloors = await catalogService.listBuildingFloors();
      setFloors(nextFloors);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load floor masters.");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const open = (value: HdBuildingFloor | "new") => {
    setEditing(value);
    setFloorNumber(typeof value === "object" ? value.floor_number || value.name : "");
    setFloorName(typeof value === "object" ? value.floor_name || "" : "");
    setActive(typeof value === "object" ? value.active : true);
  };

  const save = async () => {
    const number = floorNumber.trim();
    const customName = floorName.trim();
    const displayName = customName || number;
    const current = editing && typeof editing === "object" ? editing : null;
    if (!number) {
      toast.error("Enter a floor number.");
      return;
    }
    if (
      floors.some(
        (floor) =>
          floor.id !== (current?.id ?? "") &&
          ((floor.floor_number?.trim().toLowerCase() || floor.name.trim().toLowerCase()) ===
            number.toLowerCase() ||
            floor.name.trim().toLowerCase() === displayName.toLowerCase()),
      )
    ) {
      toast.error("That floor number already exists.");
      return;
    }
    setSaving(true);
    try {
      await catalogService.saveBuildingFloor({
        ...(current ? { id: current.id } : {}),
        building_id: null,
        floor_number: number,
        floor_name: customName,
        name: displayName,
        active,
      });
      toast.success("Floor saved.");
      setEditing(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the floor.");
    } finally {
      setSaving(false);
    }
  };
  const setFloorActive = async (floor: HdBuildingFloor, nextActive: boolean) => {
    await catalogService.saveBuildingFloor({ ...floor, active: nextActive });
    await reload();
    toast.success(`Floor ${nextActive ? "activated" : "deactivated"}.`);
  };
  const removeFloor = async (floor: HdBuildingFloor) => {
    await catalogService.deleteBuildingFloor(floor.id);
    await reload();
    toast.success("Floor deleted.");
  };

  return (
    <>
      <LocationMasterTable
        title="Floor Master"
        addLabel="Add floor"
        onAdd={() => open("new")}
        headers={["Floor number", "Floor name", "Displayed floor"]}
        footer={pagedFloors.footer}
      >
        {pagedFloors.rows.map((floor) => {
          return (
            <TableRow key={floor.id}>
              <TableCell>{floor.floor_number || floor.name}</TableCell>
              <TableCell>{floor.floor_name || "—"}</TableCell>
              <TableCell>{floor.name}</TableCell>
              <TableCell>
                <MasterStatusSwitch
                  active={floor.active}
                  name={floor.name}
                  onChange={(nextActive) => setFloorActive(floor, nextActive)}
                />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`View ${floor.name}`}
                  title="View floor"
                  onClick={() => setViewing(floor)}
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${floor.name}`}
                  onClick={() => open(floor)}
                >
                  <Pencil className="size-4" />
                </Button>
                <MasterDeleteButton
                  name={`floor "${floor.name}"`}
                  description="Floors referenced by areas, tickets, or feedback cannot be deleted. Deactivate the floor to preserve its history."
                  onDelete={() => removeFloor(floor)}
                />
              </TableCell>
            </TableRow>
          );
        })}
        {!floors.length ? (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
              No floors configured.
            </TableCell>
          </TableRow>
        ) : null}
      </LocationMasterTable>
      <MasterViewDialog
        open={viewing !== null}
        onOpenChange={(openState) => !openState && setViewing(null)}
        title={viewing?.floor_name || viewing?.floor_number || viewing?.name || "Floor details"}
        description="Floor details"
        fields={[
          { label: "Floor number", value: viewing?.floor_number || viewing?.name },
          { label: "Floor name", value: viewing?.floor_name },
          { label: "Displayed floor", value: viewing?.name },
          { label: "Status", value: viewing?.active ? "Active" : "Inactive" },
        ]}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(openState) => !openState && !saving && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add floor" : "Edit floor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Floor number</Label>
              <Input
                value={floorNumber}
                onChange={(event) => setFloorNumber(event.target.value)}
                placeholder="e.g. 1 or Ground"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Floor name (optional)</Label>
              <Input
                value={floorName}
                onChange={(event) => setFloorName(event.target.value)}
                placeholder="e.g. Reception"
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              {active ? "Active" : "Inactive"}
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              If no floor name is entered, the floor number is used as the displayed floor.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save floor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AreasPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buildings, setBuildings] = useState<HdBuilding[]>([]);
  const [floors, setFloors] = useState<HdBuildingFloor[]>([]);
  const [areas, setAreas] = useState<HdBuildingArea[]>([]);
  const [editing, setEditing] = useState<HdBuildingArea | "new" | null>(null);
  const [viewing, setViewing] = useState<HdBuildingArea | null>(null);
  const [branchId, setBranchId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const pagedAreas = usePaged(areas);

  const reload = useCallback(async () => {
    try {
      const [nextBranches, nextBuildings, nextFloors, nextAreas] = await Promise.all([
        listBranches(true),
        catalogService.listBuildings(),
        catalogService.listBuildingFloors(),
        catalogService.listBuildingAreas(),
      ]);
      setBranches(nextBranches);
      setBuildings(nextBuildings);
      setFloors(nextFloors);
      setAreas(nextAreas);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load area masters.");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const buildingOptions = useMemo(
    () =>
      buildings.filter(
        (building) =>
          building.branch_id === branchId && (building.active || building.id === buildingId),
      ),
    [buildings, branchId, buildingId],
  );
  const floorOptions = useMemo(() => {
    const configured = floors.filter((item) => item.active || item.name === floor);
    if (configured.some((item) => item.active)) return configured;
    const legacy = areas
      .filter(
        (area) =>
          area.building_id === buildingId &&
          (!floors.some((item) => item.building_id === buildingId && item.name === area.floor) ||
            area.floor === floor),
      )
      .map((area) => area.floor)
      .filter((name, index, names) => names.indexOf(name) === index);
    return [
      ...configured,
      ...legacy
        .filter((name) => !configured.some((item) => item.name === name))
        .map((name) => ({ id: `legacy-${name}`, name, active: true, building_id: buildingId })),
    ];
  }, [floors, areas, buildingId, floor]);

  const open = (value: HdBuildingArea | "new") => {
    const area = typeof value === "object" ? value : null;
    const building = buildings.find((item) => item.id === area?.building_id);
    setEditing(value);
    setBranchId(
      building?.branch_id ?? branches.find((branch) => branch.status === "ACTIVE")?.id ?? "",
    );
    setBuildingId(area?.building_id ?? "");
    setFloor(area?.floor ?? "");
    setName(area?.name ?? "");
    setActive(area?.active ?? true);
  };

  const save = async () => {
    if (!buildingId || !floor || !name.trim()) {
      toast.error("Select a branch, building, and floor, then enter an area name.");
      return;
    }
    const current = typeof editing === "object" ? editing : null;
    setSaving(true);
    try {
      await catalogService.saveBuildingArea({
        ...(current ? { id: current.id } : {}),
        building_id: buildingId,
        floor,
        name: name.trim(),
        active,
      });
      toast.success("Area saved.");
      setEditing(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the area.");
    } finally {
      setSaving(false);
    }
  };
  const setAreaActive = async (area: HdBuildingArea, nextActive: boolean) => {
    await catalogService.saveBuildingArea({ ...area, active: nextActive });
    await reload();
    toast.success(`Area ${nextActive ? "activated" : "deactivated"}.`);
  };
  const removeArea = async (area: HdBuildingArea) => {
    await catalogService.deleteBuildingArea(area.id);
    await reload();
    toast.success("Area deleted.");
  };

  return (
    <>
      <LocationMasterTable
        title="Area Master"
        addLabel="Add area"
        onAdd={() => open("new")}
        headers={["Branch", "Building", "Area name", "Floor"]}
        footer={pagedAreas.footer}
      >
        {pagedAreas.rows.map((area) => {
          const building = buildings.find((item) => item.id === area.building_id);
          const branch = branches.find((item) => item.id === building?.branch_id);
          return (
            <TableRow key={area.id}>
              <TableCell>{branch?.name ?? "Branch unavailable"}</TableCell>
              <TableCell>{building?.name ?? "Building unavailable"}</TableCell>
              <TableCell>{area.name}</TableCell>
              <TableCell>{area.floor}</TableCell>
              <TableCell>
                <MasterStatusSwitch
                  active={area.active}
                  name={area.name}
                  onChange={(nextActive) => setAreaActive(area, nextActive)}
                />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`View ${area.name}`}
                  title="View area"
                  onClick={() => setViewing(area)}
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${area.name}`}
                  onClick={() => open(area)}
                >
                  <Pencil className="size-4" />
                </Button>
                <MasterDeleteButton
                  name={`area "${area.name}"`}
                  description="Areas referenced by tickets or feedback cannot be deleted. Deactivate the area to preserve its history."
                  onDelete={() => removeArea(area)}
                />
              </TableCell>
            </TableRow>
          );
        })}
        {!areas.length ? (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              No areas configured.
            </TableCell>
          </TableRow>
        ) : null}
      </LocationMasterTable>
      <MasterViewDialog
        open={viewing !== null}
        onOpenChange={(openState) => !openState && setViewing(null)}
        title={viewing?.name ?? "Area details"}
        description="Area details"
        fields={[
          {
            label: "Branch",
            value: branches.find(
              (branch) =>
                branch.id ===
                buildings.find((building) => building.id === viewing?.building_id)?.branch_id,
            )?.name,
          },
          {
            label: "Building",
            value: buildings.find((building) => building.id === viewing?.building_id)?.name,
          },
          { label: "Area name", value: viewing?.name },
          { label: "Floor", value: viewing?.floor },
          { label: "Status", value: viewing?.active ? "Active" : "Inactive" },
        ]}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(openState) => !openState && !saving && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add area" : "Edit area"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={branchId}
                onValueChange={(value) => {
                  setBranchId(value);
                  setBuildingId("");
                  setFloor("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((branch) => branch.status === "ACTIVE" || branch.id === branchId)
                    .map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Building</Label>
              <Select
                value={buildingId}
                onValueChange={(value) => {
                  setBuildingId(value);
                  setFloor("");
                }}
                disabled={!branchId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select building" />
                </SelectTrigger>
                <SelectContent>
                  {buildingOptions.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Area name</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter area name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Floor</Label>
              <Select value={floor} onValueChange={setFloor} disabled={!buildingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select floor" />
                </SelectTrigger>
                <SelectContent>
                  {floorOptions.map((item) => (
                    <SelectItem key={item.id} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              {active ? "Active" : "Inactive"}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save area"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
