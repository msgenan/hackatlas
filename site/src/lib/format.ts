import type { Format, HackEvent, SourceKind, Team } from "./types";

export const NA = "Belirtilmemiş";

export const THEME_NAMES: Record<string, string> = {
  ai: "Yapay zekâ",
  web3: "Web3",
  fintech: "Fintech",
  health: "Sağlık",
  sustainability: "Sürdürülebilirlik",
  education: "Eğitim",
  games: "Oyun",
  mobility: "Mobilite",
  security: "Güvenlik",
  "social-impact": "Sosyal etki",
  hardware: "Donanım",
  open: "Serbest konu",
};

export const FORMAT_NAMES: Record<Format, string> = {
  online: "Online",
  in_person: "Yüz yüze",
  hybrid: "Hibrit",
};

export const SOURCE_NAMES: Record<SourceKind, string> = {
  devpost: "Devpost",
  mlh: "MLH",
  devfolio: "Devfolio",
  techcareer: "Techcareer",
  web: "Web",
  instagram: "Instagram",
  manual: "Ekleme formu",
};

const COUNTRIES: Record<string, string> = {
  TR: "Türkiye",
  US: "ABD",
  DE: "Almanya",
  GB: "Birleşik Krallık",
  NL: "Hollanda",
  IN: "Hindistan",
};

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (COUNTRIES[c]) return COUNTRIES[c]!;
  try {
    return new Intl.DisplayNames("tr", { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

export function themeName(t: string): string {
  return THEME_NAMES[t] ?? t;
}

/** "Online", "İstanbul, Türkiye", "Hibrit: Ankara"; venue when the city is missing, then "Yerinde"; null when nothing is known. */
export function placeText(e: Pick<HackEvent, "format" | "location">): string | null {
  const city = e.location?.city?.trim() || null;
  const venue = e.location?.venue?.trim() || null;
  const country = countryName(e.location?.country);
  if (e.format === "online") return "Online";
  if (e.format === "hybrid") {
    const h = city ?? country ?? venue;
    return h ? `Hibrit: ${h}` : "Hibrit";
  }
  const where = [city, country].filter(Boolean).join(", ") || venue;
  if (where) return where;
  return e.format === "in_person" ? "Yerinde" : null;
}

/** "2-5 kişi", "En fazla 4 kişi", "En az 2 kişi", "Bireysel". Solo-allowed teams read as a maximum. */
export function teamText(t: Team | null | undefined): string | null {
  const min = t?.min ?? null;
  const max = t?.max ?? null;
  if (min === null && max === null) return null;
  if (max === 1) return "Bireysel";
  if (min !== null && max !== null) {
    if (min === max) return `${max} kişi`;
    if (min <= 1) return `En fazla ${max} kişi`;
    return `${min}-${max} kişi`;
  }
  if (max !== null) return `En fazla ${max} kişi`;
  return `En az ${min} kişi`;
}

/** Prize as announced; falls back to a formatted amount. Original currency, never converted. */
export function prizeText(e: Pick<HackEvent, "prize">): string | null {
  const p = e.prize;
  if (!p) return null;
  if (p.text?.trim()) return p.text.trim();
  if (p.amount != null && p.amount > 0) {
    const n = new Intl.NumberFormat("tr-TR").format(p.amount);
    return p.currency ? `${n} ${p.currency}` : n;
  }
  return null;
}

/** Turkish accusative suffix after a number: 1'i, 2'si, 3'ü, 18'i, 40'ı. */
export function accusative(n: number): string {
  const last = n % 10;
  const byDigit: Record<number, string> = { 1: "i", 2: "si", 3: "ü", 4: "ü", 5: "i", 6: "sı", 7: "si", 8: "i", 9: "u" };
  if (n === 0) return "'ı";
  if (last !== 0) return `'${byDigit[last]}`;
  if (n % 1000 === 0) return "'i";
  if (n % 100 === 0) return "'ü";
  const tens: Record<number, string> = { 10: "u", 20: "si", 30: "u", 40: "ı", 50: "si", 60: "ı", 70: "i", 80: "i", 90: "ı" };
  return `'${tens[n % 100]}`;
}

/** "124 hackathon" or "124 sonuçtan 18'i". */
export function countText(total: number, shown: number): string {
  if (total === shown) return `${total} hackathon`;
  return `${total} sonuçtan ${shown}${accusative(shown)}`;
}

export const ISSUE_NEW = "https://github.com/msgenan/hackatlas/issues/new?template=add-hackathon.yml";

export function fixIssueUrl(name: string, pageUrl: string): string {
  const q = new URLSearchParams({ title: `Düzeltme: ${name}`, body: `Sayfa: ${pageUrl}\n\nNe yanlış ya da eksik?\n` });
  return `https://github.com/msgenan/hackatlas/issues/new?${q.toString()}`;
}
