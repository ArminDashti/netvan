import { useEffect, useState } from "react";
import { customToTs } from "@/components/HistoryFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  rpc,
  type HistoryRange,
  type MemorySnapshot,
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

export function MemoryPage() {
  const [snap, setSnap] = useState<MemorySnapshot | null>(null);
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
        const r = await rpc<{ type: "MemorySnapshot"; data: MemorySnapshot }>({
          method: "GetMemorySnapshot",
        });
        if (!alive) return;
        setSnap(r.data);
        setError(null);
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
  }, []);

  useEffect(() => {
    const start_ts = range === "custom" ? customToTs(customStart) : null;
    const end_ts = range === "custom" ? customToTs(customEnd) : null;
    rpc<{
      type: "MemoryHistory";
      data: { series: SystemMetricPoint[]; summary: MetricSummary };
    }>({
      method: "GetMemoryHistory",
      params: { range, start_ts, end_ts },
    })
      .then((r) => {
        setSeries(r.data.series);
        setSummary(r.data.summary);
      })
      .catch(console.error);
  }, [range, customStart, customEnd]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Memory</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">RAM</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <Info label="Total" value={snap ? formatBytes(snap.total_bytes) : "—"} />
            <Info label="Used" value={snap ? formatBytes(snap.used_bytes) : "—"} />
            <Info
              label="Available"
              value={snap ? formatBytes(snap.available_bytes) : "—"}
            />
            <Info
              label="Utilization"
              value={formatPercent(snap?.utilization)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Live</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-3rem)] flex-col items-center justify-center gap-1">
            <div className="text-4xl font-semibold tabular-nums">
              {formatPercent(snap?.utilization, 0)}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              utilization
            </div>
          </CardContent>
        </Card>
      </div>

      <MetricHistorySection
        range={range}
        onRange={setRange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        series={series}
        summary={summary}
        rowLabel="Memory"
      />
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
