import { useEffect, useState } from "react";
import { customToTs } from "@/components/HistoryFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  rpc,
  type CpuSnapshot,
  type HistoryRange,
  type MetricSummary,
  type SystemMetricPoint,
  type ThermalSnapshot,
} from "@/lib/api";
import { formatPercent } from "@/lib/systemMetrics";
import { formatCelsius, pickCpuSensor } from "@/lib/thermal";
import { cn } from "@/lib/utils";
import { MetricHistorySection } from "./MetricHistorySection";

const emptySummary = (): MetricSummary => ({
  avg: null,
  min: null,
  max: null,
  sample_count: 0,
});

function UtilizationTank({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40",
        className,
      )}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-[var(--color-primary)]/70 transition-[height] duration-500 ease-out"
        style={{ height: `${pct}%` }}
      />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-0.5 px-2 py-2">
        {label && (
          <div className="text-[10px] text-[var(--color-muted-foreground)]">{label}</div>
        )}
        <div className="text-sm font-semibold tabular-nums drop-shadow-sm">
          {formatPercent(pct, 0)}
        </div>
      </div>
    </div>
  );
}

export function CpuPage() {
  const [snap, setSnap] = useState<CpuSnapshot | null>(null);
  const [cpuTemp, setCpuTemp] = useState<string>("—");
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
        const [r, t] = await Promise.all([
          rpc<{ type: "CpuSnapshot"; data: CpuSnapshot }>({
            method: "GetCpuSnapshot",
          }),
          rpc<{ type: "ThermalSnapshot"; data: ThermalSnapshot }>({
            method: "GetThermalSnapshot",
          }),
        ]);
        if (!alive) return;
        setSnap(r.data);
        setCpuTemp(formatCelsius(pickCpuSensor(t.data.sensors)?.celsius));
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
      type: "CpuHistory";
      data: { series: SystemMetricPoint[]; summary: MetricSummary };
    }>({
      method: "GetCpuHistory",
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
      <h2 className="text-xl font-semibold">CPU</h2>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Processor</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <Info label="Brand" value={snap?.brand || "—"} />
            <Info label="Vendor" value={snap?.vendor_id || "—"} />
            <Info
              label="Physical cores"
              value={snap?.physical_cores != null ? String(snap.physical_cores) : "—"}
            />
            <Info
              label="Logical cores"
              value={snap ? String(snap.logical_cores) : "—"}
            />
            <Info
              label="Frequency"
              value={
                snap?.frequency_mhz != null ? `${snap.frequency_mhz} MHz` : "—"
              }
            />
            <Info
              label="Utilization"
              value={formatPercent(snap?.utilization)}
            />
            <Info label="Temperature" value={cpuTemp} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Live</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-3rem)] min-h-[140px] flex-col">
            <UtilizationTank
              value={snap?.utilization ?? 0}
              label="utilization"
              className="min-h-[120px] flex-1"
            />
          </CardContent>
        </Card>
      </div>

      {snap && snap.per_core.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Per-core utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {snap.per_core.map((u, i) => (
                <UtilizationTank
                  key={i}
                  value={u}
                  label={`Core ${i}`}
                  className="h-24"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <MetricHistorySection
        range={range}
        onRange={setRange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        series={series}
        summary={summary}
        rowLabel="CPU"
        showSummaryStats={false}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
