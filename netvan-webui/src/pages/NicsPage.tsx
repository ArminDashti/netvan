import { useEffect, useMemo, useRef, useState } from "react";
import { Bluetooth, Cable, Network, Wifi } from "lucide-react";
import { HistoryFilter, customToTs } from "@/components/HistoryFilter";
import { NicVendorLogo } from "@/components/NicVendorLogo";
import { UsagePeriodGrid } from "@/components/UsagePeriodGrid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { rpc, type HistoryRange, type NicInfo } from "@/lib/api";
import { aggregateGridSum, buildPeriodColumns } from "@/lib/latencyPeriod";
import { matchNicVendor } from "@/lib/nicVendor";
import { cn, formatSpeedMb, formatUsageGb } from "@/lib/utils";

type StatusFilter = "both" | "on" | "off";

function NicTypeIcon({ mediaType }: { mediaType: string }) {
  const cls = "h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]";
  switch (mediaType) {
    case "Wi-Fi":
      return <Wifi className={cls} aria-label="Wi-Fi" />;
    case "Bluetooth":
      return <Bluetooth className={cls} aria-label="Bluetooth" />;
    case "Ethernet":
      return <Cable className={cls} aria-label="LAN" />;
    default:
      return <Network className={cls} aria-label={mediaType} />;
  }
}

function nicPrimaryLabel(n: Pick<NicInfo, "name" | "description">) {
  return n.description?.trim() || n.name;
}

function nicSecondaryLabel(n: Pick<NicInfo, "name" | "description" | "media_type">) {
  if (n.description?.trim()) return n.name;
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

export function NicsPage() {
  const [nics, setNics] = useState<NicInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("both");
  const [range, setRange] = useState<HistoryRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [usage, setUsage] = useState<{ ts: number; rx_bytes: number; tx_bytes: number }[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nic: NicInfo;
  } | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  const refreshNics = async () => {
    const r = await rpc<{ type: "Nics"; data: NicInfo[] }>({ method: "ListNics" });
    const list = r.data.filter((n) => n.media_type !== "Loopback");
    setNics(list);
    return list;
  };

  const filteredNics = useMemo(() => {
    if (statusFilter === "on") return nics.filter((n) => n.oper_status === "Up");
    if (statusFilter === "off") return nics.filter((n) => n.oper_status !== "Up");
    return nics;
  }, [nics, statusFilter]);

  useEffect(() => {
    refreshNics().then((list) => {
      if (!selected && list[0]) setSelected(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (filteredNics.some((n) => n.id === selected)) return;
    setSelected(filteredNics[0]?.id ?? "");
  }, [filteredNics, selected]);

  useEffect(() => {
    let alive = true;
    const id = setInterval(() => {
      refreshNics().then(() => {
        if (!alive) return;
      });
    }, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const start_ts = range === "custom" ? customToTs(customStart) : null;
    const end_ts = range === "custom" ? customToTs(customEnd) : null;
    rpc<{
      type: "BandwidthHistory";
      data: { ts: number; rx_bytes: number; tx_bytes: number }[];
    }>({
      method: "GetBandwidthHistory",
      params: { nic_id: selected, range, start_ts, end_ts },
    }).then((u) => setUsage(u.data));
  }, [selected, range, customStart, customEnd]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const nic = nics.find((n) => n.id === selected);
  const vendor = nic ? matchNicVendor(nic.name, nic.description) : null;
  const deltas = useMemo(() => usageDeltas(usage), [usage]);

  const columns = useMemo(
    () => buildPeriodColumns(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  const rows = useMemo(() => ["Download", "Upload"], []);

  const cells = useMemo(
    () =>
      aggregateGridSum(rows, columns, [
        ...deltas.map((p) => ({
          ts: p.ts,
          value: p.rx,
          rowKey: "Download",
        })),
        ...deltas.map((p) => ({
          ts: p.ts,
          value: p.tx,
          rowKey: "Upload",
        })),
      ]),
    [rows, columns, deltas],
  );

  const setNicEnabled = async (target: NicInfo, enabled: boolean) => {
    setCtxMenu(null);
    setActionBusy(true);
    setActionMsg(null);
    try {
      await rpc({ method: "SetNicEnabled", params: { nic_id: target.id, enabled } });
      setActionMsg(`${target.name}: ${enabled ? "enabled" : "disabled"}`);
      await refreshNics();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const adminUp = (n: NicInfo) => {
    const a = n.admin_status.toLowerCase();
    return a === "up" || a === "enabled";
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-[480px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">NICs</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Adapters, details, and usage history
        </p>
      </div>

      {actionMsg && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm">
          {actionMsg}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[270px_1fr_1fr]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-2 py-3">
            <CardTitle className="text-base">Adapters</CardTitle>
            <select
              className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-2 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="both">Both</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
            {filteredNics.map((n) => {
              const up = n.oper_status === "Up";
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSelected(n.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({ x: e.clientX, y: e.clientY, nic: n });
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                    selected === n.id
                      ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                      : "border-transparent hover:bg-[var(--color-muted)]/60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      up ? "bg-[var(--color-success)]" : "bg-[var(--color-destructive)]",
                    )}
                    title={n.oper_status}
                  />
                  <NicTypeIcon mediaType={n.media_type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-tight">
                      {nicPrimaryLabel(n)}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {nicSecondaryLabel(n)}
                    </span>
                  </span>
                </button>
              );
            })}
            {filteredNics.length === 0 && (
              <p className="p-2 text-sm text-[var(--color-muted-foreground)]">No adapters</p>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          {nic ? (
            <>
              <CardHeader className="relative shrink-0 gap-1 py-3 pr-14">
                <div className="absolute top-3 right-3 text-[var(--color-muted-foreground)]">
                  {vendor ? (
                    <NicVendorLogo vendor={vendor} className="h-10 w-10" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-muted)]">
                      <NicTypeIcon mediaType={nic.media_type} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      nic.oper_status === "Up"
                        ? "bg-[var(--color-success)]"
                        : "bg-[var(--color-destructive)]",
                    )}
                  />
                  <CardTitle className="text-base">{nicPrimaryLabel(nic)}</CardTitle>
                </div>
                <CardDescription>{nicSecondaryLabel(nic)}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-4 overflow-auto">
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-[var(--color-muted-foreground)]">GUID</dt>
                  <dd className="truncate font-mono text-xs">{nic.guid}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">Index</dt>
                  <dd>{nic.interface_index}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">MAC</dt>
                  <dd className="font-mono text-xs">{nic.mac ?? "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">Type</dt>
                  <dd>{nic.media_type}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">MTU</dt>
                  <dd>{nic.mtu ?? "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">Admin</dt>
                  <dd>{nic.admin_status}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">Link speed</dt>
                  <dd>{nic.link_speed_bps ? formatSpeedMb(nic.link_speed_bps) : "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">IPv4</dt>
                  <dd>{nic.ipv4_addresses.join(", ") || "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">IPv6</dt>
                  <dd className="truncate text-xs">{nic.ipv6_addresses.join(", ") || "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">Gateway</dt>
                  <dd>{nic.gateways.join(", ") || "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">DNS</dt>
                  <dd>{nic.dns_servers.join(", ") || "—"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">DHCP</dt>
                  <dd>{nic.dhcp_enabled ? "Yes" : "No"}</dd>
                  <dt className="text-[var(--color-muted-foreground)]">Live ↓ / ↑</dt>
                  <dd>
                    <span className="text-[var(--color-success)]">{formatSpeedMb(nic.rx_bps)}</span>
                    {" / "}
                    <span className="text-[var(--color-destructive)]">
                      {formatSpeedMb(nic.tx_bps)}
                    </span>
                  </dd>
                  <dt className="text-[var(--color-muted-foreground)]">Counters</dt>
                  <dd>
                    {formatUsageGb(nic.rx_bytes)} / {formatUsageGb(nic.tx_bytes)}
                  </dd>
                </dl>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              Select an adapter
            </CardContent>
          )}
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-2 py-3">
            <CardTitle className="text-base">Usage history</CardTitle>
            <HistoryFilter
              value={range}
              onChange={setRange}
              customStart={customStart}
              customEnd={customEnd}
              onCustomStart={setCustomStart}
              onCustomEnd={setCustomEnd}
            />
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <UsagePeriodGrid rows={rows} columns={columns} cells={cells} rowHeader="Direction" />
          </CardContent>
        </Card>
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[140px] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            type="button"
            disabled={actionBusy || adminUp(ctxMenu.nic)}
            className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--color-muted)] disabled:opacity-40"
            onClick={() => setNicEnabled(ctxMenu.nic, true)}
          >
            Enable
          </button>
          <button
            type="button"
            disabled={actionBusy || !adminUp(ctxMenu.nic)}
            className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--color-muted)] disabled:opacity-40"
            onClick={() => setNicEnabled(ctxMenu.nic, false)}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
