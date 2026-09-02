import { useCallback, useState } from "react";
import { CountryBadge } from "@/components/CountryBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchIpInfo, formatAsn, isPublicIpv4, type IpInfo } from "@/lib/ipInfo";
import { SortableTh, useSortableRows } from "@/lib/sortable";
import { runTracerouteLive } from "@/lib/tools";
import { formatMs } from "@/lib/utils";

type HopRow = {
  hop: number;
  address: string | null;
  rtt_ms: number | null;
  geo: IpInfo | null | undefined;
};

export function TracerouteToolPage() {
  const [target, setTarget] = useState("1.1.1.1");
  const [hops, setHops] = useState<HopRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHopValue = useCallback(
    (row: HopRow, key: "hop" | "ip" | "rtt" | "country" | "asn") => {
      switch (key) {
        case "hop":
          return row.hop;
        case "ip":
          return row.address ?? "";
        case "rtt":
          return row.rtt_ms;
        case "country":
          return row.geo?.country ?? "";
        case "asn":
          return formatAsn(row.geo);
      }
    },
    [],
  );
  const { sorted: sortedHops, sort, toggle } = useSortableRows(hops, getHopValue);

  const run = async () => {
    setBusy(true);
    setError(null);
    setHops([]);
    try {
      await runTracerouteLive({
        target,
        maxHops: 20,
        onHop: (p) => {
          if (p.phase !== "hop" || p.hop == null) return;
          const row: HopRow = {
            hop: p.hop,
            address: p.address,
            rtt_ms: p.rtt_ms,
            geo: undefined,
          };
          setHops((prev) => {
            const next = [...prev.filter((h) => h.hop !== row.hop), row];
            next.sort((a, b) => a.hop - b.hop);
            return next;
          });
          if (isPublicIpv4(p.address)) {
            const ip = p.address!;
            const hopNum = p.hop;
            fetchIpInfo(ip).then((info) => {
              setHops((prev) =>
                prev.map((h) => (h.hop === hopNum && h.address === ip ? { ...h, geo: info } : h)),
              );
            });
          } else {
            setHops((prev) => prev.map((h) => (h.hop === p.hop ? { ...h, geo: null } : h)));
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Traceroute</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? "Tracing…" : "Trace"}
          </Button>
        </CardContent>
      </Card>
      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Hops</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-muted-foreground)]">
                <SortableTh label="#" active={sort.key === "hop"} dir={sort.dir} onClick={() => toggle("hop")} />
                <SortableTh label="IP" active={sort.key === "ip"} dir={sort.dir} onClick={() => toggle("ip")} />
                <SortableTh label="RTT" active={sort.key === "rtt"} dir={sort.dir} onClick={() => toggle("rtt")} />
                <SortableTh
                  label="Country"
                  active={sort.key === "country"}
                  dir={sort.dir}
                  onClick={() => toggle("country")}
                />
                <SortableTh label="ASN" active={sort.key === "asn"} dir={sort.dir} onClick={() => toggle("asn")} />
              </tr>
            </thead>
            <tbody>
              {sortedHops.map((h) => (
                <tr key={h.hop} className="border-t border-[var(--color-border)]">
                  <td className="py-1.5 pr-2 font-mono text-xs">{h.hop}</td>
                  <td className="pr-2 font-mono text-xs">{h.address ?? "*"}</td>
                  <td className="pr-2 font-mono text-xs">{formatMs(h.rtt_ms)}</td>
                  <td className="pr-2">
                    <CountryBadge country={h.geo?.country} empty={h.geo === undefined ? "…" : "—"} />
                  </td>
                  <td className="text-xs text-[var(--color-muted-foreground)]">
                    {formatAsn(h.geo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hops.length === 0 && (
            <p className="py-4 text-sm text-[var(--color-muted-foreground)]">
              {busy ? "Waiting for hops…" : "Results appear here."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
