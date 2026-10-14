import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type HdCategory,
  type HdProvider,
  type HdService,
  type HdSubcategory,
} from "@/services/helpdesk-api";
import type { ReactNode } from "react";

export const Route = createFileRoute("/hd-categories")({
  head: () => ({
    meta: [
      { title: "Service categories — FCM Helpdesk" },
      {
        name: "description",
        content: "Configure helpdesk categories, sub-categories, services and provider mapping.",
      },
      { property: "og:title", content: "Service categories" },
      { property: "og:description", content: "Configure the helpdesk service catalog." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <CategoriesPage />
    </AppPage>
  ),
});

export function CategoriesPage({
  embedded = false,
  toolbar,
}: {
  embedded?: boolean;
  toolbar?: ReactNode;
} = {}) {
  const [categories, setCategories] = useState<HdCategory[]>([]);
  const [subcategories, setSubcategories] = useState<HdSubcategory[]>([]);
  const [services, setServices] = useState<HdService[]>([]);
  const [providers, setProviders] = useState<HdProvider[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{
    category: HdCategory;
    subcategory: HdSubcategory | null;
  } | null>(null);
  const [creatingCatalogItem, setCreatingCatalogItem] = useState<"category" | "subcategory" | null>(
    null,
  );
  const [serviceEditing, setServiceEditing] = useState<HdService | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      catalogService.listCategories(),
      catalogService.listSubcategories(),
      catalogService.listServices(),
      providerService.listProviders(),
    ])
      .then(([c, sc, sv, p]) => {
        setCategories(c);
        setSubcategories(sc);
        setServices(sv);
        setProviders(p);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Unable to load the catalog."));
  }, []);
  useEffect(reload, [reload]);

  const rows = useMemo(() => {
    const entries: {
      id: string;
      category: HdCategory;
      subcategory: HdSubcategory | null;
      active: boolean;
    }[] = [];
    for (const category of categories) {
      const categorySubcategories = subcategories.filter(
        (subcategory) => subcategory.category_id === category.id,
      );
      const hasCategoryServices = services.some(
        (service) => service.category_id === category.id && !service.subcategory_id,
      );
      if (hasCategoryServices && categorySubcategories.length) {
        entries.push({
          id: `${category.id}-services`,
          category,
          subcategory: null,
          active: category.active,
        });
      }
      if (categorySubcategories.length) {
        entries.push(
          ...categorySubcategories.map((subcategory) => ({
            id: subcategory.id,
            category,
            subcategory,
            active: category.active && subcategory.active,
          })),
        );
      } else {
        entries.push({
          id: category.id,
          category,
          subcategory: null,
          active: category.active,
        });
      }
    }
    return entries
      .filter(
        (row) =>
          !q.trim() ||
          [row.category.name, row.subcategory?.name ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
      )
      .sort(
        (a, b) =>
          a.category.name.localeCompare(b.category.name) ||
          (a.subcategory?.name ?? "").localeCompare(b.subcategory?.name ?? ""),
      );
  }, [categories, subcategories, services, q]);
  const paged = usePaged(rows);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          eyebrow="FCM Helpdesk"
          title="Service categories"
          subtitle="Manage service categories and sub-categories."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCreatingCatalogItem("category")}>
                <Plus className="size-4" /> Add category
              </Button>
              <Button
                disabled={!categories.length}
                onClick={() => setCreatingCatalogItem("subcategory")}
              >
                <Plus className="size-4" /> Add sub-category
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {toolbar}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreatingCatalogItem("category")}>
              <Plus className="size-4" /> Add category
            </Button>
            <Button
              disabled={!categories.length}
              onClick={() => setCreatingCatalogItem("subcategory")}
            >
              <Plus className="size-4" /> Add sub-category
            </Button>
          </div>
        </div>
      )}
      <TableCard
        search={q}
        onSearch={(v) => {
          setQ(v);
          paged.reset();
        }}
        placeholder="Search category or sub-category"
        footer={paged.footer}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Sub-category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.length === 0 ? (
              <EmptyRow cols={4}>
                <Tags className="mx-auto mb-2 size-8" />
                No categories or sub-categories configured.
              </EmptyRow>
            ) : null}
            {paged.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">{r.category.name}</TableCell>
                <TableCell className="text-[13px]">{r.subcategory?.name ?? "—"}</TableCell>
                <TableCell>
                  <StatusPill
                    status={r.active ? "ACTIVE" : "STOPPED"}
                    label={r.active ? "Active" : "Inactive"}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit category and sub-category"
                      aria-label={`Edit ${r.category.name}${r.subcategory ? ` / ${r.subcategory.name}` : ""}`}
                      onClick={() =>
                        setEditing({ category: r.category, subcategory: r.subcategory })
                      }
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
      <ServiceDialog
        open={!!serviceEditing}
        service={serviceEditing}
        categories={categories}
        subcategories={subcategories}
        providers={providers}
        onClose={() => {
          setServiceEditing(null);
        }}
        onSaved={() => {
          setServiceEditing(null);
          reload();
        }}
      />
      <CategoryDialog
        entry={editing}
        services={services.filter(
          (service) =>
            service.category_id === editing?.category.id &&
            service.subcategory_id === (editing.subcategory?.id ?? null),
        )}
        onEditService={(service) => {
          setEditing(null);
          setServiceEditing(service);
        }}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <CatalogItemDialog
        mode={creatingCatalogItem}
        categories={categories}
        onClose={() => setCreatingCatalogItem(null)}
        onSaved={() => {
          setCreatingCatalogItem(null);
          reload();
        }}
      />
    </div>
  );
}

function CatalogItemDialog({
  mode,
  categories,
  onClose,
  onSaved,
}: {
  mode: "category" | "subcategory" | null;
  categories: HdCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCategoryId(categories[0]?.id ?? "");
    setName("");
  }, [mode, categories]);

  const save = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error(`${mode === "category" ? "Category" : "Sub-category"} name is required.`);
      return;
    }
    if (mode === "subcategory" && !categories.some((category) => category.id === categoryId)) {
      toast.error("Select a category for this sub-category.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "category") {
        await catalogService.saveCategory({
          name: normalizedName,
          description: "",
          sort_order: categories.length
            ? Math.max(...categories.map((category) => category.sort_order)) + 1
            : 1,
          active: true,
        });
        toast.success("Category added");
      } else if (mode === "subcategory") {
        await catalogService.saveSubcategory({
          category_id: categoryId,
          name: normalizedName,
          description: "",
          active: true,
        });
        toast.success("Sub-category added");
      } else {
        return;
      }
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Unable to add the ${mode === "category" ? "category" : "sub-category"}.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "category" ? "Add category" : "Add sub-category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "subcategory" ? (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>{mode === "category" ? "Category name" : "Sub-category name"}</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={mode === "category" ? "e.g. HVAC" : "e.g. AC Not Cooling"}
              maxLength={120}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              saving ||
              !name.trim() ||
              (mode === "subcategory" && (!categories.length || !categoryId))
            }
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  entry,
  services,
  onEditService,
  onClose,
  onSaved,
}: {
  entry: { category: HdCategory; subcategory: HdSubcategory | null } | null;
  services: HdService[];
  onEditService: (service: HdService) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryActive, setCategoryActive] = useState(true);
  const [subcategoryName, setSubcategoryName] = useState("");
  const [subcategoryActive, setSubcategoryActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setCategoryName(entry?.category.name ?? "");
    setCategoryActive(entry?.category.active ?? true);
    setSubcategoryName(entry?.subcategory?.name ?? "");
    setSubcategoryActive(entry?.subcategory?.active ?? true);
  }, [entry]);

  const save = async () => {
    if (!entry || !categoryName.trim()) {
      toast.error("Category name is required.");
      return;
    }
    if (entry.subcategory && !subcategoryName.trim()) {
      toast.error("Sub-category name is required.");
      return;
    }
    setSaving(true);
    try {
      await catalogService.saveCategory({
        ...entry.category,
        name: categoryName.trim(),
        active: categoryActive,
      });
      if (entry.subcategory) {
        await catalogService.saveSubcategory({
          ...entry.subcategory,
          name: subcategoryName.trim(),
          active: subcategoryActive,
        });
      }
      toast.success("Category details saved");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save category details.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry?.subcategory) return;
    const itemName = entry.subcategory.name;
    if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await catalogService.deleteSubcategory(entry.subcategory.id);
      toast.success("Sub-category deleted");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete this catalog item.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry?.subcategory ? "Edit category and sub-category" : "Edit category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          </div>
          {entry?.subcategory ? (
            <div className="space-y-1.5">
              <Label>Sub-category</Label>
              <Input
                value={subcategoryName}
                onChange={(event) => setSubcategoryName(event.target.value)}
              />
            </div>
          ) : null}
          {services.length ? (
            <div className="space-y-2">
              <Label>Services for this category</Label>
              <div className="divide-y rounded-lg border">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-[13px]">{service.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={`Edit ${service.name}`}
                      aria-label={`Edit service ${service.name}`}
                      onClick={() => onEditService(service)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[13px]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={categoryActive}
                onChange={(event) => setCategoryActive(event.target.checked)}
              />
              Category active
            </label>
            {entry?.subcategory ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={subcategoryActive}
                  onChange={(event) => setSubcategoryActive(event.target.checked)}
                />
                Sub-category active
              </label>
            ) : null}
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {entry?.subcategory ? (
              <Button
                variant="destructive"
                disabled={saving || deleting}
                onClick={() => void remove()}
              >
                <Trash2 className="size-4" />
                {deleting ? "Deleting…" : "Delete sub-category"}
              </Button>
            ) : null}
          </div>
          <Button disabled={saving || deleting} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({
  open,
  service,
  categories,
  subcategories,
  providers,
  onClose,
  onSaved,
}: {
  open: boolean;
  service: HdService | null;
  categories: HdCategory[];
  subcategories: HdSubcategory[];
  providers: HdProvider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setCategoryId(service?.category_id ?? "");
    setSubcategoryId(service?.subcategory_id ?? "");
    setName(service?.name ?? "");
    setProviderId(service?.provider_id ?? "");
    setEvidenceRequired(service?.evidence_required ?? true);
    setActive(service?.active ?? true);
  }, [service, open]);

  const subs = subcategories.filter((s) => s.category_id === categoryId);

  const save = async () => {
    if (!categoryId || !name.trim()) {
      toast.error("Category and service name are required.");
      return;
    }
    setSaving(true);
    try {
      await catalogService.saveService({
        ...(service?.id ? { id: service.id } : {}),
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        name: name.trim(),
        provider_id: providerId || null,
        evidence_required: evidenceRequired,
        active,
      });
      toast.success("Service saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the service.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!service || !window.confirm(`Delete service "${service.name}"? This cannot be undone.`))
      return;
    setDeleting(true);
    try {
      await catalogService.deleteService(service.id);
      toast.success("Service deleted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete the service.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Edit service mapping" : "Add service"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v);
                  setSubcategoryId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sub-category</Label>
              <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {subs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Service name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AC Not Cooling"
            />
          </div>
          {service ? (
            <div className="space-y-1.5">
              <Label>Service provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex items-center gap-6 pt-1 text-[13px]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={evidenceRequired}
                onChange={(e) => setEvidenceRequired(e.target.checked)}
              />{" "}
              Evidence required before closing
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />{" "}
              Active
            </label>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {service ? (
            <Button
              variant="destructive"
              disabled={saving || deleting}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" /> {deleting ? "Deleting…" : "Delete service"}
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
