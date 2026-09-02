import { lookupIpInfoViaApi } from "@/lib/tools";

export type IpInfo = {
  ip: string;
  asn: number | null;
  as: string | null;
  country: string | null;
};

const cache = new Map<string, IpInfo | null>();
const inflight = new Map<string, Promise<IpInfo | null>>();

/** Country display name (as returned by asip-api) → ISO 3166-1 alpha-2. */
const COUNTRY_TO_ISO2: Record<string, string> = {
  Afghanistan: "af",
  Albania: "al",
  Algeria: "dz",
  Andorra: "ad",
  Angola: "ao",
  Argentina: "ar",
  Armenia: "am",
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Bahamas: "bs",
  Bahrain: "bh",
  Bangladesh: "bd",
  Belarus: "by",
  Belgium: "be",
  Belize: "bz",
  Benin: "bj",
  Bermuda: "bm",
  Bhutan: "bt",
  Bolivia: "bo",
  "Bosnia and Herzegovina": "ba",
  Botswana: "bw",
  Brazil: "br",
  Brunei: "bn",
  Bulgaria: "bg",
  "Burkina Faso": "bf",
  Burundi: "bi",
  Cambodia: "kh",
  Cameroon: "cm",
  Canada: "ca",
  "Cape Verde": "cv",
  Chad: "td",
  Chile: "cl",
  China: "cn",
  Colombia: "co",
  "Costa Rica": "cr",
  Croatia: "hr",
  Cuba: "cu",
  Cyprus: "cy",
  "Czech Republic": "cz",
  Czechia: "cz",
  Denmark: "dk",
  Djibouti: "dj",
  "Dominican Republic": "do",
  Ecuador: "ec",
  Egypt: "eg",
  "El Salvador": "sv",
  Estonia: "ee",
  Ethiopia: "et",
  Fiji: "fj",
  Finland: "fi",
  France: "fr",
  Georgia: "ge",
  Germany: "de",
  Ghana: "gh",
  Greece: "gr",
  Guatemala: "gt",
  Honduras: "hn",
  "Hong Kong": "hk",
  Hungary: "hu",
  Iceland: "is",
  India: "in",
  Indonesia: "id",
  Iran: "ir",
  "Islamic Republic of Iran": "ir",
  Iraq: "iq",
  Ireland: "ie",
  Israel: "il",
  Italy: "it",
  Jamaica: "jm",
  Japan: "jp",
  Jordan: "jo",
  Kazakhstan: "kz",
  Kenya: "ke",
  Kuwait: "kw",
  Kyrgyzstan: "kg",
  Laos: "la",
  Latvia: "lv",
  Lebanon: "lb",
  Libya: "ly",
  Liechtenstein: "li",
  Lithuania: "lt",
  Luxembourg: "lu",
  Macao: "mo",
  Macau: "mo",
  Madagascar: "mg",
  Malaysia: "my",
  Maldives: "mv",
  Malta: "mt",
  Mauritius: "mu",
  Mexico: "mx",
  Moldova: "md",
  Monaco: "mc",
  Mongolia: "mn",
  Montenegro: "me",
  Morocco: "ma",
  Mozambique: "mz",
  Myanmar: "mm",
  Namibia: "na",
  Nepal: "np",
  Netherlands: "nl",
  "New Zealand": "nz",
  Nicaragua: "ni",
  Nigeria: "ng",
  "North Macedonia": "mk",
  Norway: "no",
  Oman: "om",
  Pakistan: "pk",
  Panama: "pa",
  Paraguay: "py",
  Peru: "pe",
  Philippines: "ph",
  Poland: "pl",
  Portugal: "pt",
  "Puerto Rico": "pr",
  Qatar: "qa",
  Romania: "ro",
  Russia: "ru",
  "Russian Federation": "ru",
  Rwanda: "rw",
  "Saudi Arabia": "sa",
  Senegal: "sn",
  Serbia: "rs",
  Singapore: "sg",
  Slovakia: "sk",
  Slovenia: "si",
  "South Africa": "za",
  "South Korea": "kr",
  "Korea, Republic of": "kr",
  Spain: "es",
  "Sri Lanka": "lk",
  Sudan: "sd",
  Sweden: "se",
  Switzerland: "ch",
  Syria: "sy",
  Taiwan: "tw",
  Tajikistan: "tj",
  Tanzania: "tz",
  Thailand: "th",
  "Trinidad and Tobago": "tt",
  Tunisia: "tn",
  Turkey: "tr",
  Türkiye: "tr",
  Turkmenistan: "tm",
  Uganda: "ug",
  Ukraine: "ua",
  "United Arab Emirates": "ae",
  "United Kingdom": "gb",
  "United States": "us",
  "United States of America": "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
  Venezuela: "ve",
  Vietnam: "vn",
  "Viet Nam": "vn",
  Yemen: "ye",
  Zambia: "zm",
  Zimbabwe: "zw",
};

export function countryToIso2(countryName: string | null | undefined): string | null {
  if (!countryName?.trim()) return null;
  const key = countryName.trim();
  return COUNTRY_TO_ISO2[key] ?? COUNTRY_TO_ISO2[key.replace(/^The\s+/i, "")] ?? null;
}

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

export function looksLikeIpv4(value: string | null | undefined): boolean {
  if (!value) return false;
  return IPV4_RE.test(value.trim());
}

/** True for globally routable IPv4 (skip private, loopback, link-local, CGNAT, etc.). */
export function isPublicIpv4(ip: string | null | undefined): boolean {
  if (!looksLikeIpv4(ip)) return false;
  const parts = ip!.trim().split(".").map(Number);
  const [a, b] = parts;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast / reserved
  return true;
}

export function formatAsn(info: IpInfo | null | undefined): string {
  if (info === undefined) return "…";
  if (!info) return "—";
  const parts: string[] = [];
  if (info.as) parts.push(info.as);
  if (info.asn != null) parts.push(`AS${info.asn}`);
  return parts.length ? parts.join(" · ") : "—";
}

export async function fetchIpInfo(ip: string): Promise<IpInfo | null> {
  const key = ip.trim();
  if (!key || !isPublicIpv4(key)) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      // Must go through Rust — browser fetch sends Origin and asip-api returns 403.
      const info = (await lookupIpInfoViaApi(key)) as IpInfo | null;
      cache.set(key, info);
      return info;
    } catch {
      // Do not permanently cache failures (transient network / API errors).
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Lookup many IPs with a concurrency cap; results keyed by IP. */
export async function fetchIpInfoBatch(
  ips: string[],
  concurrency = 5,
): Promise<Map<string, IpInfo | null>> {
  const unique = [...new Set(ips.map((i) => i.trim()).filter(Boolean))];
  const out = new Map<string, IpInfo | null>();
  let idx = 0;

  async function worker() {
    while (idx < unique.length) {
      const i = idx++;
      const ip = unique[i]!;
      out.set(ip, await fetchIpInfo(ip));
    }
  }

  const n = Math.max(1, Math.min(concurrency, unique.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}
