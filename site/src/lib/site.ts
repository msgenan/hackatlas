import { buildToday, loadEvents, loadFx } from "./data";
import { toView, type ViewEvent } from "./events";
import { comparator, DEFAULT_FILTERS, matches } from "./filters";

export interface SiteData {
  today: string;
  all: ViewEvent[];
  /** Not over yet: open, closed and undated, sorted by deadline. */
  upcoming: ViewEvent[];
  /** Over, newest first. */
  ended: ViewEvent[];
  updated: string | null;
}

let cache: SiteData | null = null;

export function site(): SiteData {
  if (cache) return cache;
  const today = buildToday();
  const fx = loadFx();
  const all = loadEvents().map((e) => toView(e, fx, today));
  const byDeadline = comparator("son-basvuru");
  const upcoming = all.filter((v) => v.group !== "ended").sort((a, b) => byDeadline(a.meta, b.meta));
  const ended = all
    .filter((v) => v.group === "ended")
    .sort((a, b) => ((b.e.ends_on ?? b.e.starts_on ?? "") < (a.e.ends_on ?? a.e.starts_on ?? "") ? -1 : 1));
  // Latest data change, as a calendar day in Turkey (UTC late evening is already the next day there).
  const istanbulDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const updated = all.map((v) => istanbulDay(v.e.updated_at)).sort().at(-1) ?? null;
  cache = { today, all, upcoming, ended, updated };
  return cache;
}

/** Events a Turkish team can join by default; what the first paint counts. */
export function defaultVisible(vs: ViewEvent[]): ViewEvent[] {
  return vs.filter((v) => matches(v.meta, DEFAULT_FILTERS));
}
