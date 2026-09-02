import { useEffect, useState, type ReactNode } from "react";
import { HwVendorLogo } from "@/components/HwVendorLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  rpc,
  type DiskInfo,
  type GpuInfo,
  type HardwareInventory,
  type ThermalSnapshot,
} from "@/lib/api";
import { matchHwVendor } from "@/lib/hwVendor";
import { formatBytes } from "@/lib/systemMetrics";
import { formatCelsius, pickGpuSensors } from "@/lib/thermal";

function formatMhz(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} GHz`;
  return `${value} MHz`;
}

function brandModel(brand: string, model: string): string {
  const b = brand.trim();
  const m = model.trim();
  if (b && m) {
    if (m.toLowerCase().includes(b.toLowerCase())) return m;
    return `${b} ${m}`;
  }
  return b || m || "—";
}

function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

function HwCard({
  title,
  brand,
  model,
  children,
}: {
  title: string;
  brand: string;
  model: string;
  children: ReactNode;
}) {
  const vendor = matchHwVendor(brand, model);
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 py-3">
        <HwVendorLogo vendor={vendor} className="h-10 w-14 object-contain" />
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="truncate text-sm text-[var(--color-muted-foreground)]">
            {brandModel(brand, model)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function DiskCards({ disks, kind, title }: { disks: DiskInfo[]; kind: "ssd" | "hdd"; title: string }) {
  const filtered = disks.filter((d) => d.kind === kind);
  if (filtered.length === 0) return null;
  return (
    <>
      {filtered.map((d, i) => (
        <HwCard
          key={`${kind}-${i}-${d.model}`}
          title={filtered.length > 1 ? `${title} ${i + 1}` : title}
          brand={d.brand}
          model={d.model}
        >
          <SpecRow label="Capacity">{formatBytes(d.capacity_bytes)}</SpecRow>
        </HwCard>
      ))}
    </>
  );
}

function GpuCards({
  gpus,
  temps,
}: {
  gpus: GpuInfo[];
  temps: { label: string; value: string }[];
}) {
  if (gpus.length === 0) {
    return (
      <HwCard title="GPU" brand="" model="">
        <p className="text-sm text-[var(--color-muted-foreground)]">No GPU detected</p>
      </HwCard>
    );
  }
  return (
    <>
      {gpus.map((g, i) => (
        <HwCard
          key={`gpu-${i}-${g.model}`}
          title={gpus.length > 1 ? `GPU ${i + 1}` : "GPU"}
          brand={g.brand}
          model={g.model}
        >
          <SpecRow label="Memory">
            {g.memory_bytes != null ? formatBytes(g.memory_bytes) : "—"}
          </SpecRow>
          <SpecRow label="CUDA">{g.cuda_cores != null ? g.cuda_cores.toLocaleString() : "—"}</SpecRow>
          <SpecRow label="Tensor">{g.tensor_cores != null ? g.tensor_cores.toLocaleString() : "—"}</SpecRow>
          <SpecRow label="Temperature">{temps[i]?.value ?? "—"}</SpecRow>
        </HwCard>
      ))}
    </>
  );
}

export function InfoPage() {
  const [inv, setInv] = useState<HardwareInventory | null>(null);
  const [gpuTemps, setGpuTemps] = useState<{ label: string; value: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    rpc<{ type: "HardwareInventory"; data: HardwareInventory }>({
      method: "GetHardwareInventory",
    })
      .then((r) => {
        if (!alive) return;
        setInv(r.data);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    const loadTemps = () => {
      rpc<{ type: "ThermalSnapshot"; data: ThermalSnapshot }>({
        method: "GetThermalSnapshot",
      })
        .then((r) => {
          if (!alive) return;
          setGpuTemps(
            pickGpuSensors(r.data.sensors).map((s) => ({
              label: s.hardware_name,
              value: formatCelsius(s.celsius),
            })),
          );
        })
        .catch(() => {
          if (alive) setGpuTemps([]);
        });
    };
    loadTemps();
    const id = setInterval(loadTemps, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const cpu = inv?.cpu;
  const mem = inv?.memory;
  const mb = inv?.motherboard;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Info</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Hardware inventory for this machine
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <HwCard
          title="CPU"
          brand={cpu?.brand ?? ""}
          model={cpu?.model ?? ""}
        >
          <SpecRow label="Base speed">{formatMhz(cpu?.base_speed_mhz)}</SpecRow>
          <SpecRow label="Cores">
            {cpu?.physical_cores != null ? String(cpu.physical_cores) : "—"}
          </SpecRow>
          <SpecRow label="Logical processors">
            {cpu && cpu.logical_processors > 0 ? String(cpu.logical_processors) : "—"}
          </SpecRow>
        </HwCard>

        <HwCard
          title="Memory"
          brand={mem?.brand ?? ""}
          model={mem?.model ?? ""}
        >
          <SpecRow label="Size">{mem ? formatBytes(mem.size_bytes) : "—"}</SpecRow>
          <SpecRow label="Speed">{formatMhz(mem?.speed_mhz)}</SpecRow>
        </HwCard>

        {inv && <DiskCards disks={inv.disks} kind="ssd" title="SSD" />}
        {inv && <DiskCards disks={inv.disks} kind="hdd" title="HDD" />}

        <GpuCards gpus={inv?.gpus ?? []} temps={gpuTemps} />

        <HwCard
          title="Motherboard"
          brand={mb?.brand ?? ""}
          model={mb?.model ?? ""}
        >
          <SpecRow label="RAM slots">
            {mb?.ram_slots != null ? String(mb.ram_slots) : "—"}
          </SpecRow>
        </HwCard>
      </div>
    </div>
  );
}
