import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export type SortState<K extends string = string> = {
  key: K | null;
  dir: SortDir;
};

/** Compare helpers for sortable tables. */
export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") {
    if (!Number.isFinite(a) && !Number.isFinite(b)) return 0;
    if (!Number.isFinite(a)) return 1;
    if (!Number.isFinite(b)) return -1;
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function useSortableRows<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => unknown,
  initial?: SortState<K>,
) {
  const [sort, setSort] = useState<SortState<K>>(
    initial ?? { key: null, dir: "asc" },
  );

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * compareValues(getValue(a, key), getValue(b, key)),
    );
  }, [rows, sort, getValue]);

  const toggle = (key: K) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };

  return { sorted, sort, toggle };
}

export function SortableTh({
  label,
  active,
  dir,
  onClick,
  className,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const marker = active ? (dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      className={cn(
        "cursor-pointer select-none py-1.5 font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
        align === "left" && "pr-2 text-left",
        align === "center" && "px-1.5 text-center",
        align === "right" && "pl-2 text-right",
        className,
      )}
      onClick={onClick}
      title="Sort"
    >
      {label}
      <span className="text-[10px] opacity-70">{marker}</span>
    </th>
  );
}
