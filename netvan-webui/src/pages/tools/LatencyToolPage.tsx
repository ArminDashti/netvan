import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rpc } from "@/lib/api";
import { runPingLive } from "@/lib/tools";
import { cn, formatMs } from "@/lib/utils";

type Mode = "icmp" | "http";

export function LatencyToolPage() {
  const [mode, setMode] = useState<Mode>("icmp");

  const [target, setTarget] = useState("1.1.1.1");
  const [packetSize, setPacketSize] = useState(32);
  const [count, setCount] = useState(4);
  const [lines, setLines] = useState<string[]>([]);
  const [pingBusy, setPingBusy] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const [url, setUrl] = useState("https://www.google.com/generate_204");
  const [httpOutput, setHttpOutput] = useState("");
  const [httpBusy, setHttpBusy] = useState(false);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const runPing = async () => {
    setPingBusy(true);
    setLines([]);
    try {
      await runPingLive({
        target,
        count: Math.max(1, count),
        packetSize: Math.max(0, packetSize),
        onLine: (p) => {
          if (p.phase === "line" && p.line != null) {
            setLines((prev) => [...prev, p.line!]);
          }
        },
      });
    } catch (e) {
      setLines((prev) => [...prev, e instanceof Error ? e.message : String(e)]);
    } finally {
      setPingBusy(false);
    }
  };

  const runHttp = async () => {
    setHttpBusy(true);
    try {
      const r = await rpc<{
        type: "HttpLatencyResult";
        data: {
          dns_ms: number | null;
          connect_ms: number | null;
          tls_ms: number | null;
          ttfb_ms: number | null;
          total_ms: number | null;
          status_code: number | null;
          error: string | null;
        };
      }>({
        method: "RunHttpLatency",
        params: { url, nic_id: null },
      });
      const d = r.data;
      setHttpOutput(
        d.error
          ? d.error
          : `HTTP ${d.status_code}\nDNS ${formatMs(d.dns_ms)}\nTCP ${formatMs(d.connect_ms)}\nTLS ${formatMs(d.tls_ms)}\nTTFB ${formatMs(d.ttfb_ms)}\nTotal ${formatMs(d.total_ms)}`,
      );
    } catch (e) {
      setHttpOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setHttpBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={mode === "icmp" ? "default" : "outline"}
          onClick={() => setMode("icmp")}
        >
          ICMP
        </Button>
        <Button
          size="sm"
          variant={mode === "http" ? "default" : "outline"}
          onClick={() => setMode("http")}
        >
          HTTP
        </Button>
      </div>

      {mode === "icmp" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Ping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[12rem] flex-1 text-sm">
                  <span className="text-[var(--color-muted-foreground)]">Address</span>
                  <Input
                    className="mt-1"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="1.1.1.1 or host.example"
                  />
                </label>
                <label className="w-[8.5rem] shrink-0 text-sm">
                  <span className="text-[var(--color-muted-foreground)]">Packet size (bytes)</span>
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    max={65500}
                    value={packetSize}
                    onChange={(e) => setPacketSize(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="w-[8.5rem] shrink-0 text-sm">
                  <span className="text-[var(--color-muted-foreground)]">Number of packets</span>
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) || 1)}
                  />
                </label>
                <Button
                  className="shrink-0"
                  disabled={pingBusy}
                  onClick={() => void runPing()}
                >
                  {pingBusy ? "Pinging…" : "Ping"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Output</CardTitle>
            </CardHeader>
            <CardContent>
              <pre
                ref={preRef}
                className={cn(
                  "max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-muted)] p-3 font-mono text-xs",
                )}
              >
                {lines.length ? lines.join("\n") : "Results appear here."}
              </pre>
            </CardContent>
          </Card>
        </>
      )}

      {mode === "http" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>HTTP latency</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button disabled={httpBusy} onClick={() => void runHttp()}>
                Probe
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Output</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-muted)] p-3 font-mono text-xs">
                {httpOutput || "Results appear here."}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
