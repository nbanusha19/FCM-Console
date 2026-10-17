import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface MasterViewField {
  label: string;
  value: ReactNode;
}

export function MasterViewDialog({
  open,
  onOpenChange,
  title,
  description = "Record details",
  fields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: MasterViewField[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0 rounded-lg border border-border p-3">
              <dt className="text-[11px] font-medium text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{field.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
