import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function MasterStatusSwitch({
  active,
  name,
  onChange,
}: {
  active: boolean;
  name: string;
  onChange: (active: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [nextActive, setNextActive] = useState(active);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      await onChange(nextActive);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Switch
        checked={active}
        disabled={saving}
        className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-emerald-200"
        onCheckedChange={(checked) => {
          setNextActive(checked);
          setOpen(true);
        }}
        aria-label={`${active ? "Deactivate" : "Activate"} ${name}`}
      />
      <AlertDialog open={open} onOpenChange={(nextOpen) => !saving && setOpen(nextOpen)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to {nextActive ? "activate" : "deactivate"} this record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {name} will be {nextActive ? "available" : "unavailable"} for Helpdesk use.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button disabled={saving} onClick={() => void confirm()}>
              {saving ? "Updating…" : nextActive ? "Activate" : "Deactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
