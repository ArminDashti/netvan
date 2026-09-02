import { useMemo, useState } from "react";
import { type CellAgg, type PeriodColumn } from "@/lib/latencyPeriod";
import { compareValues, type SortDir } from "@/lib/sortable";
import { cn } from "@/lib/utils";

function formatCellGb(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 10) return gb.toFixed(1);
  if (gb >= 1) return gb.toFixed(2);
  if (gb >= 0.01) return gb.toFixed(2);
  if (bytes > 0) return "<0.01";
  return "0";
}

export function UsagePeriodGrid({
  rows,
  columns,
  cells,
  rowHeader = "Name",
  onRowContextMenu,
}: {
  rows: string[];
  columns: PeriodColumn[];
  cells: Map<string, CellAgg>;
  rowHeader?: string;
  onRowContextMenu?: (row: string, e: React.MouseEvent) => void;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "__row__") {
        return dir * compareValues(a, b);
      }
      const av = cells.get(`${a}::${sortKey}`)?.sum ?? cells.get(`${a}::${sortKey}`)?.avg ?? null;
      const bv = cells.get(`${b}::${sortKey}`)?.sum ?? cells.get(`${b}::${sortKey}`)?.avg ?? null;
      return dir * compareValues(av, bv);
    });
  }, [rows, cells, sortKey, sortDir]);

  const toggle = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
    setSortDir("asc");
  };

  const marker = (key: string) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (columns.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No period columns for this range.
      </p>
    );
  }

  const values = [...cells.values()]
    .map((c) => c.sum ?? c.avg)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const max = values.length ? Math.max(...values) : 0;

  return (
    <div className="overflow-auto rounded-md border border-[var(--color-border)]">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-[var(--color-muted)]/50">
            <th
              className="sticky left-0 z-10 cursor-pointer select-none bg-[var(--color-card)] px-2 py-1.5 text-left font-medium hover:text-[var(--color-foreground)]"
              onClick={() => toggle("__row__")}
              title="Sort"
            >
              {rowHeader}
              <span className="text-[10px] opacity-70">{marker("__row__")}</span>
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="min-w-[2.5rem] cursor-pointer select-none px-1.5 py-1.5 text-center font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                onClick={() => toggle(c.key)}
                title="Sort"
              >
                {c.label}
                <span className="text-[10px] opacity-70">{marker(c.key)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row}
              className="border-t border-[var(--color-border)]"
              onContextMenu={(e) => {
                if (!onRowContextMenu) return;
                e.preventDefault();
                onRowContextMenu(row, e);
              }}
            >
              <td className="sticky left-0 z-10 max-w-[180px] truncate bg-[var(--color-card)] px-2 py-1.5 font-medium">
                {row}
              </td>
              {columns.map((col) => {
                const cell = cells.get(`${row}::${col.key}`);
                const sum = cell?.sum ?? cell?.avg ?? null;
                const count = cell?.count ?? 0;
                const intensity =
                  sum != null && max > 0 ? Math.min(1, sum / max) : 0;
                return (
                  <td
                    key={col.key}
                    title={
                      sum != null
                        ? `${formatCellGb(sum)} GB · ${count} sample${count === 1 ? "" : "s"}`
                        : "No data"
                    }
                    className={cn(
                      "px-1.5 py-1.5 text-center tabular-nums",
                      sum == null && "text-[var(--color-muted-foreground)]/40",
                    )}
                    style={
                      sum != null
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--color-primary) ${Math.round(8 + intensity * 35)}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {sum != null ? formatCellGb(sum) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-3 py-6 text-center text-[var(--color-muted-foreground)]"
              >
                No usage samples yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
