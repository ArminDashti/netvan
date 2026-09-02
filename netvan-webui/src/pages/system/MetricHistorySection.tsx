import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { HistoryFilter } from "@/components/HistoryFilter";
import { LatencyPeriodGrid } from "@/components/LatencyPeriodGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HistoryRange, MetricSummary, SystemMetricPoint } from "@/lib/api";
import { aggregateGrid, buildPeriodColumns } from "@/lib/latencyPeriod";
import { formatPercent } from "@/lib/systemMetrics";
import { formatHistoryAxisLabel } from "@/lib/utils";

function utilizationChartOption(
  points: SystemMetricPoint[],
  range: HistoryRange,
) {
  return {
    backgroundColor: "transparent",
    textStyle: { color: "#8b9bb4" },
    grid: { left: 48, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: points.map((p) => formatHistoryAxisLabel(p.ts, range)),
      axisLabel: { color: "#8b9bb4", hideOverlap: true },
    },
    yAxis: {
      type: "value",
      name: "%",
      min: 0,
      max: 100,
      axisLabel: { color: "#8b9bb4" },
      splitLine: { lineStyle: { color: "#243049" } },
    },
    series: [
      {
        name: "Utilization",
        type: "line",
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.12 },
        data: points.map((p) => Number(p.value.toFixed(2))),
        color: "#3d9cf0",
      },
    ],
  };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="py-3 pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function MetricHistorySection({
  range,
  onRange,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  series,
  summary,
  rowLabel = "Utilization",
  showSummaryStats = true,
}: {
  range: HistoryRange;
  onRange: (r: HistoryRange) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
  series: SystemMetricPoint[];
  summary: MetricSummary;
  rowLabel?: string;
  showSummaryStats?: boolean;
}) {
  const columns = useMemo(
    () => buildPeriodColumns(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  const cells = useMemo(
    () =>
      aggregateGrid(
        [rowLabel],
        columns,
        series.map((p) => ({
          ts: p.ts,
          value: p.value,
          rowKey: rowLabel,
        })),
      ),
    [rowLabel, columns, series],
  );

  const option = useMemo(
    () => utilizationChartOption(series, range),
    [series, range],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">History</h2>
        <HistoryFilter
          value={range}
          onChange={onRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={onCustomStart}
          onCustomEnd={onCustomEnd}
        />
      </div>

      {showSummaryStats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Average" value={formatPercent(summary.avg)} />
          <StatCard label="Min" value={formatPercent(summary.min)} />
          <StatCard label="Max" value={formatPercent(summary.max)} />
        </div>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
              No samples for this range yet.
            </p>
          ) : (
            <ReactECharts option={option} style={{ height: 240 }} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Period averages</CardTitle>
        </CardHeader>
        <CardContent>
          <LatencyPeriodGrid
            rows={[rowLabel]}
            columns={columns}
            cells={cells}
            unit="%"
            rowHeader="Metric"
          />
        </CardContent>
      </Card>
    </div>
  );
}
