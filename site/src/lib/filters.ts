import type { EventMeta, Format } from "./types";
import { countdownStatus, groupOf, type Group } from "./countdown";
import { THEMES } from "./types";

/** katilabilir: Turkey (any format) + every online and hybrid event. */
export type Region = "katilabilir" | "tr" | "tumu";
export type Sort = "son-basvuru" | "odul" | "tarih" | "yeni";

export interface Filters {
  q: string;
  bolge: Region;
  format: Format[];
  konu: string[];
  odul: boolean;
  sirala: Sort;
}

export const DEFAULT_FILTERS: Filters = { q: "", bolge: "katilabilir", format: [], konu: [], odul: false, sirala: "son-basvuru" };

const FORMATS: Format[] = ["online", "in_person", "hybrid"];
const SORTS: Sort[] = ["son-basvuru", "odul", "tarih", "yeni"];

function csv(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export function parseFilters(params: URLSearchParams): Filters {
  const bolge = params.get("bolge");
  const sirala = params.get("sirala");
  return {
    q: (params.get("q") ?? "").trim(),
    bolge: bolge === "tr" || bolge === "tumu" ? bolge : "katilabilir",
    format: csv(params.get("format")).filter((f): f is Format => (FORMATS as string[]).includes(f)),
    konu: csv(params.get("konu")).filter((t) => (THEMES as readonly string[]).includes(t)),
    odul: params.get("odul") === "1",
    sirala: SORTS.includes(sirala as Sort) ? (sirala as Sort) : "son-basvuru",
  };
}

/** Writes only non-default values into `base` (other params, such as the calendar month, are kept). */
export function serializeFilters(f: Filters, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of ["q", "bolge", "format", "konu", "odul", "sirala"]) p.delete(k);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.bolge !== "katilabilir") p.set("bolge", f.bolge);
  if (f.format.length) p.set("format", f.format.join(","));
  if (f.konu.length) p.set("konu", f.konu.join(","));
  if (f.odul) p.set("odul", "1");
  if (f.sirala !== "son-basvuru") p.set("sirala", f.sirala);
  return p;
}

export function isFiltered(f: Filters): boolean {
  return !!f.q || f.bolge !== "katilabilir" || f.format.length > 0 || f.konu.length > 0 || f.odul;
}

/** Lower case with Turkish letters folded, for forgiving search. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function matches(m: EventMeta, f: Filters): boolean {
  if (f.bolge === "tr" && m.country !== "TR") return false;
  if (f.bolge === "katilabilir" && m.country !== "TR" && m.format !== "online" && m.format !== "hybrid") return false;
  if (f.format.length && (!m.format || !f.format.includes(m.format))) return false;
  if (f.konu.length && !f.konu.some((t) => m.themes.includes(t))) return false;
  if (f.odul && !m.hasPrize) return false;
  const q = fold(f.q);
  if (q && !q.split(/\s+/).every((w) => m.search.includes(w))) return false;
  return true;
}

function cmpNullLast<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmp(a, b);
}
const asc = (x: string | number, y: string | number) => (x < y ? -1 : x > y ? 1 : 0);

/** Comparator for the chosen sort. Ties fall back to name for a stable, predictable order. */
export function comparator(sort: Sort): (a: EventMeta, b: EventMeta) => number {
  const byName = (a: EventMeta, b: EventMeta) => a.name.localeCompare(b.name, "tr");
  return (a, b) => {
    let c = 0;
    switch (sort) {
      case "son-basvuru":
        c = cmpNullLast(a.deadline ?? a.starts, b.deadline ?? b.starts, asc) || cmpNullLast(a.starts, b.starts, asc);
        break;
      case "odul":
        c = cmpNullLast(a.prizeUsd, b.prizeUsd, (x, y) => y - x);
        break;
      case "tarih":
        c = cmpNullLast(a.starts, b.starts, asc);
        break;
      case "yeni":
        c = a.added < b.added ? 1 : a.added > b.added ? -1 : 0;
        break;
    }
    return c || byName(a, b);
  };
}

export function groupFor(m: EventMeta, today: string): Group {
  return groupOf({ deadline: m.deadline, starts: m.starts, ends: m.ends }, today);
}

export function isEnded(m: EventMeta, today: string): boolean {
  return countdownStatus({ deadline: m.deadline, starts: m.starts, ends: m.ends }, today).kind === "ended";
}
