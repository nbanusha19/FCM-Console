import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { MasterDeleteButton } from "@/components/masters/MasterDeleteButton";
import { usePaged } from "@/components/common/TableCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { deleteVendor, listVendors, saveVendor, type Vendor } from "@/services/permits";

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
  const [v, setV] = useState({ name: "", contact: "", email: "" });
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const [updatingVendorId, setUpdatingVendorId] = useState<string | null>(null);
  const pagedVendors = usePaged(vendors);
  const refresh = () =>
    ["ewp-vendors-all", "ewp-vendors"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (fn: () => Promise<void>, successMessage = "Saved") => {
    try {
      await fn();
      refresh();
      toast.success(successMessage);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return false;
    }
  };

  if (!isAdmin) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Only administrators can manage E-Work Permit vendors.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="E-Work Permit"
        title="Vendors"
        subtitle="Manage vendors used on E-Work Permit requests."
      />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold">Vendors</h2>
          <Button
            onClick={() => {
              setEditingVendor(null);
              setV({ name: "", contact: "", email: "" });
              setVendorDialogOpen(true);
            }}
          >
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
              {pagedVendors.rows.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="font-medium">{x.name}</TableCell>
                  <TableCell>{x.contact}</TableCell>
                  <TableCell>{x.email}</TableCell>
                  <TableCell>
                    <Switch
                      checked={x.active}
                      disabled={updatingVendorId === x.id}
                      className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-emerald-200"
                      aria-label={`Set ${x.name} ${x.active ? "inactive" : "active"}`}
                      onCheckedChange={(active) => {
                        setUpdatingVendorId(x.id);
                        void run(
                          () => saveVendor({ id: x.id, name: x.name, active }),
                          `Vendor ${active ? "activated" : "deactivated"}.`,
                        ).finally(() => setUpdatingVendorId(null));
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="View vendor"
                        aria-label={`View ${x.name}`}
                        onClick={() => setViewingVendor(x)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Edit vendor"
                        aria-label={`Edit ${x.name}`}
                        onClick={() => {
                          setEditingVendor(x);
                          setV({ name: x.name, contact: x.contact, email: x.email });
                          setVendorDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <MasterDeleteButton
                        name={`vendor "${x.name}"`}
                        description="This removes the vendor from the selectable E-Work Permit vendor list. Existing permit records are preserved."
                        onDelete={async () => {
                          await deleteVendor(x.id);
                          refresh();
                          toast.success("Vendor deleted.");
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pagedVendors.footer}
        </div>
      </section>

      <Dialog
        open={vendorDialogOpen}
        onOpenChange={(open) => {
          setVendorDialogOpen(open);
          if (!open) {
            setEditingVendor(null);
            setV({ name: "", contact: "", email: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit vendor" : "Add vendor"}</DialogTitle>
            <DialogDescription>
              Enter the vendor details used for permit requests.
            </DialogDescription>
          </DialogHeader>
          <form
            id="edit-vendor-form"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (v.name.trim().length < 2) {
                toast.error("Vendor name required");
                return;
              }
              if (
                await run(async () => {
                  await saveVendor({ ...v, ...(editingVendor ? { id: editingVendor.id } : {}) });
                  setV({ name: "", contact: "", email: "" });
                  setEditingVendor(null);
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
            <Button type="submit" form="edit-vendor-form">
              {editingVendor ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editingVendor ? "Save changes" : "Add vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={viewingVendor !== null}
        onOpenChange={(open) => !open && setViewingVendor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vendor details</DialogTitle>
            <DialogDescription>View and manage this E-Work Permit vendor.</DialogDescription>
          </DialogHeader>
          {viewingVendor ? (
            <div className="space-y-4">
              <Detail label="Vendor" value={viewingVendor.name} />
              <Detail label="Contact" value={viewingVendor.contact} />
              <Detail label="Email" value={viewingVendor.email} />
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label htmlFor="vendor-active-switch">Status</Label>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      viewingVendor.active
                        ? "text-sm font-medium text-emerald-700"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {viewingVendor.active ? "Active" : "Inactive"}
                  </span>
                  <Switch
                    id="vendor-active-switch"
                    checked={viewingVendor.active}
                    className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-emerald-200"
                    aria-label={`Set ${viewingVendor.name} ${viewingVendor.active ? "inactive" : "active"}`}
                    onCheckedChange={(active) => {
                      void run(
                        async () => {
                          await saveVendor({
                            id: viewingVendor.id,
                            name: viewingVendor.name,
                            active,
                          });
                          setViewingVendor({ ...viewingVendor, active });
                        },
                        `Vendor ${active ? "activated" : "deactivated"}.`,
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
