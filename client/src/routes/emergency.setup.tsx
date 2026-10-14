import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Pill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/context/app-context";
import { canManageEmergency, configService } from "@/services/emergency";

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
  const [saving, setSaving] = useState(false);

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

  const addAssemblyPoint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (p.name.trim().length < 2) {
      toast.error("Name required");
      return;
    }
    if (
      await run(async () => {
        await configService.saveAssemblyPoint({
          name: p.name.trim(),
          location: p.location.trim(),
          description: p.description.trim(),
        });
      })
    ) {
      setP({ name: "", location: "", description: "" });
      setAssemblyDialogOpen(false);
    }
  };

  const addType = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (t.trim().length < 2) {
      toast.error("Name required");
      return;
    }
    if (await run(() => configService.saveType({ name: t.trim(), sort_order: types.length + 1 }))) {
      setT("");
      setTypeDialogOpen(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Emergency Evacuation" title="Assembly points & incident types" />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-bold">Assembly points</h2>
          <Button onClick={() => setAssemblyDialogOpen(true)}>
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
                {points.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.name}</TableCell>
                    <TableCell>{x.location}</TableCell>
                    <TableCell>{x.description}</TableCell>
                    <TableCell>{active(x.active)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void run(() =>
                            configService.saveAssemblyPoint({
                              id: x.id,
                              name: x.name,
                              active: !x.active,
                            }),
                          )
                        }
                      >
                        {x.active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-bold">Incident types</h2>
          <Button onClick={() => setTypeDialogOpen(true)}>
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
                {types.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.name}</TableCell>
                    <TableCell>{active(x.active)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void run(() =>
                            configService.saveType({
                              id: x.id,
                              name: x.name,
                              active: !x.active,
                            }),
                          )
                        }
                      >
                        {x.active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <Dialog
        open={assemblyDialogOpen}
        onOpenChange={(open) => {
          if (!saving) setAssemblyDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add assembly point</DialogTitle>
            <DialogDescription>
              Add a safe location employees can use during an emergency.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addAssemblyPoint} className="space-y-4">
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
                {saving ? "Saving…" : "Add assembly point"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={typeDialogOpen}
        onOpenChange={(open) => {
          if (!saving) setTypeDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add incident type</DialogTitle>
            <DialogDescription>
              Add an incident type that can be selected when declaring an emergency.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addType} className="space-y-4">
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
                {saving ? "Saving…" : "Add type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
