import { useMemo, useState } from "react";
import { aggregateGrid, type CellAgg, type PeriodColumn } from "@/lib/latencyPeriod";
import { compareValues, type SortDir } from "@/lib/sortable";
import { cn } from "@/lib/utils";

export function LatencyPeriodGrid({
  rows,
  columns,
  cells,
  unit = "ms",
  rowHeader = "Target",
}: {
  rows: string[];
  columns: PeriodColumn[];
  cells: Map<string, CellAgg>;
  unit?: string;
  rowHeader?: string;
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
      const av = cells.get(`${a}::${sortKey}`)?.avg ?? null;
      const bv = cells.get(`${b}::${sortKey}`)?.avg ?? null;
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
      <p className="text-sm text-[var(--color-muted-foreground)]">No period columns for this range.</p>
    );
  }

  const values = [...cells.values()]
    .map((c) => c.avg)
    .filter((v): v is number => v != null && Number.isFinite(v));
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
            <tr key={row} className="border-t border-[var(--color-border)]">
              <td className="sticky left-0 z-10 max-w-[180px] truncate bg-[var(--color-card)] px-2 py-1.5 font-medium">
                {row}
              </td>
              {columns.map((col) => {
                const cell = cells.get(`${row}::${col.key}`);
                const avg = cell?.avg ?? null;
                const min = cell?.min ?? null;
                const maxVal = cell?.max ?? null;
                const count = cell?.count ?? 0;
                const intensity =
                  avg != null && max > 0 ? Math.min(1, avg / max) : 0;
                const tip =
                  avg != null
                    ? [
                        `avg ${avg.toFixed(1)} ${unit}`,
                        min != null ? `min ${min.toFixed(1)} ${unit}` : null,
                        maxVal != null ? `max ${maxVal.toFixed(1)} ${unit}` : null,
                        `${count} sample${count === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "No data";
                return (
                  <td
                    key={col.key}
                    title={tip}
                    className={cn(
                      "px-1.5 py-1.5 text-center tabular-nums",
                      avg == null && "text-[var(--color-muted-foreground)]/40",
                    )}
                    style={
                      avg != null
                        ? {
                            backgroundColor: `rgba(61, 156, 240, ${0.08 + intensity * 0.35})`,
                          }
                        : undefined
                    }
                  >
                    {avg != null ? Math.round(avg) : "—"}
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
                No targets
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export { aggregateGrid };
