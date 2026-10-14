import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface FilterOption {
  value: string;
  label: string;
}

/** Reference-style table container: filter bar on top, table, pagination footer. */
export function TableCard({
  search,
  onSearch,
  placeholder = "Search",
  filterValue,
  onFilter,
  filterOptions,
  filterClassName = "w-[190px]",
  toolbarClassName = "gap-2 p-4",
  extra,
  footer,
  children,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  filterValue?: string;
  onFilter?: (v: string) => void;
  filterOptions?: FilterOption[];
  filterClassName?: string;
  toolbarClassName?: string;
  extra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const showBar = onSearch || onFilter || extra;
  return (
    <div className="surface-card overflow-hidden">
      {showBar ? (
        <div className={`flex flex-wrap items-center border-b border-border ${toolbarClassName}`}>
          {onSearch ? (
            <div className="relative min-w-52.5 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="pl-9" />
            </div>
          ) : null}
          {onFilter && filterOptions ? (
            <Select value={filterValue ?? ""} onValueChange={onFilter}>
              <SelectTrigger className={filterClassName}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {filterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {extra}
        </div>
      ) : null}
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </div>
  );
}

export function usePaged<T>(rows: T[], pageSize = 8) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const slice = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize]);
  const footer =
    rows.length > 0 ? (
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
        <span>
          Showing {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, rows.length)} of {rows.length}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 font-semibold text-foreground">
            {current} / {pages}
          </span>
          <Button variant="outline" size="icon" className="size-8" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    ) : null;
  return { rows: slice, footer, reset: () => setPage(1) };
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-14 text-center text-[13px] text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
