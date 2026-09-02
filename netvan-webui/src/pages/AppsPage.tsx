import { useEffect, useMemo, useRef, useState } from "react";
import { HistoryFilter, customToTs } from "@/components/HistoryFilter";
import { UsagePeriodGrid } from "@/components/UsagePeriodGrid";
import { rpc, type AppSettings, type HistoryRange, type NicInfo } from "@/lib/api";
import { aggregateGridSum, buildPeriodColumns } from "@/lib/latencyPeriod";
import { pickHighestTrafficNic } from "@/lib/pickHighestTrafficNic";

type SeriesPoint = {
  hour_ts: number;
  process_name: string;
  remote_ip: string | null;
  host: string | null;
  bytes_in: number;
  bytes_out: number;
};

type CtxMenu = { x: number; y: number; processName: string };

export function AppsPage() {
  const [range, setRange] = useState<HistoryRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [nics, setNics] = useState<NicInfo[]>([]);
  const [nicId, setNicId] = useState("");
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const start_ts = range === "custom" ? customToTs(customStart) : null;
    const end_ts = range === "custom" ? customToTs(customEnd) : null;
    const usage = await rpc<{ type: "AppUsageSeries"; data: SeriesPoint[] }>({
      method: "GetAppUsageSeries",
      params: {
        range,
        start_ts,
        end_ts,
        group_by: "app",
        nic_id: nicId || null,
      },
    });
    setSeries(usage.data);
  };

  useEffect(() => {
    rpc<{ type: "Nics"; data: NicInfo[] }>({ method: "ListNics" }).then((r) => {
      const list = r.data.filter((n) => n.media_type !== "Loopback");
      setNics(list);
      const best = pickHighestTrafficNic(list);
      if (best) setNicId(best);
    });
  }, []);

  useEffect(() => {
    load().catch(console.error);
    const id = setInterval(() => load().catch(console.error), 10000);
    return () => clearInterval(id);
  }, [range, customStart, customEnd, nicId]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current?.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  const ignoreApp = async () => {
    if (!ctxMenu) return;
    try {
      const s = await rpc<{ type: "Settings"; data: AppSettings }>({ method: "GetSettings" });
      const settings = {
        ...s.data,
        ignored_apps: s.data.ignored_apps ?? [],
        ignored_ips: s.data.ignored_ips ?? [],
        ignored_urls: s.data.ignored_urls ?? [],
      };
      const name = ctxMenu.processName.trim();
      if (
        name &&
        !settings.ignored_apps.some((x) => x.toLowerCase() === name.toLowerCase())
      ) {
        settings.ignored_apps = [...settings.ignored_apps, name];
      }
      await rpc({ method: "SetSettings", params: { settings } });
      setMsg(`Ignored ${name}`);
      setCtxMenu(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setCtxMenu(null);
    }
  };

  const columns = useMemo(
    () => buildPeriodColumns(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  const rows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of series) {
      const key = p.process_name || "(unknown)";
      totals.set(key, (totals.get(key) ?? 0) + p.bytes_in + p.bytes_out);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(([k]) => k);
  }, [series]);

  const cells = useMemo(
    () =>
      aggregateGridSum(
        rows,
        columns,
        series.map((p) => ({
          ts: p.hour_ts,
          value: p.bytes_in + p.bytes_out,
          rowKey: p.process_name || "(unknown)",
        })),
      ),
    [rows, columns, series],
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Apps</h1>

      {msg && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-2 text-sm"
          value={nicId}
          onChange={(e) => setNicId(e.target.value)}
        >
          <option value="">All NICs</option>
          {nics.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <HistoryFilter
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={setCustomStart}
          onCustomEnd={setCustomEnd}
        />
      </div>

      <UsagePeriodGrid
        rows={rows}
        columns={columns}
        cells={cells}
        rowHeader="App"
        onRowContextMenu={(row, e) =>
          setCtxMenu({ x: e.clientX, y: e.clientY, processName: row })
        }
      />

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[140px] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            type="button"
            className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--color-muted)]"
            onClick={() => void ignoreApp()}
          >
            Ignore
          </button>
        </div>
      )}
    </div>
  );
}
