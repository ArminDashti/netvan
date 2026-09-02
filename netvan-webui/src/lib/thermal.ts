import type { HardwareKind, ThermalSensor } from "@/lib/api";

export function formatCelsius(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return "—";
  return `${Math.round(c)} °C`;
}

function rankCpuName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("package")) return 0;
  if (n.includes("tctl") || n.includes("tdie")) return 1;
  if (n.includes("average")) return 2;
  if (n.includes("cpu")) return 3;
  return 9;
}

export function pickCpuSensor(sensors: ThermalSensor[]): ThermalSensor | undefined {
  const cpu = sensors.filter((s) => s.hardware_kind === "cpu");
  if (cpu.length === 0) return undefined;
  return [...cpu].sort((a, b) => rankCpuName(a.sensor_name) - rankCpuName(b.sensor_name))[0];
}

function rankGpuName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("gpu core") || n === "core" || n.includes("hot spot") || n.includes("hotspot")) {
    return n.includes("gpu core") ? 0 : 1;
  }
  return 5;
}

/** One sensor per GPU hardware name. */
export function pickGpuSensors(sensors: ThermalSensor[]): ThermalSensor[] {
  const gpus = sensors.filter((s) => s.hardware_kind === "gpu");
  const byHw = new Map<string, ThermalSensor[]>();
  for (const s of gpus) {
    const key = s.hardware_name || s.id;
    const list = byHw.get(key) ?? [];
    list.push(s);
    byHw.set(key, list);
  }
  const out: ThermalSensor[] = [];
  for (const list of byHw.values()) {
    const picked = [...list].sort((a, b) => rankGpuName(a.sensor_name) - rankGpuName(b.sensor_name))[0];
    if (picked) out.push(picked);
  }
  return out;
}

export function otherSensors(sensors: ThermalSensor[]): ThermalSensor[] {
  return sensors.filter((s) => s.hardware_kind !== "cpu" && s.hardware_kind !== "gpu");
}

export function groupByHardware(sensors: ThermalSensor[]): {
  key: string;
  kind: HardwareKind;
  hardwareName: string;
  sensors: ThermalSensor[];
}[] {
  const map = new Map<string, ThermalSensor[]>();
  for (const s of sensors) {
    const key = `${s.hardware_kind}\0${s.hardware_name}`;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, list]) => {
    const first = list[0]!;
    return {
      key,
      kind: first.hardware_kind,
      hardwareName: first.hardware_name || "Unknown",
      sensors: list,
    };
  });
}

export function kindLabel(kind: HardwareKind): string {
  switch (kind) {
    case "cpu":
      return "CPU";
    case "gpu":
      return "GPU";
    case "motherboard":
      return "Motherboard";
    case "storage":
      return "Storage";
    case "memory":
      return "Memory";
    case "other":
      return "Other";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
