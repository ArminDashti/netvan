import { useCallback, useState } from "react";
import { CountryBadge } from "@/components/CountryBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rpc } from "@/lib/api";
import {
  fetchIpInfoBatch,
  formatAsn,
  isPublicIpv4,
  looksLikeIpv4,
  type IpInfo,
} from "@/lib/ipInfo";
import { SortableTh, useSortableRows } from "@/lib/sortable";

type RecordRow = {
  type: string;
  value: string;
  geo: IpInfo | null | undefined;
};

function classifyRecord(value: string): string {
  const v = value.trim();
  if (looksLikeIpv4(v)) return "A";
  if (v.includes(":") && /^[0-9a-fA-F:]+$/.test(v)) return "AAAA";
  if (v.includes(".") && !looksLikeIpv4(v)) return "CNAME";
  return "ADDR";
}

export function NslookupToolPage() {
  const [query, setQuery] = useState("example.com");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [raw, setRaw] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecordValue = useCallback(
    (row: RecordRow, key: "type" | "value" | "country" | "asn") => {
      switch (key) {
        case "type":
          return row.type;
        case "value":
          return row.value;
        case "country":
          return row.geo?.country ?? "";
        case "asn":
          return formatAsn(row.geo);
      }
    },
    [],
  );
  const { sorted: sortedRows, sort, toggle } = useSortableRows(rows, getRecordValue);

  const run = async () => {
    setBusy(true);
    setError(null);
    setRows([]);
    setRaw("");
    try {
      const r = await rpc<{
        type: "Nslookup";
        data: { records: string[]; raw: string };
      }>({ method: "RunNslookup", params: { query } });
      setRaw(r.data.raw);
      const next: RecordRow[] = r.data.records.map((value) => ({
        type: classifyRecord(value),
        value,
        geo: isPublicIpv4(value) ? undefined : null,
      }));
      setRows(next);

      const ips = next.filter((row) => isPublicIpv4(row.value)).map((row) => row.value);
      if (ips.length) {
        const map = await fetchIpInfoBatch(ips, 5);
        setRows((prev) =>
          prev.map((row) =>
            isPublicIpv4(row.value)
              ? { ...row, geo: map.get(row.value.trim()) ?? null }
              : row,
          ),
        );
      }
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
          <CardTitle>nslookup</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
          />
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? "Looking up…" : "Lookup"}
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
          <CardTitle>Records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-muted-foreground)]">
                <SortableTh
                  label="Type"
                  active={sort.key === "type"}
                  dir={sort.dir}
                  onClick={() => toggle("type")}
                />
                <SortableTh
                  label="Value"
                  active={sort.key === "value"}
                  dir={sort.dir}
                  onClick={() => toggle("value")}
                />
                <SortableTh
                  label="Country"
                  active={sort.key === "country"}
                  dir={sort.dir}
                  onClick={() => toggle("country")}
                />
                <SortableTh
                  label="ASN"
                  active={sort.key === "asn"}
                  dir={sort.dir}
                  onClick={() => toggle("asn")}
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr key={`${row.value}-${i}`} className="border-t border-[var(--color-border)]">
                  <td className="py-1.5 font-mono text-xs">{row.type}</td>
                  <td className="py-1.5 font-mono text-xs">{row.value}</td>
                  <td className="py-1.5">
                    <CountryBadge
                      country={row.geo?.country}
                      empty={row.geo === undefined ? "…" : "—"}
                    />
                  </td>
                  <td className="py-1.5 text-xs text-[var(--color-muted-foreground)]">
                    {formatAsn(row.geo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !busy && (
            <p className="py-4 text-sm text-[var(--color-muted-foreground)]">
              Results appear here after lookup.
            </p>
          )}
        </CardContent>
      </Card>

      {raw && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Raw output</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide" : "Show"}
            </Button>
          </CardHeader>
          {showRaw && (
            <CardContent>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-muted)] p-3 font-mono text-xs">
                {raw}
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
