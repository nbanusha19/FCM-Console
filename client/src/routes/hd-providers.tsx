import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
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
      { title: "Service providers — FCM Helpdesk" },
      { name: "description", content: "Manage helpdesk service providers and their services." },
      { property: "og:title", content: "Service providers" },
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
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<HdProvider | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(() => {
    providerService
      .listProviders()
      .then(setProviders)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Unable to load providers."));
  }, []);
  useEffect(reload, [reload]);

  const rows = useMemo(
    () =>
      providers.filter(
        (p) =>
          !q.trim() ||
          [p.name, p.email, p.contact].join(" ").toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [providers, q],
  );
  const paged = usePaged(rows);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          eyebrow="FCM Helpdesk"
          title="Service providers"
          subtitle="Teams that receive and resolve tickets."
          actions={
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add provider
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {toolbar}
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add provider
          </Button>
        </div>
      )}
      <TableCard
        search={q}
        onSearch={(v) => {
          setQ(v);
          paged.reset();
        }}
        placeholder="Search provider"
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
                  <StatusPill
                    status={p.active ? "ACTIVE" : "STOPPED"}
                    label={p.active ? "Active" : "Inactive"}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit provider"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
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
