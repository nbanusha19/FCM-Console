import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Visit } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisitorBadge } from "@/components/visits/VisitorBadge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/context/app-context";
import { saveVisitPhotoRequest } from "@/services/visits-api";
import { ApiError } from "@/lib/api";

export function PrintCardDialog({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, refresh } = useApp();
  const [current, setCurrent] = useState<Visit | null>(visit);
  const [includePhoto, setIncludePhoto] = useState(true);

  useEffect(() => {
    setCurrent(visit);
    setIncludePhoto(true);
  }, [visit]);

  const capturePhoto = async (dataUrl: string) => {
    if (!current || !user) return;
    try {
      const updated = await saveVisitPhotoRequest(current.id, dataUrl);
      refresh();
      setCurrent(updated);
      toast.success("Visitor photo added to the card");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the photo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Issue visitor card</DialogTitle>
          <DialogDescription>
            Capture the visitor photo if needed, then print this card for the visitor at the desk.
          </DialogDescription>
        </DialogHeader>
        {current ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 print:hidden">
              <Label htmlFor="include-photo" className="text-[13px]">
                Include visitor photo
              </Label>
              <Switch id="include-photo" checked={includePhoto} onCheckedChange={setIncludePhoto} />
            </div>
            {includePhoto && !current.photoUrl ? (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-[12px] font-medium text-warning print:hidden">
                Tap the photo box on the card to capture or upload the visitor photo before printing.
              </p>
            ) : null}
            <VisitorBadge
              visit={current}
              showPhoto={includePhoto}
              onPhotoCapture={includePhoto ? capturePhoto : undefined}
              onPrint={() => window.print()}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
