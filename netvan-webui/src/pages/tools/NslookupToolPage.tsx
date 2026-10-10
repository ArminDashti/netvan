import { useCallback, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  Globe,
  Layers,
  Lightbulb,
  MessageSquareText,
  Search,
  Server,
  Terminal,
  Waypoints,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const EXAMPLE_DOMAINS = ["google.com", "cloudflare.com", "github.com", "microsoft.com"];

type RecordRow = {
  /** Nameserver/host name when known (from raw output). */
  nameserver: string | null;
  /** Resolved IP address for this row, when applicable. */
  ip: string | null;
  /** Record type: A, AAAA, CNAME, ADDR */
  type: string;
  /** Text shown in the primary value cell (for sorting/copying). */
  display: string;
  geo: IpInfo | null | undefined;
};

function classifyValue(value: string): string {
  const v = value.trim();
  if (looksLikeIpv4(v)) return "A";
  if (v.includes(":") && /^[0-9a-fA-F:]+$/.test(v)) return "AAAA";
  if (v.includes(".") && !looksLikeIpv4(v)) return "CNAME";
  return "ADDR";
}

type RawParse = {
  serverName: string | null;
  serverAddress: string | null;
  nameservers: string[];
};

function parseRawOutput(raw: string): RawParse {
  const serverName = /Server:\s*(\S+)/i.exec(raw)?.[1] ?? null;
  const serverAddress = /Address:\s*(\S+)/i.exec(raw)?.[1] ?? null;
  const nameservers: string[] = [];
  for (const line of raw.split("\n")) {
    const m = /^\s*Name:\s*(\S+)/i.exec(line);
    if (m && !nameservers.includes(m[1])) nameservers.push(m[1]);
  }
  return { serverName, serverAddress, nameservers };
}

function buildRows(records: string[], raw: string): RecordRow[] {
  const { nameservers } = parseRawOutput(raw);
  const ips = records.filter((r) => looksLikeIpv4(r) || r.includes(":"));
  // Pair resolver IPs with nslookup "Name:" sections when counts match
  // (or IPs are a multiple of names, e.g. 123.123.123.1 → 2 A + 2 AAAA).
  const paired =
    nameservers.length > 0 && ips.length > 0 && ips.length % nameservers.length === 0;

  if (paired) {
    return ips.map((ip, i) => ({
      nameserver: nameservers[Math.floor(i / (ips.length / nameservers.length))] ?? null,
      ip,
      type: classifyValue(ip),
      display: ip,
      geo: isPublicIpv4(ip) ? undefined : null,
    }));
  }

  return records.map((value) => ({
    nameserver: null,
    ip: looksLikeIpv4(value) || value.includes(":") ? value : null,
    type: classifyValue(value),
    display: value,
    geo: isPublicIpv4(value) ? undefined : null,
  }));
}

const TIPS = [
  {
    icon: Globe,
    color: "text-[var(--color-primary)] bg-[var(--color-primary)]/10",
    title: "What are NS records?",
    text: "NS records specify the nameservers authoritative for a domain.",
  },
  {
    icon: Server,
    color: "text-[var(--color-success)] bg-[var(--color-success)]/10",
    title: "Why multiple IPs?",
    text: "Nameservers often have multiple IP addresses for redundancy and performance.",
  },
  {
    icon: Lightbulb,
    color: "text-[var(--color-warning)] bg-[var(--color-warning)]/10",
    title: "Using this tool",
    text: "Enter a domain and click Lookup to view its nameservers.",
  },
];

function SectionTitle({
  icon: Icon,
  iconClass,
  children,
}: {
  icon: typeof Globe;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="h-4 w-4" />
      </span>
      <CardTitle>{children}</CardTitle>
    </div>
  );
}

function CopyButton({
  text,
  copied,
  onCopy,
  className,
}: {
  text: string;
  copied: boolean;
  onCopy: (text: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => onCopy(text)}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function NslookupToolPage() {
  const [query, setQuery] = useState("google.com");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    domain: string;
    serverName: string | null;
    serverAddress: string | null;
    queryTimeMs: number | null;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  const getRecordValue = useCallback(
    (row: RecordRow, key: "type" | "nameserver" | "ip" | "country" | "asn") => {
      switch (key) {
        case "type":
          return row.type;
        case "nameserver":
          return row.nameserver ?? row.display;
        case "ip":
          return row.ip ?? "";
        case "country":
          return row.geo?.country ?? "";
        case "asn":
          return formatAsn(row.geo);
      }
    },
    [],
  );
  const { sorted: sortedRows, sort, toggle } = useSortableRows(rows, getRecordValue);

  const hasNameserverColumn = rows.some((r) => r.nameserver);

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const run = async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setRows([]);
    setRaw("");
    setSummary(null);
    try {
      const started = performance.now();
      const r = await rpc<{
        type: "Nslookup";
        data: { records: string[]; raw: string };
      }>({ method: "RunNslookup", params: { query: q } });
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      const parsed = parseRawOutput(r.data.raw);
      setRaw(r.data.raw);
      setSummary({
        domain: q,
        serverName: parsed.serverName,
        serverAddress: parsed.serverAddress,
        queryTimeMs: elapsed,
      });
      const next = buildRows(r.data.records, r.data.raw);
      setRows(next);

      const ips = next
        .filter((row) => row.ip && isPublicIpv4(row.ip))
        .map((row) => row.ip!);
      if (ips.length) {
        const map = await fetchIpInfoBatch(ips, 5);
        setRows((prev) =>
          prev.map((row) =>
            row.ip && isPublicIpv4(row.ip)
              ? { ...row, geo: map.get(row.ip.trim()) ?? null }
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

  const primaryTypeLabel = (() => {
    const type = rows[0]?.type;
    if (!type) return null;
    if (type === "A") return "A (Address)";
    if (type === "AAAA") return "AAAA (IPv6)";
    return type;
  })();

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card
        className="border-[var(--color-accent)]/25"
        style={{
          backgroundImage:
            "linear-gradient(120deg, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 55%)",
        }}
      >
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="nslookup-domain"
              className="w-24 shrink-0 text-sm font-medium text-[var(--color-muted-foreground)]"
            >
              Domain
            </label>
            <div className="relative min-w-0 flex-1">
              <Input
                id="nslookup-domain"
                value={query}
                placeholder="example.com"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void run();
                  }
                }}
                className="pr-9"
              />
              {query && (
                <button
                  type="button"
                  title="Clear"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Button disabled={busy} onClick={() => void run()} className="shrink-0 gap-2">
              <Search className="h-4 w-4" />
              {busy ? "Looking up…" : "Lookup"}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-24">
            <span className="text-xs text-[var(--color-muted-foreground)]">Try examples:</span>
            {EXAMPLE_DOMAINS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setQuery(d)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/60 px-2.5 py-1 font-mono text-xs text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-foreground)]"
              >
                {d}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* Records */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <SectionTitle
                icon={Layers}
                iconClass="bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
              >
                {hasNameserverColumn ? "NS Records" : "DNS Records"}
              </SectionTitle>
              {rows.length > 0 && (
                <span className="rounded-md bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
                  {rows.length} Found
                </span>
              )}
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="w-8 py-2 pr-2 font-medium">#</th>
                    <SortableTh
                      label="Type"
                      active={sort.key === "type"}
                      dir={sort.dir}
                      onClick={() => toggle("type")}
                    />
                    {hasNameserverColumn ? (
                      <SortableTh
                        label="Nameserver"
                        active={sort.key === "nameserver"}
                        dir={sort.dir}
                        onClick={() => toggle("nameserver")}
                      />
                    ) : (
                      <SortableTh
                        label="Value"
                        active={sort.key === "nameserver"}
                        dir={sort.dir}
                        onClick={() => toggle("nameserver")}
                      />
                    )}
                    {hasNameserverColumn && (
                      <SortableTh
                        label="IP Address"
                        active={sort.key === "ip"}
                        dir={sort.dir}
                        onClick={() => toggle("ip")}
                      />
                    )}
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
                  {sortedRows.map((row, i) => {
                    const nameText = row.nameserver ?? row.display;
                    return (
                      <tr
                        key={`${row.display}-${i}`}
                        className="border-t border-[var(--color-border)]"
                      >
                        <td className="py-2 pr-2 text-xs text-[var(--color-muted-foreground)]">
                          {i + 1}
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className={cn(
                              "font-mono text-xs",
                              row.type === "A" || row.type === "AAAA"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-primary)]",
                            )}
                          >
                            {row.type}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-xs">{nameText}</span>
                            <CopyButton
                              text={nameText}
                              copied={copiedKey === `name-${i}`}
                              onCopy={(t) => copy(`name-${i}`, t)}
                            />
                          </span>
                        </td>
                        {hasNameserverColumn && (
                          <td className="py-2 pr-2">
                            {row.ip ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="font-mono text-xs">{row.ip}</span>
                                <CopyButton
                                  text={row.ip}
                                  copied={copiedKey === `ip-${i}`}
                                  onCopy={(t) => copy(`ip-${i}`, t)}
                                />
                              </span>
                            ) : (
                              <span className="text-[var(--color-muted-foreground)]">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 pr-2">
                          <CountryBadge
                            country={row.geo?.country}
                            empty={row.geo === undefined ? "…" : "—"}
                          />
                        </td>
                        <td className="py-2 text-xs text-[var(--color-muted-foreground)]">
                          {formatAsn(row.geo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && !busy && (
                <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                  {summary
                    ? "No records found for this domain."
                    : "Results appear here after lookup."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Raw output */}
          {raw && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <SectionTitle
                  icon={Terminal}
                  iconClass="bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                >
                  Raw Output
                </SectionTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => copy("raw", raw)}
                >
                  {copiedKey === "raw" ? (
                    <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/60 p-4 font-mono text-xs leading-relaxed">
                  {raw}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* Summary */}
          <Card>
            <CardHeader>
              <SectionTitle
                icon={BarChart3}
                iconClass="bg-[var(--color-success)]/15 text-[var(--color-success)]"
              >
                Summary
              </SectionTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                {
                  icon: Globe,
                  label: "Domain",
                  value: summary ? summary.domain : "—",
                },
                {
                  icon: Waypoints,
                  label: "Record Type",
                  value: primaryTypeLabel ?? "—",
                },
                {
                  icon: MessageSquareText,
                  label: "Total Records",
                  value: summary ? String(rows.length) : "—",
                },
                {
                  icon: Clock,
                  label: "Query Time",
                  value:
                    summary?.queryTimeMs != null ? `${summary.queryTimeMs} ms` : "—",
                },
                {
                  icon: Server,
                  label: "Server",
                  value: summary?.serverName
                    ? `${summary.serverName}${
                        summary.serverAddress ? ` (${summary.serverAddress})` : ""
                      }`
                    : "—",
                },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-muted)]/40 px-3 py-2.5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                  <span className="text-sm text-[var(--color-muted-foreground)]">{label}</span>
                  <span className="ml-auto max-w-[150px] truncate text-right text-sm font-medium">
                    {value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <SectionTitle
                icon={Lightbulb}
                iconClass="bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
              >
                Tips
              </SectionTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {TIPS.map(({ icon: Icon, color, title, text }) => (
                <div key={title} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      color,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{title}</div>
                    <div className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                      {text}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
