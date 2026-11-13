/**
 * The sea chart: every upcoming hackathon is an island. Pure layout, no DOM, so the build and the tests share it.
 *
 * Projection: east is later. Each day gets a column whose width grows with the number of islands on it
 * (a Mercator-like stretch, but for crowding instead of latitude). The neatline shows the stretch honestly:
 * one alternating cell per day. North-south has no meaning; islands are packed so names never collide.
 * Island size follows the prize; the shape is seeded by the id, so the same island appears on the map, in the
 * list and on the detail plate.
 */
import type { EventMeta } from "./types";
import { addDays, diffDays, MONTHS, MONTHS_SHORT, parts, weekdayIndex } from "./dates";

export const CHART_H = 640;
/** Room on the west edge for the mainland, the compass rose and the title block. */
export const HARBOR_W = 560;
const BAND = 36;
const TOP = BAND + 18;
const BOTTOM = CHART_H - BAND - 14;
const PAST_DAYS = 10;
const FAR_DAYS = 120;
const LABEL_SIZE = 12;
const LABEL_CHARS = 21;

export type IslandState = "open" | "urgent" | "closed" | "undated";

export interface Island {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  land: string;
  shoal: string;
  contour: string;
  label: string[];
  /** Label box top (centered on x). */
  ly: number;
  state: IslandState;
  /** Deadline within 7 days: the light on the island flashes. */
  flare: boolean;
  /** Anchor date (deadline, else start date); null for undated. */
  anchor: string | null;
}

export interface DayCell {
  x: number;
  w: number;
  date: string;
}

export interface ChartLayout {
  width: number;
  height: number;
  todayX: number;
  islands: Island[];
  days: DayCell[];
  weeks: { x: number; label: string }[];
  /** Wide (crowded) days get their own label on the neatline. */
  dayLabels: { x: number; label: string }[];
  months: { x: number; label: string }[];
  farX: number | null;
  fogX: number | null;
}

/* ---------- seeded noise ---------- */

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
let fmt = f1;

interface Harmonics {
  a: number[];
  p: number[];
  k: number[];
}

function harmonics(id: string): Harmonics {
  const r = rng(hash(id));
  const k = [2, 3, 5, 7];
  return { k, a: k.map((_, i) => (0.06 + r() * 0.12) / (1 + i * 0.55)), p: k.map(() => r() * Math.PI * 2) };
}

/** Closed smooth outline (Catmull-Rom through radial samples) around cx, cy. */
function outline(h: Harmonics, cx: number, cy: number, r: number, rough: number, phase = 0, n = 20): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let m = 1;
    for (let j = 0; j < h.k.length; j++) m += rough * h.a[j]! * Math.sin(h.k[j]! * t + h.p[j]! + phase * (j + 1));
    pts.push([cx + Math.cos(t) * r * m, cy + Math.sin(t) * r * m * 0.82]);
  }
  let d = `M${fmt(pts[0]![0])} ${fmt(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fmt(c1[0]!)} ${fmt(c1[1]!)} ${fmt(c2[0]!)} ${fmt(c2[1]!)} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d + "Z";
}

export interface IslandShape {
  land: string;
  shoal: string;
  contour: string;
}

/** The island of one event, centered at cx, cy with radius r. Same id, same coastline at any size. */
export function islandShape(id: string, cx: number, cy: number, r: number, coarse = false): IslandShape {
  const h = harmonics(id);
  fmt = coarse ? (n: number) => Math.round(n).toString() : f1;
  const out = {
    land: outline(h, cx, cy, r, 1.6),
    shoal: outline(h, cx, cy, r + 7, 1.1, 0.15),
    contour: outline(h, cx, cy, r + 15, 0.8, 0.3),
  };
  fmt = f1;
  return out;
}

/** Island radius from the prize in USD: no prize is a small rock, a million dollars is a large island. */
export function islandRadius(prizeUsd: number | null): number {
  if (!prizeUsd || prizeUsd <= 0) return 14;
  const t = Math.min(1, Math.max(0, (Math.log10(prizeUsd) - 2) / 4));
  return Math.round((17 + 29 * t) * 10) / 10;
}

/** Up to two lines of at most `max` characters; an ellipsis marks anything cut. */
export function labelLines(name: string, max = LABEL_CHARS): string[] {
  const words = name.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i]!;
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) {
      cur = next;
      continue;
    }
    if (!cur) {
      cur = w;
      continue;
    }
    lines.push(cur);
    cur = w;
    if (lines.length === 2) break;
  }
  const cut = lines.length === 2 || cur.length > max;
  if (lines.length < 2 && cur) lines.push(cur);
  const last = lines.length - 1;
  if (cut) {
    const l = lines[last]!;
    lines[last] = (l.length >= max ? l.slice(0, max - 1) : l).trimEnd() + "…";
  }
  return lines.map((l) => (l.length > max ? l.slice(0, max - 1).trimEnd() + "…" : l));
}

const labelWidth = (lines: string[]) => Math.max(...lines.map((l) => l.length)) * LABEL_SIZE * 0.52 + 6;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function boxFor(x: number, y: number, r: number, lw: number, lines: number): Box {
  const half = Math.max(r + 12, lw / 2);
  return { x0: x - half, x1: x + half, y0: y - r * 0.82 - 12, y1: y + r * 0.82 + 10 + lines * (LABEL_SIZE + 3) + 4 };
}

function anchorOf(m: EventMeta): string | null {
  return m.deadline ?? m.starts ?? m.ends ?? null;
}

function stateOf(m: EventMeta, today: string): { state: IslandState; flare: boolean } {
  const a = anchorOf(m);
  if (!a) return { state: "undated", flare: false };
  if (m.deadline && m.deadline < today) return { state: "closed", flare: false };
  const days = m.deadline ? diffDays(m.deadline, today) : null;
  if (days !== null && days <= 7) return { state: "urgent", flare: true };
  return { state: "open", flare: false };
}

/** Lays out every not-yet-ended event. `metas` should exclude ended events. */
export function layoutChart(metas: EventMeta[], today: string): ChartLayout {
  const start = addDays(today, -PAST_DAYS);
  const dated = metas.filter((m) => anchorOf(m));
  const undated = metas.filter((m) => !anchorOf(m));
  const clampDay = (d: string) => (d < start ? start : d);
  const lastAnchor = dated.map((m) => clampDay(anchorOf(m)!)).sort().at(-1) ?? today;
  const end = addDays(lastAnchor > addDays(today, 28) ? lastAnchor : addDays(today, 28), 6);

  const count = new Map<string, number>();
  for (const m of dated) {
    const d = clampDay(anchorOf(m)!);
    count.set(d, (count.get(d) ?? 0) + 1);
  }

  const days: DayCell[] = [];
  const dayIndex = new Map<string, DayCell>();
  let x = HARBOR_W;
  let farX: number | null = null;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const off = diffDays(d, today);
    const base = off < 0 ? 7 : off > FAR_DAYS ? 3 : 13;
    if (off > FAR_DAYS && farX === null) farX = x;
    const w = base + 58 * (count.get(d) ?? 0);
    const cell = { x, w, date: d };
    days.push(cell);
    dayIndex.set(d, cell);
    x += w;
  }
  const todayX = dayIndex.get(today)!.x;
  let fogX: number | null = null;
  const fogW = undated.length ? Math.max(260, undated.length * 70) : 0;
  if (undated.length) fogX = x + 40;
  const width = Math.ceil(x + (undated.length ? 40 + fogW : 0) + 140);

  // Graticule: a meridian every Monday, month names on the first day of a month.
  const weeks: ChartLayout["weeks"] = [];
  const dayLabels: ChartLayout["dayLabels"] = [];
  const months: ChartLayout["months"] = [];
  const ty = parts(today).y;
  for (const c of days) {
    const p = parts(c.date);
    if (weekdayIndex(c.date) === 0 && (farX === null || c.x < farX)) weeks.push({ x: c.x, label: `${p.d} ${MONTHS_SHORT[p.m - 1]}` });
    const lastLabel = Math.max(weeks.at(-1)?.x ?? -1e9, dayLabels.at(-1)?.x ?? -1e9);
    if (c.w >= 150 && weekdayIndex(c.date) !== 0 && c.x - lastLabel > 70) dayLabels.push({ x: c.x, label: `${p.d} ${MONTHS_SHORT[p.m - 1]}` });
    if (p.d === 1) months.push({ x: c.x, label: p.y === ty ? MONTHS[p.m - 1]! : `${MONTHS[p.m - 1]} ${p.y}` });
  }

  // Placement: biggest islands first within a day, then greedy search for a free spot in the day's column.
  const placed: Box[] = [];
  const islands: Island[] = [];
  const order = [...dated].sort((a, b) => {
    const da = clampDay(anchorOf(a)!);
    const db = clampDay(anchorOf(b)!);
    return da < db ? -1 : da > db ? 1 : islandRadius(b.prizeUsd) - islandRadius(a.prizeUsd) || a.id.localeCompare(b.id);
  });

  const place = (m: EventMeta, x0: number, x1: number) => {
    const r = islandRadius(m.prizeUsd);
    const label = labelLines(m.name);
    const lw = labelWidth(label);
    const rand = rng(hash(m.id + ":pos"));
    const half = Math.max(r + 12, lw / 2);
    const lo = Math.min(x0 + half * 0.35, (x0 + x1) / 2);
    const hi = Math.max(x1 - half * 0.35, lo);
    const yMin = TOP + r * 0.82 + 12;
    const yMax = BOTTOM - r * 0.82 - 14 - label.length * (LABEL_SIZE + 3);
    const xs = [0.5, 0.25, 0.75, 0.1, 0.9, 0.38, 0.62].map((f) => lo + (hi - lo) * f);
    const y0 = yMin + rand() * (yMax - yMin);
    const ys: number[] = [];
    for (let k = 0; k <= Math.ceil((yMax - yMin) / 9); k++) {
      for (const s of k === 0 ? [0] : [k, -k]) {
        const y = y0 + s * 9;
        if (y >= yMin && y <= yMax) ys.push(y);
      }
    }
    let best: { x: number; y: number; cost: number } | null = null;
    outer: for (const px of xs) {
      for (const py of ys) {
        const b = boxFor(px, py, r, lw, label.length);
        let cost = 0;
        for (const q of placed) {
          cost += overlap(b, q);
          if (best && cost >= best.cost) break;
        }
        if (!best || cost < best.cost) best = { x: px, y: py, cost };
        if (cost === 0) break outer;
      }
    }
    const { x: cx, y: cy } = best!;
    placed.push(boxFor(cx, cy, r, lw, label.length));
    return { cx, cy, r, label };
  };

  for (const m of order) {
    const cell = dayIndex.get(clampDay(anchorOf(m)!))!;
    const { cx, cy, r, label } = place(m, cell.x + 4, cell.x + cell.w - 4);
    const s = stateOf(m, today);
    islands.push({ id: m.id, name: m.name, x: cx, y: cy, r, ...islandShape(m.id, cx, cy, r), label, ly: cy + r * 0.82 + 12, ...s, anchor: anchorOf(m) });
  }
  if (fogX !== null) {
    const sorted = [...undated].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    for (const m of sorted) {
      const { cx, cy, r, label } = place(m, fogX + 20, fogX + fogW - 20);
      islands.push({ id: m.id, name: m.name, x: cx, y: cy, r, ...islandShape(m.id, cx, cy, r), label, ly: cy + r * 0.82 + 12, state: "undated", flare: false, anchor: null });
    }
  }

  return { width, height: CHART_H, todayX, islands, days, weeks, dayLabels, months, farX, fogX };
}

/** Rhumb lines radiating from a compass rose, clipped by the caller. */
export function rhumbs(cx: number, cy: number, len: number, n = 32): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    d += `M${f1(cx)} ${f1(cy)}L${f1(cx + Math.cos(t) * len)} ${f1(cy + Math.sin(t) * len)}`;
  }
  return d;
}

/** The west mainland: a long coast running north-south along the harbor edge. */
export function mainland(seed = "hackatlas"): { land: string; shoal: string } {
  const r = rng(hash(seed));
  const ph = [r() * 6, r() * 6, r() * 6];
  const edge = (off: number, rough: number) => {
    const pts: [number, number][] = [];
    for (let y = -20; y <= CHART_H + 20; y += 16) {
      const t = y / CHART_H;
      const x = 118 + off + rough * (22 * Math.sin(t * 7 + ph[0]!) + 12 * Math.sin(t * 17 + ph[1]!) + 6 * Math.sin(t * 31 + ph[2]!));
      pts.push([x, y]);
    }
    let d = `M-10 -20L${f1(pts[0]![0])} ${f1(pts[0]![1])}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[i - 1]!;
      d += `Q${f1(q[0])} ${f1(q[1])} ${f1((p[0] + q[0]) / 2)} ${f1((p[1] + q[1]) / 2)}`;
    }
    return d + `L${f1(pts.at(-1)![0])} ${CHART_H + 20}L-10 ${CHART_H + 20}Z`;
  };
  return { land: edge(0, 1), shoal: edge(14, 0.8) };
}
