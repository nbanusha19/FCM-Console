import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { MasterDeleteButton } from "@/components/masters/MasterDeleteButton";
import { usePaged } from "@/components/common/TableCard";
import { Pill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/context/app-context";
import {
  canManageEmergency,
  configService,
  type AssemblyPoint,
  type IncidentType,
} from "@/services/emergency";

export const Route = createFileRoute("/emergency/setup")({
  component: Setup,
});

function Setup() {
  const { user } = useApp();
  const qc = useQueryClient();
  const canManage = canManageEmergency(user);
  const { data: points = [] } = useQuery({
    queryKey: ["emg-points-all"],
    queryFn: () => configService.assemblyPoints(true),
    enabled: canManage,
  });
  const { data: types = [] } = useQuery({
    queryKey: ["emg-types-all"],
    queryFn: () => configService.types(true),
    enabled: canManage,
  });
  const [p, setP] = useState({ name: "", location: "", description: "" });
  const [t, setT] = useState("");
  const [assemblyDialogOpen, setAssemblyDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<AssemblyPoint | null>(null);
  const [editingType, setEditingType] = useState<IncidentType | null>(null);
  const [viewingPoint, setViewingPoint] = useState<AssemblyPoint | null>(null);
  const [viewingType, setViewingType] = useState<IncidentType | null>(null);
  const [pendingStatus, setPendingStatus] = useState<
    | { kind: "point"; item: AssemblyPoint; active: boolean }
    | { kind: "type"; item: IncidentType; active: boolean }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const pagedPoints = usePaged(points);
  const pagedTypes = usePaged(types);

  if (!canManage)
    return <p className="text-muted-foreground">Only HSE Admin can manage emergency settings.</p>;

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      ["emg-points-all", "emg-points", "emg-types-all", "emg-types"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      toast.success("Saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const active = (a: boolean) => (
    <Pill tone={a ? "success" : "neutral"}>{a ? "Active" : "Inactive"}</Pill>
  );

  const saveAssemblyPoint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (p.name.trim().length < 2) {
      toast.error("Name required");
      return;
    }
    if (
      await run(async () => {
        await configService.saveAssemblyPoint({
          ...(editingPoint ? { id: editingPoint.id } : {}),
          name: p.name.trim(),
          location: p.location.trim(),
          description: p.description.trim(),
        });
      })
    ) {
      setP({ name: "", location: "", description: "" });
      setEditingPoint(null);
      setAssemblyDialogOpen(false);
    }
  };

  const saveIncidentType = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (t.trim().length < 2) {
      toast.error("Name required");
      return;
    }
    if (
      await run(() =>
        configService.saveType({
          ...(editingType ? { id: editingType.id, sort_order: editingType.sort_order } : {}),
          name: t.trim(),
          ...(editingType ? {} : { sort_order: types.length + 1 }),
        }),
      )
    ) {
      setT("");
      setEditingType(null);
      setTypeDialogOpen(false);
    }
  };

  const updateStatus = async () => {
    if (!pendingStatus) return;
    const target = pendingStatus;
    const succeeded = await run(() =>
      target.kind === "point"
        ? configService.saveAssemblyPoint({
            id: target.item.id,
            name: target.item.name,
            active: target.active,
          })
        : configService.saveType({
            id: target.item.id,
            name: target.item.name,
            sort_order: target.item.sort_order,
            active: target.active,
          }),
    );
    if (succeeded) setPendingStatus(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Emergency Evacuation" title="Assembly points & incident types" />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-bold">Assembly points</h2>
          <Button
            onClick={() => {
              setEditingPoint(null);
              setP({ name: "", location: "", description: "" });
              setAssemblyDialogOpen(true);
            }}
          >
            <Plus className="size-4" /> Add assembly point
          </Button>
        </div>
        <section className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-162.5">
              <TableHeader>
                <TableRow>
                  <TableHead>Assembly point</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedPoints.rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.name}</TableCell>
                    <TableCell>{x.location}</TableCell>
                    <TableCell>{x.description}</TableCell>
                    <TableCell>
                      <Switch
                        checked={x.active}
                        disabled={saving}
                        className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-emerald-200"
                        aria-label={`Set ${x.name} ${x.active ? "inactive" : "active"}`}
                        onCheckedChange={(active) =>
                          setPendingStatus({ kind: "point", item: x, active })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="View assembly point"
                          aria-label={`View ${x.name}`}
                          onClick={() => setViewingPoint(x)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit assembly point"
                          aria-label={`Edit ${x.name}`}
                          onClick={() => {
                            setEditingPoint(x);
                            setP({
                              name: x.name,
                              location: x.location,
                              description: x.description,
                            });
                            setAssemblyDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <MasterDeleteButton
                          name={`assembly point "${x.name}"`}
                          description="This permanently deletes the assembly point. If it is in use by an emergency record, deletion will be rejected."
                          onDelete={async () => {
                            await configService.deleteAssemblyPoint(x.id);
                            ["emg-points-all", "emg-points"].forEach((k) =>
                              qc.invalidateQueries({ queryKey: [k] }),
                            );
                            toast.success("Assembly point deleted.");
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pagedPoints.footer}
        </section>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-bold">Incident types</h2>
          <Button
            onClick={() => {
              setEditingType(null);
              setT("");
              setTypeDialogOpen(true);
            }}
          >
            <Plus className="size-4" /> Add type
          </Button>
        </div>
        <section className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-125">
              <TableHeader>
                <TableRow>
                  <TableHead>Incident type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedTypes.rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.name}</TableCell>
                    <TableCell>
                      <Switch
                        checked={x.active}
                        disabled={saving}
                        className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-emerald-200"
                        aria-label={`Set ${x.name} ${x.active ? "inactive" : "active"}`}
                        onCheckedChange={(active) =>
                          setPendingStatus({ kind: "type", item: x, active })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="View incident type"
                          aria-label={`View ${x.name}`}
                          onClick={() => setViewingType(x)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit incident type"
                          aria-label={`Edit ${x.name}`}
                          onClick={() => {
                            setEditingType(x);
                            setT(x.name);
                            setTypeDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <MasterDeleteButton
                          name={`incident type "${x.name}"`}
                          description="This permanently deletes the incident type. If it is in use by an emergency record, deletion will be rejected."
                          onDelete={async () => {
                            await configService.deleteType(x.id);
                            ["emg-types-all", "emg-types"].forEach((k) =>
                              qc.invalidateQueries({ queryKey: [k] }),
                            );
                            toast.success("Incident type deleted.");
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pagedTypes.footer}
        </section>
      </div>

      <Dialog
        open={assemblyDialogOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setAssemblyDialogOpen(open);
            if (!open) {
              setEditingPoint(null);
              setP({ name: "", location: "", description: "" });
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPoint ? "Edit assembly point" : "Add assembly point"}</DialogTitle>
            <DialogDescription>
              Add a safe location employees can use during an emergency.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveAssemblyPoint} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assembly-name">Assembly point name</Label>
              <Input
                id="assembly-name"
                autoFocus
                value={p.name}
                onChange={(event) => setP({ ...p, name: event.target.value })}
                placeholder="e.g. Main Ground Assembly Area"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assembly-location">Location</Label>
              <Input
                id="assembly-location"
                value={p.location}
                onChange={(event) => setP({ ...p, location: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assembly-description">Description</Label>
              <Input
                id="assembly-description"
                value={p.description}
                onChange={(event) => setP({ ...p, description: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setAssemblyDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingPoint ? "Save changes" : "Add assembly point"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={typeDialogOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setTypeDialogOpen(open);
            if (!open) {
              setEditingType(null);
              setT("");
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit incident type" : "Add incident type"}</DialogTitle>
            <DialogDescription>
              Add an incident type that can be selected when declaring an emergency.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveIncidentType} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="incident-type">Incident type</Label>
              <Input
                id="incident-type"
                autoFocus
                value={t}
                onChange={(event) => setT(event.target.value)}
                placeholder="e.g. Fire"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setTypeDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingType ? "Save changes" : "Add type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewingPoint !== null} onOpenChange={(open) => !open && setViewingPoint(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assembly point details</DialogTitle>
            <DialogDescription>View this emergency assembly point.</DialogDescription>
          </DialogHeader>
          {viewingPoint ? (
            <div className="space-y-4">
              <Detail label="Assembly point" value={viewingPoint.name} />
              <Detail label="Location" value={viewingPoint.location} />
              <Detail label="Description" value={viewingPoint.description} />
              <div className="flex items-center justify-between">
                <Label>Status</Label>
                {active(viewingPoint.active)}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={viewingType !== null} onOpenChange={(open) => !open && setViewingType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Incident type details</DialogTitle>
            <DialogDescription>View this emergency incident type.</DialogDescription>
          </DialogHeader>
          {viewingType ? (
            <div className="space-y-4">
              <Detail label="Incident type" value={viewingType.name} />
              <div className="flex items-center justify-between">
                <Label>Status</Label>
                {active(viewingType.active)}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingStatus(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus?.active ? "Activate" : "Deactivate"}{" "}
              {pendingStatus?.kind === "point" ? "assembly point" : "incident type"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus
                ? `Are you sure you want to ${pendingStatus.active ? "activate" : "deactivate"} "${pendingStatus.item.name}"?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button disabled={saving} onClick={() => void updateStatus()}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value?.trim() || "—"}</p>
    </div>
  );
}
