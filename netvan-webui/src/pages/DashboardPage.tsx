import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { HistoryFilter, customToTs } from "@/components/HistoryFilter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  rpc,
  type CpuSnapshot,
  type DiskSnapshot,
  type GpuInfo,
  type HardwareInventory,
  type HistoryRange,
  type MemorySnapshot,
  type NicInfo,
  type ThermalSensor,
  type ThermalSnapshot,
} from "@/lib/api";
import { formatBytes, formatPercent } from "@/lib/systemMetrics";
import { formatCelsius, otherSensors, pickCpuSensor, pickGpuSensors } from "@/lib/thermal";
import { formatHistoryAxisLabel, formatSpeedMb } from "@/lib/utils";

type ChartFilter = {
  range: HistoryRange;
  customStart: string;
  customEnd: string;
};

const defaultFilter = (): ChartFilter => ({
  range: "today",
  customStart: "",
  customEnd: "",
});

function nicPrimaryLabel(n: Pick<NicInfo, "name" | "description">) {
  return n.description?.trim() || n.name;
}

function nicSecondaryLabel(n: Pick<NicInfo, "name" | "description" | "media_type">) {
  if (n.description?.trim()) return `${n.media_type} · ${n.name}`;
  return n.media_type;
}

function usageDeltas(
  usage: { ts: number; rx_bytes: number; tx_bytes: number }[],
): { ts: number; rx: number; tx: number }[] {
  const out: { ts: number; rx: number; tx: number }[] = [];
  for (let i = 1; i < usage.length; i++) {
    const prev = usage[i - 1]!;
    const cur = usage[i]!;
    const rx = cur.rx_bytes >= prev.rx_bytes ? cur.rx_bytes - prev.rx_bytes : 0;
    const tx = cur.tx_bytes >= prev.tx_bytes ? cur.tx_bytes - prev.tx_bytes : 0;
    out.push({ ts: cur.ts, rx, tx });
  }
  return out;
}

function bandwidthLineOption(
  points: { ts: number; value: number }[],
  range: HistoryRange,
  name: string,
  color: string,
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
      axisLabel: { color: "#8b9bb4" },
      splitLine: { lineStyle: { color: "#243049" } },
    },
    series: [
      {
        name,
        type: "line",
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.12 },
        data: points.map((p) => p.value),
        color,
      },
    ],
  };
}

function latencyLineOption(
  points: { ts: number; value: number | null }[],
  range: HistoryRange,
  name: string,
  color: string,
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
      name: "ms",
      axisLabel: { color: "#8b9bb4" },
      splitLine: { lineStyle: { color: "#243049" } },
    },
    series: [
      {
        name,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: points.map((p) => p.value),
        color,
      },
    ],
  };
}

function ChartBlock({
  title,
  filter,
  onFilter,
  option,
}: {
  title: string;
  filter: ChartFilter;
  onFilter: (next: ChartFilter) => void;
  option: object;
}) {
  return (
    <Card>
      <CardHeader className="gap-2 space-y-0 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <HistoryFilter
          value={filter.range}
          onChange={(range) => onFilter({ ...filter, range })}
          customStart={filter.customStart}
          customEnd={filter.customEnd}
          onCustomStart={(customStart) => onFilter({ ...filter, customStart })}
          onCustomEnd={(customEnd) => onFilter({ ...filter, customEnd })}
        />
      </CardHeader>
      <CardContent>
        <ReactECharts option={option} style={{ height: 240 }} />
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [nics, setNics] = useState<NicInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [cpuUtil, setCpuUtil] = useState<number | null>(null);
  const [ramUtil, setRamUtil] = useState<number | null>(null);
  const [ramTotal, setRamTotal] = useState<number | null>(null);
  const [ssdUtil, setSsdUtil] = useState<number | null>(null);
  const [ssdLabel, setSsdLabel] = useState<string>("—");
  const [gpuBrief, setGpuBrief] = useState<string>("—");
  const [cpuTemp, setCpuTemp] = useState<string>("—");
  const [gpuTemps, setGpuTemps] = useState<{ label: string; value: string }[]>([]);
  const [otherTemps, setOtherTemps] = useState<ThermalSensor[]>([]);
  const [dlFilter, setDlFilter] = useState(defaultFilter);
  const [ulFilter, setUlFilter] = useState(defaultFilter);
  const [icmpFilter, setIcmpFilter] = useState(defaultFilter);
  const [httpFilter, setHttpFilter] = useState(defaultFilter);
  const [dlUsage, setDlUsage] = useState<{ ts: number; rx_bytes: number; tx_bytes: number }[]>([]);
  const [ulUsage, setUlUsage] = useState<{ ts: number; rx_bytes: number; tx_bytes: number }[]>([]);
  const [pingHist, setPingHist] = useState<{ ts: number; rtt_ms: number | null }[]>([]);
  const [httpHist, setHttpHist] = useState<{ ts: number; total_ms: number | null }[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [nicRes, cpuRes, memRes, ssdRes, thermalRes] = await Promise.all([
          rpc<{ type: "Nics"; data: NicInfo[] }>({ method: "ListNics" }),
          rpc<{ type: "CpuSnapshot"; data: CpuSnapshot }>({ method: "GetCpuSnapshot" }),
          rpc<{ type: "MemorySnapshot"; data: MemorySnapshot }>({
            method: "GetMemorySnapshot",
          }),
          rpc<{ type: "Disks"; data: DiskSnapshot[] }>({
            method: "GetDisks",
            params: { kind: "ssd" },
          }),
          rpc<{ type: "ThermalSnapshot"; data: ThermalSnapshot }>({
            method: "GetThermalSnapshot",
          }).catch(() => ({ type: "ThermalSnapshot" as const, data: { sensors: [] } })),
        ]);
        if (!alive) return;
        const list = nicRes.data.filter((n) => n.media_type !== "Loopback");
        setNics(list);
        setError(null);
        const primary = list.find((n) => n.oper_status === "Up") ?? list[0];
        setPrimaryId(primary?.id ?? null);
        setCpuUtil(cpuRes.data.utilization);
        setRamUtil(memRes.data.utilization);
        setRamTotal(memRes.data.total_bytes);
        const ssds = ssdRes.data;
        if (ssds.length > 0) {
          const avg =
            ssds.reduce((s, d) => s + d.utilization, 0) / ssds.length;
          setSsdUtil(avg);
          setSsdLabel(
            ssds.length === 1
              ? ssds[0]!.name || ssds[0]!.mount_point
              : `${ssds.length} volumes`,
          );
        } else {
          setSsdUtil(null);
          setSsdLabel("No SSD");
        }
        const sensors = thermalRes.data.sensors;
        setCpuTemp(formatCelsius(pickCpuSensor(sensors)?.celsius));
        setGpuTemps(
          pickGpuSensors(sensors).map((s) => ({
            label: s.hardware_name || s.sensor_name,
            value: formatCelsius(s.celsius),
          })),
        );
        setOtherTemps(otherSensors(sensors).slice(0, 8));
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
    rpc<{ type: "HardwareInventory"; data: HardwareInventory }>({
      method: "GetHardwareInventory",
    })
      .then((r) => {
        const g: GpuInfo | undefined = r.data.gpus[0];
        if (!g) {
          setGpuBrief("None");
          return;
        }
        const mem =
          g.memory_bytes != null ? ` · ${formatBytes(g.memory_bytes)}` : "";
        setGpuBrief(`${g.brand || g.model}${mem}`);
      })
      .catch(() => setGpuBrief("—"));
  }, []);
  useEffect(() => {
    if (!primaryId) return;
    const start_ts = dlFilter.range === "custom" ? customToTs(dlFilter.customStart) : null;
    const end_ts = dlFilter.range === "custom" ? customToTs(dlFilter.customEnd) : null;
    rpc<{
      type: "BandwidthHistory";
      data: { ts: number; rx_bytes: number; tx_bytes: number }[];
    }>({
      method: "GetBandwidthHistory",
      params: { nic_id: primaryId, range: dlFilter.range, start_ts, end_ts },
    }).then((r) => setDlUsage(r.data));
  }, [primaryId, dlFilter]);

  useEffect(() => {
    if (!primaryId) return;
    const start_ts = ulFilter.range === "custom" ? customToTs(ulFilter.customStart) : null;
    const end_ts = ulFilter.range === "custom" ? customToTs(ulFilter.customEnd) : null;
    rpc<{
      type: "BandwidthHistory";
      data: { ts: number; rx_bytes: number; tx_bytes: number }[];
    }>({
      method: "GetBandwidthHistory",
      params: { nic_id: primaryId, range: ulFilter.range, start_ts, end_ts },
    }).then((r) => setUlUsage(r.data));
  }, [primaryId, ulFilter]);

  useEffect(() => {
    const start_ts = icmpFilter.range === "custom" ? customToTs(icmpFilter.customStart) : null;
    const end_ts = icmpFilter.range === "custom" ? customToTs(icmpFilter.customEnd) : null;
    rpc<{
      type: "PingHistory";
      data: { ts: number; rtt_ms: number | null }[];
    }>({
      method: "GetPingHistory",
      params: { nic_id: null, range: icmpFilter.range, start_ts, end_ts },
    }).then((r) => setPingHist(r.data));
  }, [icmpFilter]);

  useEffect(() => {
    const start_ts = httpFilter.range === "custom" ? customToTs(httpFilter.customStart) : null;
    const end_ts = httpFilter.range === "custom" ? customToTs(httpFilter.customEnd) : null;
    rpc<{
      type: "HttpLatencyHistory";
      data: { ts: number; total_ms: number | null }[];
    }>({
      method: "GetHttpLatencyHistory",
      params: { nic_id: null, range: httpFilter.range, start_ts, end_ts },
    }).then((r) => setHttpHist(r.data));
  }, [httpFilter]);

  const totalDown = nics.reduce((s, n) => s + n.rx_bps, 0);
  const totalUp = nics.reduce((s, n) => s + n.tx_bps, 0);
  const nicUp = nics.filter((n) => n.oper_status === "Up").length;
  const nicBrief = nics.length
    ? `${nicUp}/${nics.length} up · ${formatSpeedMb(totalDown)}↓`
    : "—";

  const dlChart = useMemo(() => {
    const deltas = usageDeltas(dlUsage);
    return bandwidthLineOption(
      deltas.map((p) => ({ ts: p.ts, value: p.rx })),
      dlFilter.range,
      "Download",
      "#3d9cf0",
    );
  }, [dlUsage, dlFilter.range]);

  const ulChart = useMemo(() => {
    const deltas = usageDeltas(ulUsage);
    return bandwidthLineOption(
      deltas.map((p) => ({ ts: p.ts, value: p.tx })),
      ulFilter.range,
      "Upload",
      "#3ecf8e",
    );
  }, [ulUsage, ulFilter.range]);

  const icmpChart = useMemo(
    () =>
      latencyLineOption(
        pingHist.map((p) => ({ ts: p.ts, value: p.rtt_ms })),
        icmpFilter.range,
        "ICMP RTT",
        "#3d9cf0",
      ),
    [pingHist, icmpFilter.range],
  );

  const httpChart = useMemo(
    () =>
      latencyLineOption(
        httpHist.map((p) => ({ ts: p.ts, value: p.total_ms })),
        httpFilter.range,
        "HTTP total",
        "#e6b84d",
      ),
    [httpHist, httpFilter.range],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Live bandwidth and adapter status
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CPU</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatPercent(cpuUtil, 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>RAM</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatPercent(ramUtil, 0)}
            </CardTitle>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {ramTotal != null ? formatBytes(ramTotal) : "—"}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>SSD</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatPercent(ssdUtil, 0)}
            </CardTitle>
            <p className="truncate text-xs text-[var(--color-muted-foreground)]">
              {ssdLabel}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>NIC</CardDescription>
            <CardTitle className="text-lg leading-snug">{nicBrief}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>GPU</CardDescription>
            <CardTitle className="text-base leading-snug">{gpuBrief}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CPU temp</CardDescription>
            <CardTitle className="text-xl tabular-nums">{cpuTemp}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>GPU temp</CardDescription>
            <CardTitle className="text-base leading-snug">
              {gpuTemps.length === 0
                ? "—"
                : gpuTemps.map((g) => g.value).join(" · ")}
            </CardTitle>
            {gpuTemps.length > 0 && (
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                {gpuTemps.map((g) => g.label).join(" · ")}
              </p>
            )}
          </CardHeader>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription>Other sensors</CardDescription>
            <CardTitle className="text-sm font-normal leading-snug">
              {otherTemps.length === 0 ? (
                "—"
              ) : (
                <ul className="space-y-1">
                  {otherTemps.map((s) => (
                    <li key={s.id} className="flex justify-between gap-3 tabular-nums">
                      <span className="truncate text-[var(--color-muted-foreground)]">
                        {s.hardware_name || s.sensor_name}
                        {s.hardware_name ? ` · ${s.sensor_name}` : ""}
                      </span>
                      <span>{formatCelsius(s.celsius)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Download</CardDescription>
            <CardTitle className="text-xl text-[var(--color-primary)]">
              {formatSpeedMb(totalDown)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Upload</CardDescription>
            <CardTitle className="text-xl text-[var(--color-success)]">
              {formatSpeedMb(totalUp)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Adapters</CardDescription>
            <CardTitle className="text-xl">{nics.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Online</CardDescription>
            <CardTitle className="text-xl">
              {nics.filter((n) => n.oper_status === "Up").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {nics.map((n) => (
          <Card key={n.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{nicPrimaryLabel(n)}</CardTitle>
                <CardDescription>{nicSecondaryLabel(n)}</CardDescription>
              </div>
              <Badge
                className={
                  n.oper_status === "Up"
                    ? "border-[var(--color-success)]/40 text-[var(--color-success)]"
                    : ""
                }
              >
                {n.oper_status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted-foreground)]">Down</span>
                <span>{formatSpeedMb(n.rx_bps)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted-foreground)]">Up</span>
                <span>{formatSpeedMb(n.tx_bps)}</span>
              </div>
              <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                {n.ipv4_addresses[0] ?? "No IPv4"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartBlock title="Download" filter={dlFilter} onFilter={setDlFilter} option={dlChart} />
        <ChartBlock title="Upload" filter={ulFilter} onFilter={setUlFilter} option={ulChart} />
        <ChartBlock
          title="ICMP latency"
          filter={icmpFilter}
          onFilter={setIcmpFilter}
          option={icmpChart}
        />
        <ChartBlock
          title="HTTP latency"
          filter={httpFilter}
          onFilter={setHttpFilter}
          option={httpChart}
        />
      </div>
    </div>
  );
}
