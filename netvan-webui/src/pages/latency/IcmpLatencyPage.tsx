import { useEffect, useMemo, useState } from "react";
import { HistoryFilter, customToTs } from "@/components/HistoryFilter";
import { LatencyPeriodGrid } from "@/components/LatencyPeriodGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { rpc, type AppSettings, type HistoryRange, type NicInfo } from "@/lib/api";
import { aggregateGrid, buildPeriodColumns } from "@/lib/latencyPeriod";

export function IcmpLatencyPage() {
  const [range, setRange] = useState<HistoryRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [nics, setNics] = useState<NicInfo[]>([]);
  const [nicId, setNicId] = useState("");
  const [pingHist, setPingHist] = useState<
    { ts: number; rtt_ms: number | null; target: string; success: boolean }[]
  >([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const loadSettings = async () => {
    const r = await rpc<{ type: "Settings"; data: AppSettings }>({ method: "GetSettings" });
    setSettings({
      ...r.data,
      strip_slot: r.data.strip_slot ?? "widgets_start",
      strip_offset_px: r.data.strip_offset_px ?? 0,
    });
    setTargets(r.data.ping_targets);
  };

  useEffect(() => {
    rpc<{ type: "Nics"; data: NicInfo[] }>({ method: "ListNics" }).then((r) => {
      setNics(r.data.filter((n) => n.media_type !== "Loopback"));
    });
    loadSettings().catch(console.error);
  }, []);

  useEffect(() => {
    const start_ts = range === "custom" ? customToTs(customStart) : null;
    const end_ts = range === "custom" ? customToTs(customEnd) : null;
    rpc<{
      type: "PingHistory";
      data: { ts: number; rtt_ms: number | null; target: string; success: boolean }[];
    }>({
      method: "GetPingHistory",
      params: { nic_id: nicId || null, range, start_ts, end_ts },
    }).then((p) => setPingHist(p.data));
  }, [range, customStart, customEnd, nicId]);

  const columns = useMemo(
    () => buildPeriodColumns(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  const rows = useMemo(() => {
    const fromSettings = targets;
    const fromHist = [...new Set(pingHist.map((p) => p.target))];
    return fromSettings.length ? fromSettings : fromHist;
  }, [targets, pingHist]);

  const cells = useMemo(
    () =>
      aggregateGrid(
        rows,
        columns,
        pingHist.map((p) => ({
          ts: p.ts,
          value: p.rtt_ms,
          rowKey: p.target,
        })),
      ),
    [rows, columns, pingHist],
  );

  const addHost = async () => {
    if (!settings) return;
    const host = newHost.trim();
    if (!host) return;
    if (settings.ping_targets.includes(host)) {
      setMsg("Host already in the list");
      return;
    }
    const next: AppSettings = {
      ...settings,
      ping_targets: [...settings.ping_targets, host],
    };
    try {
      await rpc({ method: "SetSettings", params: { settings: next } });
      setSettings(next);
      setTargets(next.ping_targets);
      setNewHost("");
      setModalOpen(false);
      setMsg(`Added ${host}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const removeHost = async (host: string) => {
    if (!settings) return;
    const next: AppSettings = {
      ...settings,
      ping_targets: settings.ping_targets.filter((t) => t !== host),
    };
    await rpc({ method: "SetSettings", params: { settings: next } });
    setSettings(next);
    setTargets(next.ping_targets);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">ICMP</h2>
        <Button onClick={() => setModalOpen(true)}>Add host</Button>
      </div>

      {msg && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Ping targets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {targets.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1 text-xs"
            >
              {t}
              <button
                type="button"
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                onClick={() => removeHost(t).catch(console.error)}
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          {targets.length === 0 && (
            <span className="text-sm text-[var(--color-muted-foreground)]">No targets yet</span>
          )}
        </CardContent>
      </Card>

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

      <LatencyPeriodGrid rows={rows} columns={columns} cells={cells} unit="ms" />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogHeader>
          <DialogTitle>Add host to ping</DialogTitle>
          <DialogDescription>
            Host or IP address added to scheduled ICMP monitoring.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="8.8.8.8 or example.com"
          value={newHost}
          onChange={(e) => setNewHost(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addHost().catch(console.error);
          }}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => addHost().catch(console.error)}>Add</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
