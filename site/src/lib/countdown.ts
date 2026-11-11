import type { DateOnly } from "./types";
import { diffDays } from "./dates";

export type StatusKind = "today" | "soon" | "week" | "later" | "nodeadline" | "unknown" | "closed" | "ended";
export type Tone = "danger" | "accent" | "neutral" | "muted";
export type Group = "week" | "month" | "later" | "unknown" | "closed" | "ended";

export interface Status {
  kind: StatusKind;
  /** Days until the deadline, when known. */
  days: number | null;
  tone: Tone;
  /** Number shown big, if any. */
  big: string | null;
  /** Remaining wording after the big number. */
  rest: string;
  /** Full plain text, e.g. "6 gün kaldı". */
  text: string;
}

export interface DatesInput {
  deadline: DateOnly | null;
  starts: DateOnly | null;
  ends: DateOnly | null;
}

export function isOver(d: DatesInput, today: DateOnly): boolean {
  const last = d.ends ?? d.starts;
  return last !== null && last < today;
}

export function countdownStatus(d: DatesInput, today: DateOnly): Status {
  if (isOver(d, today)) return mk("ended", null, "muted", null, "Bitti");
  if (!d.deadline) {
    // Dates known but no application date (MLH style): not "unknown", it is grouped by its start date.
    return d.starts || d.ends ? mk("nodeadline", null, "muted", null, "Başvuru tarihi yok") : mk("unknown", null, "muted", null, "Tarih açıklanmadı");
  }
  const days = diffDays(d.deadline, today);
  if (days < 0) return mk("closed", days, "muted", null, "Başvuru kapandı");
  if (days === 0) return mk("today", 0, "danger", null, "Bugün son gün");
  if (days <= 3) return mk("soon", days, "danger", String(days), "gün kaldı");
  if (days <= 7) return mk("week", days, "accent", String(days), "gün kaldı");
  return mk("later", days, "neutral", String(days), "gün kaldı");
}

function mk(kind: StatusKind, days: number | null, tone: Tone, big: string | null, rest: string): Status {
  return { kind, days, tone, big, rest, text: big ? `${big} ${rest}` : rest };
}

/** Deadline-horizon group for the list page. */
export function groupOf(d: DatesInput, today: DateOnly): Group {
  const s = countdownStatus(d, today);
  if (s.kind === "ended") return "ended";
  if (s.kind === "closed") return "closed";
  if (s.kind === "unknown") return "unknown";
  // Events without a deadline are grouped by how soon they start.
  const days = s.kind === "nodeadline" ? Math.max(0, diffDays((d.starts ?? d.ends)!, today)) : s.days!;
  return days <= 7 ? "week" : days <= 31 ? "month" : "later";
}

export const GROUP_LABELS: Record<Group, string> = {
  week: "Bu hafta kapanıyor",
  month: "Bu ay",
  later: "Daha sonra",
  unknown: "Tarih açıklanmadı",
  closed: "Başvurusu kapananlar",
  ended: "Bitenler",
};
export const GROUP_ORDER: Group[] = ["week", "month", "later", "unknown", "closed"];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inner HTML of a countdown element; shared by the server component and the browser refresh. */
export function countdownInner(s: Status): string {
  return s.big
    ? `<b class="cd-n">${esc(s.big)}</b> <span class="cd-t">${esc(s.rest)}</span>`
    : `<span class="cd-t">${esc(s.rest)}</span>`;
}
