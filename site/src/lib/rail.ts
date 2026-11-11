import type { DateOnly } from "./types";
import { addDays, diffDays, formatDay, formatShort, weekdayIndex } from "./dates";

export const RAIL_DAYS = 56;
const MAX_STACK = 4;

export interface RailItem {
  id: string;
  name: string;
  deadline: DateOnly | null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Week labels: every Monday from the first one after today, as "17 Kas". */
export function railWeeks(today: DateOnly): { col: number; label: string }[] {
  const out: { col: number; label: string }[] = [];
  const first = (7 - weekdayIndex(today)) % 7 || 7;
  for (let c = first; c < RAIL_DAYS; c += 7) out.push({ col: c, label: formatShort(addDays(today, c)) });
  return out;
}

/**
 * Markup of the deadline rail's track. Used by the server for first paint and by the browser to re-render
 * when filters change, so both always agree. `enter` adds the one-time rise-in stagger.
 */
export function railHtml(items: RailItem[], today: DateOnly, enter: boolean): string {
  const byCol = new Map<number, RailItem[]>();
  for (const it of items) {
    if (!it.deadline) continue;
    const col = diffDays(it.deadline, today);
    if (col < 0 || col >= RAIL_DAYS) continue;
    byCol.set(col, [...(byCol.get(col) ?? []), it]);
  }
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  let order = 0;
  const days = cols
    .map((col) => {
      const list = byCol.get(col)!.sort((a, b) => a.name.localeCompare(b.name, "tr"));
      const tone = col <= 7 ? "accent" : "muted";
      const date = formatDay(addDays(today, col), today);
      const shown = list.slice(0, list.length > MAX_STACK ? MAX_STACK : list.length);
      const rest = list.slice(shown.length);
      const delay = enter ? ` style="--i:${Math.min(order++, 6)}"` : "";
      const ticks = shown
        .map(
          (it) =>
            `<button type="button" class="tick" data-tone="${tone}" data-ids="${esc(it.id)}" data-tip="${esc(it.name)}, ${esc(date)}" aria-label="${esc(it.name)}, son başvuru ${esc(date)}" tabindex="-1"${delay}><i></i></button>`,
        )
        .join("");
      const more = rest.length
        ? `<button type="button" class="tick tick-more" data-tone="${tone}" data-ids="${esc(rest.map((r) => r.id).join(" "))}" data-tip="${esc(rest.map((r) => r.name).join("\n"))}\n${esc(date)}" aria-label="${rest.length} hackathon daha, son başvuru ${esc(date)}" tabindex="-1"${delay}>+${rest.length}</button>`
        : "";
      return `<div class="rail-day" style="--col:${col}">${ticks}${more}</div>`;
    })
    .join("");
  const weeks = railWeeks(today)
    .map((w) => `<span class="rail-week" style="--col:${w.col}"><span>${esc(w.label)}</span></span>`)
    .join("");
  const empty = cols.length ? "" : `<p class="rail-empty">Önümüzdeki 8 haftada kapanan başvuru yok.</p>`;
  return `<span class="rail-today"><span>Bugün</span></span>${weeks}${days}${empty}`;
}

/** Identifies what a rail shows, so the browser can skip re-rendering (and keep the rise-in) when nothing changed. */
export function railSignature(items: RailItem[], today: DateOnly): string {
  return `${today}|${items.filter((i) => i.deadline && diffDays(i.deadline, today) >= 0 && diffDays(i.deadline, today) < RAIL_DAYS).map((i) => i.id).sort().join(",")}`;
}
