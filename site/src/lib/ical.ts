import type { DateOnly, HackEvent } from "./types";
import { addDays } from "./dates";

const CRLF = "\r\n";

/** RFC 5545 TEXT escaping. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8), never splitting a character; continuation lines start with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // the leading space counts as one octet
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join(CRLF + " ");
}

const compact = (d: DateOnly) => d.replace(/-/g, "");

/** 2026-11-12T09:00:00Z -> 20261112T090000Z */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const t = Number.isNaN(d.getTime()) ? new Date(0) : d;
  return t.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function allDay(uid: string, start: DateOnly, endInclusive: DateOnly, summary: string, e: HackEvent, pageUrl: string): string[] {
  const desc = [e.summary, `Başvuru: ${e.url}`, `Sayfa: ${pageUrl}`].filter(Boolean).join("\n");
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(e.updated_at)}`,
    `DTSTART;VALUE=DATE:${compact(start)}`,
    `DTEND;VALUE=DATE:${compact(addDays(endInclusive, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(desc)}`,
    `URL:${pageUrl}`,
    ...(e.location?.city ? [`LOCATION:${escapeText([e.location.venue, e.location.city].filter(Boolean).join(", "))}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

/** VEVENT lines for one hackathon: its application deadline and its date range. */
export function eventComponents(e: HackEvent, pageUrl: string): string[] {
  const lines: string[] = [];
  if (e.deadline) lines.push(...allDay(`${e.id}-deadline@hackatlas`, e.deadline, e.deadline, `Son başvuru: ${e.name}`, e, pageUrl));
  const start = e.starts_on ?? e.ends_on;
  const end = e.ends_on ?? e.starts_on;
  if (start && end) lines.push(...allDay(`${e.id}@hackatlas`, start, end, e.name, e, pageUrl));
  return lines;
}

export function hasCalendarDates(e: HackEvent): boolean {
  return !!(e.deadline || e.starts_on || e.ends_on);
}

export function buildCalendar(name: string, events: HackEvent[], pageUrl: (e: HackEvent) => string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hackatlas//TR//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/Istanbul",
    ...events.flatMap((e) => eventComponents(e, pageUrl(e))),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
