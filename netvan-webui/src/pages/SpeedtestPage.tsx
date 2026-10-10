import { useCallback, useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  Activity,
  ArrowUpCircle,
  ChevronRight,
  Clock,
  Download,
  Globe,
  Lightbulb,
  TrendingUp,
  Wifi,
} from "lucide-react";
import { HistoryFilter, customToTs } from "@/components/HistoryFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rpc, type HistoryRange } from "@/lib/api";
import { SortableTh, useSortableRows } from "@/lib/sortable";
import { cancelSpeedtest, runSpeedtestLive } from "@/lib/tools";
import { cn, formatTs } from "@/lib/utils";

type SpeedRow = {
  id: number;
  ts: number;
  server_name: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number | null;
};

function formatDateTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SpeedtestPage() {
  const [range, setRange] = useState<HistoryRange>("months");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [history, setHistory] = useState<SpeedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SpeedRow | null>(null);
  const [eula, setEula] = useState(false);
  const [liveDl, setLiveDl] = useState<number | null>(null);
  const [liveUl, setLiveUl] = useState<number | null>(null);
  const [livePing, setLivePing] = useState<number | null>(null);
  const [livePhase, setLivePhase] = useState<string | null>(null);
  const [liveServer, setLiveServer] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    const start_ts = range === "custom" ? customToTs(customStart) : null;
    const end_ts = range === "custom" ? customToTs(customEnd) : null;
    const r = await rpc<{ type: "SpeedtestHistory"; data: SpeedRow[] }>({
      method: "GetSpeedtestHistory",
      params: { range, start_ts, end_ts },
    });
    setHistory(r.data);
    const s = await rpc<{
      type: "Settings";
      data: { speedtest_eula_accepted: boolean };
    }>({ method: "GetSettings" });
    setEula(s.data.speedtest_eula_accepted);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [range, customStart, customEnd]);

  useEffect(() => {
    return () => {
      void cancelSpeedtest().catch(() => {});
      setLast(null);
      setLiveDl(null);
      setLiveUl(null);
      setLivePing(null);
      setLivePhase(null);
      setLiveServer(null);
      setBusy(false);
    };
  }, []);

  const resetLive = () => {
    setLiveDl(null);
    setLiveUl(null);
    setLivePing(null);
    setLivePhase(null);
    setLiveServer(null);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setShowAll(false);
    setLiveDl(0);
    setLiveUl(null);
    setLivePing(null);
    setLivePhase("start");
    setLiveServer(null);
    try {
      if (!eula) {
        await rpc({ method: "AcceptSpeedtestEula" });
        setEula(true);
      }
      const result = (await runSpeedtestLive({
        nicId: null,
        serverId: null,
        acceptEula: true,
        onProgress: (p) => {
          setLivePhase(p.phase);
          if (p.server_name) setLiveServer(p.server_name);
          if (p.ping_ms != null) setLivePing(p.ping_ms);
          if (p.download_mbps != null) setLiveDl(p.download_mbps);
          if (p.upload_mbps != null) setLiveUl(p.upload_mbps);
        },
      })) as SpeedRow;
      setLast(result);
      setLiveDl(result.download_mbps);
      setLiveUl(result.upload_mbps);
      setLivePing(result.ping_ms);
      setLivePhase("done");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancell?ed/i.test(msg)) {
        resetLive();
      } else {
        setError(msg);
        setLivePhase(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await cancelSpeedtest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    resetLive();
    setBusy(false);
  };

  const latest = last;
  const pingMs = busy ? livePing : (latest?.ping_ms ?? livePing);
  const dl = busy && liveDl != null ? liveDl : (latest?.download_mbps ?? liveDl ?? 0);
  const ul =
    busy && liveUl != null
      ? liveUl
      : (latest?.upload_mbps ?? liveUl ?? 0);
  const gaugeMax = Math.max(100, Math.ceil(Math.max(dl, ul, 1) * 1.25));

  const serverLabel =
    (busy ? liveServer : latest?.server_name) ?? "Auto Select";

  const gauge = useMemo(() => {
    return {
      backgroundColor: "transparent",
      series: [
        {
          type: "gauge",
          startAngle: 200,
          endAngle: -20,
          center: ["50%", "60%"],
          radius: "95%",
          min: 0,
          max: gaugeMax,
          splitNumber: 10,
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 14,
              color: [
                [0.1, "#3b82f6"],
                [0.2, "#06b6d4"],
                [0.3, "#10b981"],
                [0.4, "#84cc16"],
                [0.5, "#eab308"],
                [0.62, "#f97316"],
                [0.78, "#ef4444"],
                [1, "#ec4899"],
              ],
            },
          },
          progress: { show: false },
          pointer: {
            length: "62%",
            width: 5,
            offsetCenter: [0, "8%"],
            itemStyle: { color: "#cbd5e1" },
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 18,
            itemStyle: {
              color: "#0f172a",
              borderWidth: 4,
              borderColor: "#cbd5e1",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            distance: -20,
            length: 16,
            lineStyle: { color: "#e2e8f0", width: 2 },
          },
          axisLabel: {
            distance: 16,
            color: "#94a3b8",
            fontSize: 12,
            formatter: (v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`,
          },
          title: { show: false },
          detail: { show: false },
          data: [{ value: Number(dl.toFixed(2)) }],
          animationDuration: busy ? 180 : 900,
          animationDurationUpdate: busy ? 180 : 600,
          animationEasingUpdate: "linear",
        },
      ],
    };
  }, [dl, gaugeMax, busy]);

  const phaseLabel =
    livePhase === "ping"
      ? "Measuring latency…"
      : livePhase === "download"
        ? "Download in progress…"
        : livePhase === "upload"
          ? "Upload in progress…"
          : livePhase === "start"
            ? "Starting…"
            : null;

  const dlText = dl.toFixed(2);
  const ulText =
    busy && liveUl == null && !latest
      ? "…"
      : (busy && liveUl != null ? liveUl : ul).toFixed(2);
  const pingText = pingMs != null ? Math.round(pingMs).toString() : "—";

  const getSpeedValue = useCallback(
    (row: SpeedRow, key: "server" | "ping" | "download" | "upload") => {
      switch (key) {
        case "server":
          return row.server_name ?? "";
        case "ping":
          return row.ping_ms;
        case "download":
          return row.download_mbps;
        case "upload":
          return row.upload_mbps;
      }
    },
    [],
  );
  const { sorted: sortedHistory, sort, toggle } = useSortableRows(
    history,
    getSpeedValue,
  );

  const visibleHistory = showAll ? sortedHistory : sortedHistory.slice(0, 5);

  const exportCsv = () => {
    const header = "Date & Time,Server,Ping (ms),Download (Mbps),Upload (Mbps)";
    const lines = sortedHistory.map((h) =>
      [
        formatDateTs(h.ts),
        h.server_name ?? "Auto Select",
        h.ping_ms.toFixed(1),
        h.download_mbps.toFixed(2),
        h.upload_mbps.toFixed(2),
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "speedtest-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ── Test panel ─────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Your Connection
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    error ? "bg-[var(--color-destructive)]" : "bg-[var(--color-success)]",
                  )}
                />
                {error ? "Offline" : "Online"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Test Server
              </p>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-sm font-medium text-[var(--color-primary)]">
                <Globe className="h-4 w-4" aria-hidden />
                {serverLabel}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <div className="relative">
              <ReactECharts
                option={gauge}
                style={{ height: 340 }}
                notMerge={false}
                lazyUpdate
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center">
                <span className="text-5xl font-bold tabular-nums tracking-tight">
                  {dlText}
                </span>
                <span className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  Mbps
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-4">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  <Activity className="h-3.5 w-3.5 text-[var(--color-primary)]" aria-hidden />
                  Ping
                </span>
                <span className="text-2xl font-bold tabular-nums">{pingText}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">ms</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-4">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  <Download className="h-3.5 w-3.5 text-[var(--color-success)]" aria-hidden />
                  Download
                </span>
                <span className="text-2xl font-bold tabular-nums">{dlText}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">Mbps</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-4">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  <ArrowUpCircle className="h-3.5 w-3.5 text-[var(--color-destructive)]" aria-hidden />
                  Upload
                </span>
                <span className="text-2xl font-bold tabular-nums">{ulText}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">Mbps</span>
              </div>
            </div>

            <div className="mt-auto flex flex-col items-center gap-2 pt-6">
              {busy ? (
                <Button
                  variant="outline"
                  className="w-full max-w-xs"
                  onClick={() => void cancel()}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  onClick={() => void run()}
                  className="w-full max-w-xs bg-gradient-to-r from-[var(--color-primary)] to-[#6366f1] text-[var(--color-primary-foreground)]"
                >
                  {eula ? "Run Speed Test" : "Accept EULA & Run"}
                </Button>
              )}
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {busy
                  ? phaseLabel
                  : latest
                    ? `Last test: ${formatTs(latest.ts)}`
                    : "Run a test to see your connection speed"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── History + Tips ─────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp
                    className="h-5 w-5 text-[var(--color-success)]"
                    aria-hidden
                  />
                  History
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={history.length === 0}
                  onClick={exportCsv}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Export
                </Button>
              </div>
              <HistoryFilter
                value={range}
                onChange={(v) => {
                  setRange(v);
                  setShowAll(false);
                }}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStart={setCustomStart}
                onCustomEnd={setCustomEnd}
                labels={{ week: "7 Days", months: "30 Days" }}
              />
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted-foreground)]">
                    <th className="py-2 pr-2 font-medium">Date &amp; Time</th>
                    <SortableTh
                      label="Server"
                      active={sort.key === "server"}
                      dir={sort.dir}
                      onClick={() => toggle("server")}
                    />
                    <SortableTh
                      label="Ping (ms)"
                      active={sort.key === "ping"}
                      dir={sort.dir}
                      onClick={() => toggle("ping")}
                    />
                    <SortableTh
                      label="Download (Mbps)"
                      active={sort.key === "download"}
                      dir={sort.dir}
                      onClick={() => toggle("download")}
                    />
                    <SortableTh
                      label="Upload (Mbps)"
                      active={sort.key === "upload"}
                      dir={sort.dir}
                      onClick={() => toggle("upload")}
                    />
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.map((h) => (
                    <tr
                      key={h.id}
                      className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-muted)]/40"
                    >
                      <td className="py-2.5 pr-2 whitespace-nowrap">
                        {formatDateTs(h.ts)}
                      </td>
                      <td className="py-2.5 pr-2">{h.server_name ?? "Auto Select"}</td>
                      <td className="py-2.5 pr-2 tabular-nums">
                        {Math.round(h.ping_ms)}
                      </td>
                      <td className="py-2.5 pr-2 font-medium tabular-nums">
                        {h.download_mbps.toFixed(2)}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        {h.upload_mbps.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right">
                        <ChevronRight
                          className="ml-auto h-4 w-4 text-[var(--color-muted-foreground)]"
                          aria-hidden
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                  No speed tests yet
                </p>
              )}
              {history.length > 5 && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-primary)]"
                    onClick={() => setShowAll((s) => !s)}
                  >
                    {showAll ? "Show Less" : "View All History"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-5 w-5 text-[var(--color-warning)]" aria-hidden />
                Tips for Better Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tip
                icon={<Wifi className="h-4 w-4" aria-hidden />}
                iconClass="bg-[var(--color-success)]/15 text-[var(--color-success)]"
                title="Use Wired Connection"
                text="For the most accurate results, connect your device directly to your router."
              />
              <Tip
                icon={<Clock className="h-4 w-4" aria-hidden />}
                iconClass="bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                title="Close Background Apps"
                text="Stop apps and downloads that might affect your internet speed."
              />
              <Tip
                icon={<Clock className="h-4 w-4" aria-hidden />}
                iconClass="bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
                title="Test at Different Times"
                text="Internet speed can vary based on network congestion and time of day."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Tip({
  icon,
  iconClass,
  title,
  text,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          iconClass,
        )}
      >
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{text}</p>
      </div>
    </div>
  );
}
