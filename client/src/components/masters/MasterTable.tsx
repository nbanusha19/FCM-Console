import { useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Pill } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  mono?: boolean;
}

export function MasterTable<T extends { id: string; status?: string }>({
  title,
  description,
  rows,
  columns,
  searchOf,
  onAdd,
  onEdit,
  onDelete,
  addLabel = "Add new",
  compact = false,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: Column<T>[];
  searchOf: (row: T) => string;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  addLabel?: string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<T | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => searchOf(r).toLowerCase().includes(q)) : rows;

  return (
    <section className="surface-card overflow-hidden">
      <div className={`flex flex-wrap items-center border-b border-border ${compact ? "gap-2 px-3 py-2" : "gap-3 px-5 py-4"}`}>
        <div className="min-w-0 flex-1">
          <h2 className={`font-display font-bold tracking-tight ${compact ? "text-[11px]" : "text-[15px]"}`}>{title}</h2>
          {description ? <p className={compact ? "text-[9px] text-muted-foreground" : "text-[12px] text-muted-foreground"}>{description}</p> : null}
        </div>
        <div className={`relative ${compact ? "w-32" : "w-full sm:w-56"}`}>
          <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ${compact ? "left-2.5 size-3" : "left-3 size-4"}`} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className={compact ? "h-7 pl-7 text-[10px]" : "pl-9"} />
        </div>
        {onAdd ? (
          <Button size={compact ? "sm" : "default"} className={compact ? "h-7 px-2 text-[9px]" : undefined} onClick={onAdd}>
            <Plus className={compact ? "size-3" : "size-4"} /> {addLabel}
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Database} title="No records" description="Add a record to get started." />
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full min-w-160 text-left ${compact ? "text-[10px]" : "text-[13px]"}`}>
            <thead>
              <tr className={`border-b border-border bg-muted/40 uppercase tracking-[0.08em] text-muted-foreground ${compact ? "text-[8px]" : "text-[11px]"}`}>
                {columns.map((c) => (
                  <th key={c.key} className={`font-semibold ${compact ? "px-3 py-1.5" : "px-5 py-2.5"}`}>
                    {c.label}
                  </th>
                ))}
                <th className={`font-semibold ${compact ? "px-3 py-1.5" : "px-5 py-2.5"}`}>Status</th>
                {onEdit || onDelete ? <th className={`text-right font-semibold ${compact ? "px-3 py-1.5" : "px-5 py-2.5"}`}>Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c.key} className={`${compact ? "px-3 py-2" : "px-5 py-3"} ${c.mono ? "font-mono text-[12px]" : ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                  <td className={compact ? "px-3 py-2" : "px-5 py-3"}>
                    <Pill className={compact ? "px-1.5 py-0.5 text-[8px]" : undefined} tone={row.status === "INACTIVE" ? "neutral" : "success"}>
                      {row.status === "INACTIVE" ? "Inactive" : "Active"}
                    </Pill>
                  </td>
                  {onEdit || onDelete ? (
                    <td className={compact ? "px-3 py-2" : "px-5 py-3"}>
                      <div className="flex justify-end gap-1.5">
                        {onEdit ? (
                          <Button size="icon" variant="ghost" className={compact ? "size-6" : undefined} onClick={() => onEdit(row)} aria-label="Edit">
                            <Pencil className={compact ? "size-3" : "size-4"} />
                          </Button>
                        ) : null}
                        {onDelete ? (
                          <Button size="icon" variant="ghost" className={compact ? "size-6" : undefined} onClick={() => setPending(row)} aria-label="Delete">
                            <Trash2 className={compact ? "size-3 text-danger" : "size-4 text-danger"} />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record. Existing visits keep their stored details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending && onDelete) onDelete(pending);
                setPending(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
