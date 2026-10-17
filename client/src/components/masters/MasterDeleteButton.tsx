import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function MasterDeleteButton({
  name,
  description = "This action cannot be undone.",
  onDelete,
}: {
  name: string;
  description?: string;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to delete ${name}.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title={`Delete ${name}`}
        aria-label={`Delete ${name}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4 text-danger" />
      </Button>
      <AlertDialog open={open} onOpenChange={(nextOpen) => !deleting && setOpen(nextOpen)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
