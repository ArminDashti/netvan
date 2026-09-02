import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { customToTs } from "@/components/HistoryFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  rpc,
  type DiskKind,
  type DiskSnapshot,
  type HistoryRange,
  type MetricSummary,
  type SystemMetricPoint,
} from "@/lib/api";
import { formatBytes, formatPercent } from "@/lib/systemMetrics";
import { MetricHistorySection } from "./MetricHistorySection";

const emptySummary = (): MetricSummary => ({
  avg: null,
  min: null,
  max: null,
  sample_count: 0,
});

export function DiskPage({ kind }: { kind: DiskKind }) {
  const title = kind === "ssd" ? "SSD" : "HDD";
  const [disks, setDisks] = useState<DiskSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<HistoryRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [series, setSeries] = useState<SystemMetricPoint[]>([]);
  const [summary, setSummary] = useState<MetricSummary>(emptySummary);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await rpc<{ type: "Disks"; data: DiskSnapshot[] }>({
          method: "GetDisks",
          params: { kind },
        });
        if (!alive) return;
        setDisks(r.data);
        setError(null);
        setSelectedId((prev) => {
          if (prev && r.data.some((d) => d.id === prev)) return prev;
          return r.data[0]?.id ?? null;
        });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [kind]);

  useEffect(() => {
    if (!selectedId) {
      setSeries([]);
      setSummary(emptySummary());
      return;
    }
    const start_ts = range === "custom" ? customToTs(customStart) : null;
    const end_ts = range === "custom" ? customToTs(customEnd) : null;
    rpc<{
      type: "DiskHistory";
      data: { series: SystemMetricPoint[]; summary: MetricSummary };
    }>({
      method: "GetDiskHistory",
      params: {
        disk_id: selectedId,
        kind,
        range,
        start_ts,
        end_ts,
      },
    })
      .then((r) => {
        setSeries(r.data.series);
        setSummary(r.data.summary);
      })
      .catch(console.error);
  }, [selectedId, kind, range, customStart, customEnd]);

  const selected = disks.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {disks.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No {title} volumes detected.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Volumes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2 pt-0">
              {disks.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                    selectedId === d.id
                      ? "bg-[var(--color-muted)] font-medium"
                      : "hover:bg-[var(--color-muted)]/60",
                  )}
                >
                  <div className="truncate">{d.mount_point || d.name}</div>
                  <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {formatPercent(d.utilization, 0)} · {formatBytes(d.total_bytes)}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <Info label="Name" value={selected?.name || "—"} />
                <Info label="Mount" value={selected?.mount_point || "—"} />
                <Info label="File system" value={selected?.file_system || "—"} />
                <Info label="Kind" value={title} />
                <Info
                  label="Total"
                  value={selected ? formatBytes(selected.total_bytes) : "—"}
                />
                <Info
                  label="Used"
                  value={selected ? formatBytes(selected.used_bytes) : "—"}
                />
                <Info
                  label="Available"
                  value={selected ? formatBytes(selected.available_bytes) : "—"}
                />
                <Info
                  label="Utilization"
                  value={formatPercent(selected?.utilization)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Live</CardTitle>
              </CardHeader>
              <CardContent className="flex h-[calc(100%-3rem)] flex-col items-center justify-center gap-1">
                <div className="text-4xl font-semibold tabular-nums">
                  {formatPercent(selected?.utilization, 0)}
                </div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  used
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {selectedId && (
        <MetricHistorySection
          range={range}
          onRange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={setCustomStart}
          onCustomEnd={setCustomEnd}
          series={series}
          summary={summary}
          rowLabel={selected?.mount_point || selected?.name || title}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 break-words font-medium">{value}</div>
    </div>
  );
}

export function SsdPage() {
  return <DiskPage kind="ssd" />;
}

export function HddPage() {
  const [disks, setDisks] = useState<DiskSnapshot[] | null>(null);
  useEffect(() => {
    rpc<{ type: "Disks"; data: DiskSnapshot[] }>({
      method: "GetDisks",
      params: { kind: "hdd" },
    })
      .then((r) => setDisks(r.data))
      .catch(() => setDisks([]));
  }, []);
  if (disks != null && disks.length === 0) {
    return <Navigate to="/system/ssd" replace />;
  }
  return <DiskPage kind="hdd" />;
}
