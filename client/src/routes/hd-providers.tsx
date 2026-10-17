import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { MasterViewDialog } from "@/components/masters/MasterViewDialog";
import { MasterDeleteButton } from "@/components/masters/MasterDeleteButton";
import { MasterStatusSwitch } from "@/components/masters/MasterStatusSwitch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyRow, TableCard, usePaged } from "@/components/common/TableCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  catalogService,
  providerService,
  type HdProvider,
  type HdService,
} from "@/services/helpdesk-api";
import type { ReactNode } from "react";

export const Route = createFileRoute("/hd-providers")({
  head: () => ({
    meta: [
      { title: "Service Provider Master — FCM Helpdesk" },
      { name: "description", content: "Manage Helpdesk service providers and their services." },
      { property: "og:title", content: "Service Provider Master" },
      { property: "og:description", content: "Manage helpdesk service providers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <ProvidersPage />
    </AppPage>
  ),
});

export function ProvidersPage({
  embedded = false,
  toolbar,
}: {
  embedded?: boolean;
  toolbar?: ReactNode;
} = {}) {
  const [providers, setProviders] = useState<HdProvider[]>([]);
  const [services, setServices] = useState<HdService[]>([]);
  const [editing, setEditing] = useState<HdProvider | null>(null);
  const [viewing, setViewing] = useState<HdProvider | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const [providerResult, serviceResult] = await Promise.allSettled([
      providerService.listProviders(),
      catalogService.listServices(),
    ]);
    if (providerResult.status === "rejected") {
      toast.error(
        providerResult.reason instanceof Error
          ? providerResult.reason.message
          : "Unable to load providers.",
      );
      return;
    }
    setProviders(providerResult.value);
    if (serviceResult.status === "fulfilled") {
      setServices(serviceResult.value);
    } else {
      toast.error(
        serviceResult.reason instanceof Error
          ? serviceResult.reason.message
          : "Unable to load mapped provider services.",
      );
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const setProviderActive = async (provider: HdProvider, active: boolean) => {
    await providerService.saveProvider({ ...provider, active });
    await reload();
    toast.success(`Provider ${active ? "activated" : "deactivated"}.`);
  };

  const removeProvider = async (provider: HdProvider) => {
    await providerService.deleteProvider(provider.id);
    await reload();
    toast.success("Provider deleted.");
  };

  const paged = usePaged(providers);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          eyebrow="FCM Helpdesk"
          title="Service Provider Master"
          subtitle="Teams that receive and resolve tickets."
        />
      ) : toolbar ? (
        <div>{toolbar}</div>
      ) : null}
      <TableCard
        title="Service Provider Master"
        description={`${providers.length} providers`}
        extra={
          <Button
            className="bg-primary text-primary-foreground [background-image:none] hover:bg-primary/90"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" /> Add provider
          </Button>
        }
        footer={paged.footer}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Login email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.length === 0 ? (
              <EmptyRow cols={5}>
                <Wrench className="mx-auto mb-2 size-8" />
                No providers configured.
              </EmptyRow>
            ) : null}
            {paged.rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold">{p.name}</TableCell>
                <TableCell className="text-[13px]">{p.contact || "—"}</TableCell>
                <TableCell className="text-[13px]">{p.email || "—"}</TableCell>
                <TableCell>
                  <MasterStatusSwitch
                    active={p.active}
                    name={p.name}
                    onChange={(active) => setProviderActive(p, active)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="View provider"
                      aria-label={`View ${p.name}`}
                      onClick={() => setViewing(p)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit provider"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <MasterDeleteButton
                      name={`provider "${p.name}"`}
                      description="Providers assigned to tickets or mapped to services cannot be deleted. Deactivate the provider to preserve its history."
                      onDelete={() => removeProvider(p)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <MasterViewDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? "Provider details"}
        description="Service provider details"
        fields={[
          { label: "Provider", value: viewing?.name },
          { label: "Contact", value: viewing?.contact },
          { label: "Login email", value: viewing?.email },
          { label: "Status", value: viewing?.active ? "Active" : "Inactive" },
          {
            label: "Mapped services",
            value:
              services
                .filter((service) => service.provider_id === viewing?.id)
                .map((service) => service.name)
                .join(", ") || "—",
          },
        ]}
      />
      <ProviderDialog
        open={adding || !!editing}
        provider={editing}
        onClose={() => {
          setEditing(null);
          setAdding(false);
        }}
        onSaved={() => {
          setEditing(null);
          setAdding(false);
          reload();
        }}
      />
    </div>
  );
}

function ProviderDialog({
  open,
  provider,
  onClose,
  onSaved,
}: {
  open: boolean;
  provider: HdProvider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(provider?.name ?? "");
    setContact(provider?.contact ?? "");
    setEmail(provider?.email ?? "");
    setActive(provider?.active ?? true);
  }, [provider, open]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Provider name is required.");
      return;
    }
    setSaving(true);
    try {
      await providerService.saveProvider({
        ...(provider?.id ? { id: provider.id } : {}),
        name: name.trim(),
        contact: contact.trim(),
        email: email.trim(),
        active,
      });
      toast.success("Provider saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the provider.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!provider || !window.confirm(`Delete provider "${provider.name}"? This cannot be undone.`))
      return;
    setDeleting(true);
    try {
      await providerService.deleteProvider(provider.id);
      toast.success("Provider deleted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete the provider.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider ? "Edit provider" : "Add provider"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="HVAC Team" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="+91 …"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Login email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="provider@fcm.local"
            />
            <p className="text-[11px] text-muted-foreground">
              Tickets assigned to this provider appear for the account signed in with this email.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{" "}
            Active
          </label>
        </div>
        <DialogFooter className="sm:justify-between">
          {provider ? (
            <Button
              variant="destructive"
              disabled={saving || deleting}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" /> {deleting ? "Deleting…" : "Delete provider"}
            </Button>
          ) : null}
          <Button disabled={saving || deleting} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
