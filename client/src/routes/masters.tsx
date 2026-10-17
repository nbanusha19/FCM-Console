import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { MasterTable } from "@/components/masters/MasterTable";
import { BranchMaster } from "@/components/masters/BranchMaster";
import { Pill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABEL } from "@/constants/nav";
import { Eye, EyeOff } from "lucide-react";
import { useApp } from "@/context/app-context";
import { useVms } from "@/hooks/use-vms";
import { ApiError } from "@/lib/api";
import type { AppUser, Branch, RoleKey, RoleMaster, Status } from "@/lib/types";
import { listBranches } from "@/services/branches";
import { KEYS, saveData } from "@/services/storage";
import { listRoles, updateRole } from "@/services/roles";
import { createUser, deleteUser, listUsers, updateUser } from "@/services/users";
import { branchName } from "@/services/vms";
import { DEFAULT_ROLES } from "@/data/defaults";

const MASTER_TABS = ["branches", "users", "roles", "reference"] as const;

type MasterTab = (typeof MASTER_TABS)[number];

export const Route = createFileRoute("/masters")({
  validateSearch: (search: Record<string, unknown>): { tab: MasterTab } => {
    const tab = typeof search["tab"] === "string" ? search["tab"] : "branches";
    return { tab: (MASTER_TABS as readonly string[]).includes(tab) ? (tab as MasterTab) : "branches" };
  },
  head: () => ({
    meta: [
      { title: "Master Data — VMS" },
      {
        name: "description",
        content: "Manage branches, users, roles and visitor types.",
      },
      { property: "og:title", content: "Master Data — VMS" },
      { property: "og:description", content: "Branches, users and roles." },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <MastersPage />
    </AppPage>
  ),
});

type Entity = "user" | "role";

const STATUS_OPTIONS: Status[] = ["ACTIVE", "INACTIVE"];
const ROLE_OPTIONS: RoleKey[] = [
  "ADMIN",
  "BRANCH_MANAGER",
  "SECURITY",
  "EMPLOYEE",
  "HSE",
  "FIRE_WARDEN",
  "SERVICE_PROVIDER",
];

function rowStr(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value);
}

function rowVal<T>(row: Record<string, unknown>, key: string): T {
  return row[key] as T;
}

function MastersPage() {
  const { user, refresh } = useApp();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { branches, visitorTypes, roles, users } = useVms();
  const [editing, setEditing] = useState<{ entity: Entity; row: Record<string, unknown> } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadApiMasters = useCallback(async () => {
    const [nextBranches, nextUsers, fetchedRoles] = await Promise.all([
      listBranches(true),
      listUsers(),
      listRoles(true),
    ]);
    const nextRoles = fetchedRoles.some((role) => role.key === "FIRE_WARDEN")
      ? fetchedRoles
      : [...fetchedRoles, DEFAULT_ROLES.find((role) => role.key === "FIRE_WARDEN")!];
    saveData(KEYS.branches, nextBranches);
    saveData(KEYS.users, nextUsers);
    saveData(KEYS.roles, nextRoles);
    refresh();
  }, [refresh]);

  useEffect(() => {
    void loadApiMasters().catch((err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not load master data from the server.");
    });
  }, [loadApiMasters]);

  const save = async (entity: Entity, row: Record<string, unknown>) => {
    if (!user) return;
    setSaving(true);
    try {
      if (entity === "user") {
        const password = rowStr(row, "password");
        const payload = {
          name: rowStr(row, "name"),
          email: rowStr(row, "email"),
          role: rowVal<RoleKey>(row, "role"),
          branchId: rowVal<string | null>(row, "branchId") ?? null,
          phone: rowStr(row, "phone"),
          status: rowVal<Status>(row, "status") || "ACTIVE",
        };
        const id = rowStr(row, "id");
        if (id) {
          await updateUser(id, { ...payload, ...(password ? { password } : {}) });
        } else {
          if (!password) throw new ApiError("Password is required", 400);
          await createUser({ ...payload, password });
        }
        await loadApiMasters();
        toast.success("User saved");
      } else if (entity === "role") {
        await updateRole(rowStr(row, "id"), {
          name: rowStr(row, "name"),
          description: rowStr(row, "description"),
          status: rowVal<Status>(row, "status") || "ACTIVE",
        });
        await loadApiMasters();
        toast.success("Role saved");
      }
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save this record.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entity: Entity, id: string) => {
    if (!user) return;
    try {
      if (entity === "user") {
        if (id === user.id) {
          toast.error("You cannot delete the account you are signed in with");
          return;
        }
        await deleteUser(id);
        await loadApiMasters();
        toast.success("User deleted");
        return;
      }
      if (entity === "role") return;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete this record.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] text-muted-foreground">Administration</p>
        <h1 className="mt-0.5 font-display text-[22px] font-extrabold leading-tight">Master data</h1>
        <p className="mt-1 text-[11px] text-muted-foreground">Everything the request and gate workflow depends on.</p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => navigate({ search: { tab: value as MasterTab } })}
      >
        <TabsList className="h-8 flex-wrap gap-1 rounded-md bg-transparent p-0">
          <TabsTrigger value="branches" className="h-7 rounded-md border border-transparent px-2 text-[10px] data-[state=active]:border-border data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none">Branches</TabsTrigger>
          <TabsTrigger value="users" className="h-7 rounded-md border border-transparent px-2 text-[10px] data-[state=active]:border-border data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none">Users</TabsTrigger>
          <TabsTrigger value="roles" className="h-7 rounded-md border border-transparent px-2 text-[10px] data-[state=active]:border-border data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none">Roles</TabsTrigger>
          <TabsTrigger value="reference" className="h-7 rounded-md border border-transparent px-2 text-[10px] data-[state=active]:border-border data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-none">Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="branches" className="mt-4">
          <BranchMaster onChanged={loadApiMasters} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <MasterTable<AppUser>
            title="Users"
            description={`${users.length} login accounts`}
            rows={users}
            searchOf={(u) => `${u.name} ${u.email} ${ROLE_LABEL[u.role] ?? u.role}`}
            columns={[
              { key: "name", label: "Name", render: (u) => u.name },
              { key: "email", label: "Email", render: (u) => u.email },
              { key: "phone", label: "Phone", render: (u) => u.phone || "—" },
              { key: "role", label: "Role", render: (u) => <Pill tone="info">{ROLE_LABEL[u.role] ?? u.role}</Pill> },
              { key: "branch", label: "Branch", render: (u) => (u.branchId ? branchName(u.branchId) : "All branches") },
            ]}
            addLabel="Add user"
            onAdd={() =>
              setEditing({
                entity: "user",
                row: {
                  id: "",
                  name: "",
                  email: "",
                  password: "",
                  role: "EMPLOYEE",
                  branchId: null,
                  phone: "",
                  status: "ACTIVE",
                },
              })
            }
            onEdit={(row) => setEditing({ entity: "user", row: { id: row.id, name: row.name, email: row.email, password: "", role: row.role, branchId: row.branchId, phone: row.phone ?? "", status: row.status } })}
            onDelete={(row) => void remove("user", row.id)}
          />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <MasterTable<RoleMaster>
            title="Roles"
            description="Role master used for login and access"
            rows={roles}
            searchOf={(r) => `${r.key} ${r.name} ${r.description}`}
            columns={[
              { key: "key", label: "Key", mono: true, render: (r) => r.key },
              { key: "name", label: "Role", render: (r) => r.name },
              { key: "description", label: "Description", render: (r) => r.description },
            ]}
            onEdit={(row) => setEditing({ entity: "role", row: { ...row } })}
          />
        </TabsContent>

        <TabsContent value="reference" className="mt-4">
          <section className="surface-card p-5">
            <h2 className="font-display text-[15px] font-bold tracking-tight">Visitor types</h2>
            <ul className="mt-3 divide-y divide-border">
              {visitorTypes.map((t) => (
                <li key={t.id} className="py-2.5">
                  <p className="text-[13px] font-semibold">{t.name}</p>
                  <p className="text-[12px] text-muted-foreground">{t.description}</p>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="max-w-lg">
          {editing ? (
            <MasterForm
              entity={editing.entity}
              row={editing.row}
              saving={saving}
              onChange={(row) => setEditing({ entity: editing.entity, row })}
              onSave={() => void save(editing.entity, editing.row)}
              branches={branches}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MasterForm({
  entity,
  row,
  saving,
  onChange,
  onSave,
  branches,
}: {
  entity: Entity;
  row: Record<string, unknown>;
  saving: boolean;
  onChange: (row: Record<string, unknown>) => void;
  onSave: () => void;
  branches: Branch[];
}) {
  const [showPassword, setShowPassword] = useState(false);
  const set = (key: string, value: unknown) => onChange({ ...row, [key]: value });
  const str = (key: string) => (row[key] as string) ?? "";
  const isNew = !str("id");
  const rowId = row["id"];

  useEffect(() => {
    setShowPassword(false);
  }, [entity, rowId]);

  const titleMap: Record<Entity, string> = {
    user: "User",
    role: "Role",
  };

  const apiBacked = true;

  return (
    <form
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <DialogHeader>
        <DialogTitle>{titleMap[entity]} details</DialogTitle>
        <DialogDescription>
          {apiBacked ? "Saved to the VMS database." : "Stored locally until this master is moved to the API."}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {entity === "user" ? (
          <>
            <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden className="sr-only" />
            <input type="password" name="password" autoComplete="current-password" tabIndex={-1} aria-hidden className="sr-only" />
            <Field
              label="Name"
              value={str("name")}
              onChange={(v) => set("name", v)}
              required
              autoComplete="off"
              name="vms-user-name"
            />
            <Field
              label="Email"
              value={str("email")}
              onChange={(v) => set("email", v)}
              type="email"
              required
              autoComplete="off"
              name="vms-user-email"
            />
            <Field
              label="Phone (WhatsApp)"
              value={str("phone")}
              onChange={(v) => set("phone", v)}
              autoComplete="off"
              name="vms-user-phone"
            />
            <PasswordField
              label={isNew ? "Password" : "Password (leave blank to keep)"}
              value={str("password")}
              onChange={(v) => set("password", v)}
              required={isNew}
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
            <Picker
              label="Role"
              value={str("role")}
              onChange={(v) => set("role", v)}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
            <Picker
              label="Branch"
              value={str("branchId") || "ALL"}
              onChange={(v) => set("branchId", v === "ALL" ? null : v)}
              options={[{ value: "ALL", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </>
        ) : null}

        {entity === "role" ? (
          <>
            <Field label="Key" value={str("key")} onChange={() => undefined} readOnly />
            <Field label="Name" value={str("name")} onChange={(v) => set("name", v)} required />
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea value={str("description")} onChange={(e) => set("description", e.target.value)} rows={2} />
            </div>
          </>
        ) : null}

        <Picker
          label="Status"
          value={str("status")}
          onChange={(v) => set("status", v)}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s === "ACTIVE" ? "Active" : "Inactive" }))}
        />
      </div>

      <DialogFooter className="mt-5">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
  required,
  readOnly,
  autoComplete,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  name?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        step={step}
        min={min}
        max={max}
        name={name}
        value={value}
        required={required}
        readOnly={readOnly}
        disabled={readOnly}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  required,
  visible,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          name="vms-user-password"
          value={value}
          required={required}
          autoComplete="new-password"
          className="pr-10"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
