import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Pill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/context/app-context";
import { listEwpLocations, listVendors, saveEwpLocation, saveVendor } from "@/services/permits";

export const Route = createFileRoute("/ework-permit/setup")({
  component: Setup,
});

function Setup() {
  const qc = useQueryClient();
  const { user } = useApp();
  const isAdmin = user?.role === "ADMIN";
  const { data: vendors = [] } = useQuery({
    queryKey: ["ewp-vendors-all"],
    queryFn: () => listVendors(true),
    enabled: isAdmin,
  });
  const { data: locs = [] } = useQuery({
    queryKey: ["ewp-locations-all"],
    queryFn: () => listEwpLocations(true),
    enabled: isAdmin,
  });
  const [v, setV] = useState({ name: "", contact: "", email: "" });
  const [l, setL] = useState({ building: "", floor: "", area: "" });
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const refresh = () =>
    ["ewp-vendors-all", "ewp-vendors", "ewp-locations-all", "ewp-locations"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      refresh();
      toast.success("Saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return false;
    }
  };

  if (!isAdmin) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Only administrators can manage E-Work Permit vendors and locations.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="E-Work Permit"
        title="Vendors & locations"
        subtitle="Configurable lists used on the permit form."
      />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold">Vendors</h2>
          <Button onClick={() => setVendorDialogOpen(true)}>
            <Plus className="size-4" /> Add vendor
          </Button>
        </div>
        <div className="surface-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="font-medium">{x.name}</TableCell>
                  <TableCell>{x.contact}</TableCell>
                  <TableCell>{x.email}</TableCell>
                  <TableCell>
                    <Pill tone={x.active ? "success" : "neutral"}>
                      {x.active ? "Active" : "Inactive"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(() => saveVendor({ id: x.id, name: x.name, active: !x.active }))
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
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold">Locations</h2>
          <Button onClick={() => setLocationDialogOpen(true)}>
            <Plus className="size-4" /> Add location
          </Button>
        </div>
        <div className="surface-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Building</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locs.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="font-medium">{x.building}</TableCell>
                  <TableCell>{x.floor}</TableCell>
                  <TableCell>{x.area}</TableCell>
                  <TableCell>
                    <Pill tone={x.active ? "success" : "neutral"}>
                      {x.active ? "Active" : "Inactive"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(() =>
                          saveEwpLocation({ id: x.id, building: x.building, active: !x.active }),
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

      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>
              Enter the vendor details used for permit requests.
            </DialogDescription>
          </DialogHeader>
          <form
            id="add-vendor-form"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (v.name.trim().length < 2) {
                toast.error("Vendor name required");
                return;
              }
              if (
                await run(async () => {
                  await saveVendor(v);
                  setV({ name: "", contact: "", email: "" });
                })
              )
                setVendorDialogOpen(false);
            }}
          >
            <Input
              autoFocus
              placeholder="Vendor name"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
            <Input
              placeholder="Contact"
              value={v.contact}
              onChange={(e) => setV({ ...v, contact: e.target.value })}
            />
            <Input
              type="email"
              placeholder="Email for permit links"
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
            />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVendorDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-vendor-form">
              <Plus className="size-4" /> Add vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add location</DialogTitle>
            <DialogDescription>Enter the building and location details.</DialogDescription>
          </DialogHeader>
          <form
            id="add-location-form"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!l.building.trim()) {
                toast.error("Building required");
                return;
              }
              if (
                await run(async () => {
                  await saveEwpLocation(l);
                  setL({ building: "", floor: "", area: "" });
                })
              )
                setLocationDialogOpen(false);
            }}
          >
            <Input
              autoFocus
              placeholder="Building"
              value={l.building}
              onChange={(e) => setL({ ...l, building: e.target.value })}
            />
            <Input
              placeholder="Floor"
              value={l.floor}
              onChange={(e) => setL({ ...l, floor: e.target.value })}
            />
            <Input
              placeholder="Area"
              value={l.area}
              onChange={(e) => setL({ ...l, area: e.target.value })}
            />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLocationDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-location-form">
              <Plus className="size-4" /> Add location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
