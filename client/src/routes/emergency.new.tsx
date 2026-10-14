import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Siren } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VMS_BRANCH_FILTERS } from "@/constants/vms-filters";
import { useApp } from "@/context/app-context";
import {
  canManageEmergency,
  configService,
  incidentService,
  EMG_ERRORS,
  type Incident,
} from "@/services/emergency";

export const Route = createFileRoute("/emergency/new")({
  component: NewIncident,
});

function NewIncident() {
  const { user } = useApp();
  const qc = useQueryClient();
  const canManage = canManageEmergency(user);
  const { data: types = [] } = useQuery({
    queryKey: ["emg-types"],
    queryFn: () => configService.types(),
    enabled: canManage,
  });
  const { data: points = [] } = useQuery({
    queryKey: ["emg-points"],
    queryFn: () => configService.assemblyPoints(),
    enabled: canManage,
  });
  const [f, setF] = useState({
    emergency_type: "",
    title: "",
    location: "",
    building: "",
    floor: "",
    area: "",
    description: "",
    assembly: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    incident: Incident;
    notified: number;
    emails_sent: number;
    emails_failed: number;
    emails_missing: number;
  } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  if (!canManage)
    return <p className="text-muted-foreground">Only Admin or HSE can trigger emergencies.</p>;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const assembly = points.find((p) => p.id === f.assembly);
    if (!f.emergency_type || !f.location.trim() || !f.building.trim() || !assembly) {
      toast.error("Choose the type, location, building and assembly point.");
      return;
    }
    const title = f.title.trim() || `${f.emergency_type} emergency`;
    if (
      !window.confirm(
        `Trigger ${f.emergency_type} at ${f.location.trim()}, ${f.building.trim()}? All active users except Admin, HSE, and Fire Warden will receive an in-app and email alert. Assembly point: ${assembly.name}.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await incidentService.create(
        { ...f, title, location: f.location.trim(), building: f.building.trim(), assembly },
        user!,
      );
      await qc.invalidateQueries();
      setDone(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : EMG_ERRORS.create);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="surface-card mx-auto max-w-md space-y-3 p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h2 className="font-display text-[22px] font-bold">
          Emergency incident created successfully
        </h2>
        <p>
          Incident ID: <span className="font-mono font-bold">{done.incident.incident_no}</span>
        </p>
        <p>Status: Active</p>
        <p className="text-[14px] text-muted-foreground">
          {done.notified} responders received an in-app alert. {done.emails_sent} email alerts sent.
          {done.emails_failed ? ` ${done.emails_failed} emails could not be sent.` : ""}
          {done.emails_missing ? ` ${done.emails_missing} responders have no email address.` : ""}
        </p>
        <Button asChild>
          <Link to="/emergency/$id" params={{ id: done.incident.id }}>
            Monitor incident
          </Link>
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Emergency Evacuation"
        title="Trigger Emergency"
        subtitle="Confirm the incident details before activating the employee alert."
      />
      <form onSubmit={submit} className="surface-card grid gap-4 p-6 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Incident type *</Label>
          <Select value={f.emergency_type} onValueChange={set("emergency_type")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Incident title</Label>
          <Input
            value={f.title}
            maxLength={120}
            onChange={(e) => set("title")(e.target.value)}
            placeholder="e.g. Fire on Floor 2"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Location *</Label>
          <Select value={f.location} onValueChange={set("location")}>
            <SelectTrigger>
              <SelectValue placeholder="Choose office" />
            </SelectTrigger>
            <SelectContent>
              {VMS_BRANCH_FILTERS.map((location) => (
                <SelectItem key={location.value} value={location.value}>
                  {location.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Building *</Label>
          <Input
            value={f.building}
            maxLength={80}
            onChange={(e) => set("building")(e.target.value)}
            placeholder="Bengaluru Office / Building A"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>Floor</Label>
            <Input value={f.floor} maxLength={20} onChange={(e) => set("floor")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Area</Label>
            <Input value={f.area} maxLength={60} onChange={(e) => set("area")(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Safe assembly point *</Label>
          <Select value={f.assembly} onValueChange={set("assembly")}>
            <SelectTrigger>
              <SelectValue placeholder="Where employees should go" />
            </SelectTrigger>
            <SelectContent>
              {points.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.location ? ` — ${p.location}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={f.description}
            maxLength={500}
            rows={3}
            onChange={(e) => set("description")(e.target.value)}
            placeholder="Emergency evacuation required."
          />
        </div>
        <p className="text-[13px] text-muted-foreground sm:col-span-2">
          All active users except Admin, HSE, and Fire Warden receive an alert and can record their
          safety response.
        </p>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="destructive" disabled={busy}>
            <Siren className="size-4" /> {busy ? "Triggering…" : "Trigger Emergency"}
          </Button>
        </div>
      </form>
    </div>
  );
}
