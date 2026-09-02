export type HwVendorId =
  | "intel"
  | "amd"
  | "nvidia"
  | "samsung"
  | "skhynix"
  | "micron"
  | "kingston"
  | "crucial"
  | "wd"
  | "seagate"
  | "toshiba"
  | "kioxia"
  | "asus"
  | "msi"
  | "gigabyte"
  | "asrock"
  | "corsair"
  | "apple"
  | "qualcomm"
  | "microsoft"
  | "generic";

const VENDORS: { id: HwVendorId; patterns: RegExp[] }[] = [
  { id: "intel", patterns: [/\bintel\b/i, /\bgenuineintel\b/i] },
  { id: "amd", patterns: [/\bamd\b/i, /\badvanced micro devices\b/i, /\bryzen\b/i, /\bradeon\b/i] },
  { id: "nvidia", patterns: [/\bnvidia\b/i, /\bgeforce\b/i, /\brtx\b/i, /\bgtx\b/i] },
  { id: "samsung", patterns: [/\bsamsung\b/i] },
  { id: "skhynix", patterns: [/\bsk\s*hynix\b/i, /\bhynix\b/i] },
  { id: "micron", patterns: [/\bmicron\b/i] },
  { id: "kingston", patterns: [/\bkingston\b/i] },
  { id: "crucial", patterns: [/\bcrucial\b/i] },
  { id: "wd", patterns: [/\bwestern digital\b/i, /\bwdc\b/i, /\bwd\b/i, /\bsandisk\b/i] },
  { id: "seagate", patterns: [/\bseagate\b/i] },
  { id: "toshiba", patterns: [/\btoshiba\b/i] },
  { id: "kioxia", patterns: [/\bkioxia\b/i] },
  { id: "asus", patterns: [/\basus\b/i, /\basustek\b/i] },
  { id: "msi", patterns: [/\bmsi\b/i, /\bmicro-star\b/i] },
  { id: "gigabyte", patterns: [/\bgigabyte\b/i] },
  { id: "asrock", patterns: [/\basrock\b/i] },
  { id: "corsair", patterns: [/\bcorsair\b/i] },
  { id: "apple", patterns: [/\bapple\b/i] },
  { id: "qualcomm", patterns: [/\bqualcomm\b/i] },
  { id: "microsoft", patterns: [/\bmicrosoft\b/i] },
];

/** Resolve hardware vendor from brand + model text. */
export function matchHwVendor(brand: string, model = ""): HwVendorId {
  const text = `${brand} ${model}`;
  for (const v of VENDORS) {
    if (v.patterns.some((p) => p.test(text))) return v.id;
  }
  return "generic";
}
