import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/app-context";
import { useVms } from "@/hooks/use-vms";
import type { AppSettings } from "@/lib/types";
import { saveSettings } from "@/services/vms";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "System Settings — VMS" },
      {
        name: "description",
        content:
          "Configure the visitor ID prefix, default branch, visit duration, approval requirement, visitor cards and notification rules.",
      },
      { property: "og:title", content: "System Settings — VMS" },
      { property: "og:description", content: "Approval rules, visitor IDs, cards and notifications." },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <SettingsPage />
    </AppPage>
  ),
});

function SettingsPage() {
  const { refresh } = useApp();
  const { settings, branches } = useVms();
  const [form, setForm] = useState<AppSettings>(settings);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setForm({ ...form, [key]: value });

  const submit = () => {
    saveSettings(form);
    refresh();
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        subtitle="Workflow rules applied across requests, approvals and the gate."
        actions={
          <Button onClick={submit}>
            <Save className="size-4" /> Save changes
          </Button>
        }
      />

      <section className="surface-card p-5">
        <h2 className="font-display text-[15px] font-bold tracking-tight">General</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Application name</Label>
            <Input value={form.appName} onChange={(e) => set("appName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Default branch</Label>
            <Select
              {...(form.defaultBranchId ? { value: form.defaultBranchId } : {})}
              onValueChange={(v) => set("defaultBranchId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Time zone</Label>
            <Input value={form.timeZone} onChange={(e) => set("timeZone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date format</Label>
            <Select value={form.dateFormat} onValueChange={(v) => set("dateFormat", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd MMM yyyy">dd MMM yyyy</SelectItem>
                <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Visitor ID prefix</Label>
            <Input
              value={form.visitorIdPrefix}
              className="font-mono"
              onChange={(e) => set("visitorIdPrefix", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default visit duration (minutes)</Label>
            <Input
              type="number"
              min={15}
              step={15}
              value={form.defaultVisitDurationMins}
              onChange={(e) => set("defaultVisitDurationMins", Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="surface-card p-5">
        <h2 className="font-display text-[15px] font-bold tracking-tight">Workflow rules</h2>
        <div className="mt-4 space-y-1">
          <Toggle
            label="Require approval before a Visitor ID is issued"
            hint="When off, employee requests are approved automatically."
            checked={form.requireApproval}
            onChange={(v) => set("requireApproval", v)}
          />
          <Toggle
            label="Issue a visitor card at check-in"
            hint="Security assigns a card from the pool and collects it at check-out."
            checked={form.enableVisitorCard}
            onChange={(v) => set("enableVisitorCard", v)}
          />
        </div>
      </section>

      <section className="surface-card p-5">
        <h2 className="font-display text-[15px] font-bold tracking-tight">Notifications</h2>
        <div className="mt-4 space-y-1">
          <Toggle
            label="Send the visitor invitation email"
            hint="An invitation email is sent when a request is approved."
            checked={form.notifyEmail}
            onChange={(v) => set("notifyEmail", v)}
          />
          <Toggle
            label="Notify on approval or rejection"
            checked={form.notifyApproval}
            onChange={(v) => set("notifyApproval", v)}
          />
          <Toggle label="Notify the host on check-in" checked={form.notifyCheckIn} onChange={(v) => set("notifyCheckIn", v)} />
          <Toggle label="Notify the host on check-out" checked={form.notifyCheckOut} onChange={(v) => set("notifyCheckOut", v)} />
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold">{label}</p>
        {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
