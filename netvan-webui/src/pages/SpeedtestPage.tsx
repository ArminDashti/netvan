import { useCallback, useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Activity, Download, Upload } from "lucide-react";
import { HistoryFilter, customToTs } from "@/components/HistoryFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rpc, type HistoryRange } from "@/lib/api";
import { SortableTh, useSortableRows } from "@/lib/sortable";
import { cancelSpeedtest, runSpeedtestLive } from "@/lib/tools";
import { formatTs } from "@/lib/utils";

type SpeedRow = {
  id: number;
  ts: number;
  server_name: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number | null;
};

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

  const gauge = useMemo(() => {
    return {
      backgroundColor: "transparent",
      series: [
        {
          type: "gauge",
          startAngle: 220,
          endAngle: -40,
          center: ["50%", "58%"],
          radius: "92%",
          min: 0,
          max: gaugeMax,
          splitNumber: 10,
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 18,
              color: [
                [0.55, "#2f8f5b"],
                [0.8, "#c9a227"],
                [1, "#c44a52"],
              ],
            },
          },
          progress: {
            show: true,
            roundCap: true,
            width: 18,
            itemStyle: { color: "#d8e2ef" },
          },
          pointer: {
            length: "68%",
            width: 5,
            offsetCenter: [0, "6%"],
            itemStyle: { color: "#e8eef8" },
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 14,
            itemStyle: {
              color: "#1a2332",
              borderWidth: 3,
              borderColor: "#e8eef8",
            },
          },
          axisTick: {
            distance: -22,
            length: 8,
            splitNumber: 5,
            lineStyle: { color: "#6b7c94", width: 1 },
          },
          splitLine: {
            distance: -28,
            length: 14,
            lineStyle: { color: "#9aabbf", width: 2 },
          },
          axisLabel: {
            distance: 18,
            color: "#8b9bb4",
            fontSize: 11,
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

  const pingText = pingMs != null ? `${pingMs.toFixed(1)} ms` : "—";
  const dlText = `${dl.toFixed(2)} Mbps`;
  const ulText =
    busy && liveUl == null && !latest
      ? "…"
      : `${(busy && liveUl != null ? liveUl : ul).toFixed(2)} Mbps`;

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Speed Test</h1>
        <div className="flex flex-wrap items-center gap-2">
          {busy && (
            <Button variant="outline" onClick={() => void cancel()}>
              Cancel
            </Button>
          )}
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? "Running…" : eula ? "Run speed test" : "Accept EULA & run"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescriptionLine
              text={
                busy
                  ? `${liveServer ?? "Connecting…"} · ${phaseLabel ?? "Running…"}`
                  : `${latest?.server_name ?? "No runs yet"} · ${latest ? formatTs(latest.ts) : "—"}`
              }
            />
          </CardHeader>
          <CardContent>
            <ReactECharts option={gauge} style={{ height: 400 }} notMerge={false} lazyUpdate />
            <div className="mt-4 flex flex-wrap items-stretch justify-center gap-8 sm:gap-10">
              <div className="flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-5 py-3">
                <Activity className="h-4 w-4 text-[var(--color-muted-foreground)]" aria-hidden />
                <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Ping
                </span>
                <span className="text-base font-semibold tabular-nums">{pingText}</span>
              </div>
              <div className="flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-5 py-3">
                <Download className="h-4 w-4 text-[var(--color-success)]" aria-hidden />
                <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Download
                </span>
                <span className="text-base font-semibold tabular-nums">{dlText}</span>
              </div>
              <div className="flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-5 py-3">
                <Upload className="h-4 w-4 text-[var(--color-destructive)]" aria-hidden />
                <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Upload
                </span>
                <span className="text-base font-semibold tabular-nums">{ulText}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>History</CardTitle>
            <HistoryFilter
              value={range}
              onChange={setRange}
              customStart={customStart}
              customEnd={customEnd}
              onCustomStart={setCustomStart}
              onCustomEnd={setCustomEnd}
            />
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--color-muted-foreground)]">
                  <SortableTh
                    label="Server"
                    active={sort.key === "server"}
                    dir={sort.dir}
                    onClick={() => toggle("server")}
                  />
                  <SortableTh
                    label="Ping"
                    active={sort.key === "ping"}
                    dir={sort.dir}
                    onClick={() => toggle("ping")}
                  />
                  <SortableTh
                    label="Download"
                    active={sort.key === "download"}
                    dir={sort.dir}
                    onClick={() => toggle("download")}
                  />
                  <SortableTh
                    label="Upload"
                    active={sort.key === "upload"}
                    dir={sort.dir}
                    onClick={() => toggle("upload")}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((h) => (
                  <tr key={h.id} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-2">{h.server_name ?? "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{h.ping_ms.toFixed(1)} ms</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {h.download_mbps.toFixed(2)} Mbps
                    </td>
                    <td className="py-1.5 tabular-nums">{h.upload_mbps.toFixed(2)} Mbps</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && (
              <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                No speed tests yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CardDescriptionLine({ text }: { text: string }) {
  return <p className="text-sm text-[var(--color-muted-foreground)]">{text}</p>;
}
