import type { NicInfo } from "@/lib/api";

/** Return the NIC id with the highest rx+tx counters, or "" if none. */
export function pickHighestTrafficNic(nics: NicInfo[]): string {
  let bestId = "";
  let bestBytes = -1;
  for (const n of nics) {
    const total = (n.rx_bytes ?? 0) + (n.tx_bytes ?? 0);
    if (total > bestBytes) {
      bestBytes = total;
      bestId = n.id;
    }
  }
  return bestId;
}
