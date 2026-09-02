export type NicVendorId =
  | "intel"
  | "realtek"
  | "qualcomm"
  | "broadcom"
  | "mediatek"
  | "killer"
  | "microsoft"
  | "marvell"
  | "atheros"
  | "tplink"
  | "cisco"
  | "vmware"
  | "virtualbox"
  | "hyperv"
  | "samsung"
  | "apple";

const VENDORS: { id: NicVendorId; patterns: RegExp[] }[] = [
  { id: "intel", patterns: [/\bintel\b/i] },
  { id: "realtek", patterns: [/\brealtek\b/i, /\brtl\d/i] },
  { id: "qualcomm", patterns: [/\bqualcomm\b/i, /\batheros\b/i, /\bqca\d/i] },
  { id: "broadcom", patterns: [/\bbroadcom\b/i, /\bbcm\d/i] },
  { id: "mediatek", patterns: [/\bmediatek\b/i, /\bmtk\b/i] },
  { id: "killer", patterns: [/\bkiller\b/i] },
  { id: "microsoft", patterns: [/\bmicrosoft\b/i, /\bhyper-?v\b/i, /\bwi-?fi direct\b/i] },
  { id: "marvell", patterns: [/\bmarvell\b/i] },
  { id: "atheros", patterns: [/\batheros\b/i] },
  { id: "tplink", patterns: [/\btp-?link\b/i] },
  { id: "cisco", patterns: [/\bcisco\b/i] },
  { id: "vmware", patterns: [/\bvmware\b/i, /\bvmxnet\b/i] },
  { id: "virtualbox", patterns: [/\bvirtualbox\b/i, /\bvbox\b/i] },
  { id: "hyperv", patterns: [/\bhyper-?v\b/i] },
  { id: "samsung", patterns: [/\bsamsung\b/i] },
  { id: "apple", patterns: [/\bapple\b/i] },
];

/** Resolve NIC vendor from friendly name + description. */
export function matchNicVendor(name: string, description: string): NicVendorId | null {
  const text = `${name} ${description}`;
  for (const v of VENDORS) {
    if (v.patterns.some((p) => p.test(text))) return v.id;
  }
  return null;
}
