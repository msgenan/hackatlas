import type { DateOnly } from "./types";

export const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
export const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Monday first. */
export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
export const WEEKDAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(v: unknown): v is DateOnly {
  if (typeof v !== "string" || !ISO.test(v)) return false;
  return toISO(toDays(v)) === v;
}

/** Days since 1970-01-01 for an ISO date (timezone free). */
export function toDays(iso: DateOnly): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return Math.round(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / 86_400_000);
}

export function toISO(days: number): DateOnly {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(iso: DateOnly, n: number): DateOnly {
  return toISO(toDays(iso) + n);
}

export function diffDays(a: DateOnly, b: DateOnly): number {
  return toDays(a) - toDays(b);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(iso: DateOnly): number {
  return (new Date(toDays(iso) * 86_400_000).getUTCDay() + 6) % 7;
}

export function parts(iso: DateOnly): { y: number; m: number; d: number } {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return { y: +m[1]!, m: +m[2]!, d: +m[3]! };
}

/** Today in Turkey as ISO date, optionally from an explicit Date. */
export function todayISO(now: Date = new Date()): DateOnly {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
}

/** "14 Kasım"; year appended only when it is not the current year. */
export function formatDay(iso: DateOnly, today: DateOnly): string {
  const p = parts(iso);
  const base = `${p.d} ${MONTHS[p.m - 1]}`;
  return p.y === parts(today).y ? base : `${base} ${p.y}`;
}

/** "12-13 Aralık", "28 Kasım - 2 Aralık", "28 Aralık 2026 - 3 Ocak 2027". */
export function formatRange(start: DateOnly | null, end: DateOnly | null, today: DateOnly): string | null {
  if (!start && !end) return null;
  if (!start || !end || start === end) return formatDay((start ?? end)!, today);
  const a = parts(start);
  const b = parts(end);
  const cy = parts(today).y;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} - ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  const yearSuffix = a.y === cy ? "" : ` ${a.y}`;
  if (a.m === b.m) return `${a.d}-${b.d} ${MONTHS[a.m - 1]}${yearSuffix}`;
  return `${a.d} ${MONTHS[a.m - 1]} - ${b.d} ${MONTHS[b.m - 1]}${yearSuffix}`;
}

/** Short rail label: "17 Kas". */
export function formatShort(iso: DateOnly): string {
  const p = parts(iso);
  return `${p.d} ${MONTHS_SHORT[p.m - 1]}`;
}

/** Weekday + date: "Cuma, 14 Kasım". */
export function formatWeekdayDay(iso: DateOnly, today: DateOnly): string {
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${formatDay(iso, today)}`;
}

export function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Cells of a Monday-first month grid (always full weeks). */
export function monthCells(y: number, m: number): DateOnly[] {
  const first = `${monthKey(y, m)}-01`;
  const start = toDays(first) - weekdayIndex(first);
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${monthKey(y, m + 1)}-01`;
  const lastDay = toDays(nextFirst) - 1;
  const end = lastDay + (6 - weekdayIndex(toISO(lastDay)));
  const out: DateOnly[] = [];
  for (let d = start; d <= end; d++) out.push(toISO(d));
  return out;
}
