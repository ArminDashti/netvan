/** Format bytes as GiB / MiB for system metric pages. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(2)} GB`;
  const mib = bytes / (1024 ** 2);
  if (mib >= 1) return `${mib.toFixed(1)} MB`;
  const kib = bytes / 1024;
  if (kib >= 1) return `${kib.toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export type MetricSummary = {
  avg: number | null;
  min: number | null;
  max: number | null;
  sample_count: number;
};

/** Client fallback when RPC summary is missing. */
export function summarizeSeries(
  samples: { value: number }[],
): MetricSummary {
  if (samples.length === 0) {
    return { avg: null, min: null, max: null, sample_count: 0 };
  }
  let sum = 0;
  let min = samples[0]!.value;
  let max = samples[0]!.value;
  for (const s of samples) {
    sum += s.value;
    min = Math.min(min, s.value);
    max = Math.max(max, s.value);
  }
  return {
    avg: sum / samples.length,
    min,
    max,
    sample_count: samples.length,
  };
}
