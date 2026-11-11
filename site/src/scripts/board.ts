/* Departures board behaviour: split-flap landing on load, live countdown, re-render on filter change. */
import { BOARD_COL_ORDER, BOARD_COLS, boardRows, type BoardRow } from "../lib/board";
import type { EventMeta } from "../lib/types";
import { reducedMotion } from "./today";

const GLYPHS = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789";
const STEP_MS = 42;

interface Flip { cell: HTMLElement; target: string; steps: number; startAt: number; lastAt: number }

export function initBoard(base: string) {
  const root = document.querySelector<HTMLElement>("[data-board]");
  if (!root) return { render: (_m: EventMeta[]) => {}, intro: (_m: EventMeta[]) => {} };
  const list = root.querySelector<HTMLOListElement>("[data-board-rows]")!;
  const empty = root.querySelector<HTMLElement>("[data-board-empty]");
  const clock = root.querySelector<HTMLElement>("[data-clock]");
  const limit = Number(root.dataset.limit || 8);
  const still = reducedMotion();
  let current: EventMeta[] = [];
  const flips = new Map<HTMLElement, Flip>();
  let raf = 0;

  const tick = (t: number) => {
    let active = false;
    flips.forEach((f, cell) => {
      if (t < f.startAt) { active = true; return; }
      if (t - f.lastAt < STEP_MS) { active = true; return; }
      f.lastAt = t;
      if (f.steps <= 0) {
        cell.textContent = f.target;
        cell.classList.remove("is-flipping");
        flips.delete(cell);
        return;
      }
      f.steps -= 1;
      cell.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
      cell.classList.remove("is-flipping");
      void cell.offsetWidth; // restart the flap keyframe
      cell.classList.add("is-flipping");
      active = true;
    });
    raf = active ? requestAnimationFrame(tick) : 0;
  };

  const setCell = (cell: HTMLElement, target: string, delay: number, steps: number) => {
    if (cell.textContent === target && !flips.has(cell)) return;
    if (still || document.hidden) {
      flips.delete(cell);
      cell.textContent = target;
      return;
    }
    const now = performance.now();
    flips.set(cell, { cell, target, steps, startAt: now + delay, lastAt: 0 });
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const rowEl = (r: BoardRow): HTMLLIElement => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "brow";
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.dataset.sr = "";
    a.appendChild(sr);
    for (const c of BOARD_COL_ORDER) {
      const col = document.createElement("span");
      col.className = "bcol";
      col.dataset.col = c;
      col.setAttribute("aria-hidden", "true");
      for (let i = 0; i < BOARD_COLS[c]; i++) {
        const cell = document.createElement("span");
        cell.className = "cell";
        cell.textContent = " ";
        col.appendChild(cell);
      }
      a.appendChild(col);
    }
    li.appendChild(a);
    return li;
  };

  /** Brings the DOM to `rows`; every changed character flips. `intro` staggers a full landing. */
  const apply = (rows: BoardRow[], intro: boolean) => {
    while (list.children.length < rows.length) list.appendChild(rowEl(rows[list.children.length]!));
    while (list.children.length > rows.length) list.lastElementChild!.remove();
    rows.forEach((r, ri) => {
      const a = list.children[ri]!.querySelector<HTMLAnchorElement>("a.brow")!;
      a.href = `${base}e/${r.id}/`;
      a.dataset.id = r.id;
      a.querySelector<HTMLElement>("[data-sr]")!.textContent = r.label;
      let ci = 0;
      for (const c of BOARD_COL_ORDER) {
        const col = a.querySelector<HTMLElement>(`.bcol[data-col="${c}"]`)!;
        col.dataset.tone = r.tone[c];
        col.dataset.blink = r.cells.durum.startsWith("SON ÇAĞRI") && c === "durum" ? "1" : "";
        const cells = col.querySelectorAll<HTMLElement>(".cell");
        [...r.cells[c]].forEach((ch, i) => {
          const cell = cells[i]!;
          const delay = intro ? ri * 90 + ci * 14 : ci * 6;
          const steps = ch === " " ? (intro ? 2 : 1) : intro ? 3 + Math.floor(Math.random() * 6) : 2 + Math.floor(Math.random() * 3);
          setCell(cell, ch, delay, steps);
          ci++;
        });
      }
    });
    if (empty) empty.hidden = rows.length > 0;
  };

  const render = (metas: EventMeta[]) => {
    current = metas;
    apply(boardRows(metas, Date.now(), limit), false);
  };

  // First landing: blank the server-rendered characters, then flip them in.
  const intro = (metas: EventMeta[]) => {
    current = metas;
    const rows = boardRows(metas, Date.now(), limit);
    if (!still) list.querySelectorAll<HTMLElement>(".cell").forEach((c) => (c.textContent = " "));
    apply(rows, true);
  };

  const fmtClock = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const everySecond = () => {
    if (document.hidden || !root.isConnected) return stop();
    if (clock) clock.textContent = fmtClock.format(Date.now());
    // Only the countdown and status columns change with time; reuse the same rows.
    const rows = boardRows(current, Date.now(), limit);
    const sameOrder = rows.length === list.children.length && rows.every((r, i) => (list.children[i]!.querySelector("a") as HTMLAnchorElement).dataset.id === r.id);
    if (!sameOrder) return apply(rows, false);
    rows.forEach((r, ri) => {
      const a = list.children[ri]!.querySelector("a")!;
      for (const c of ["kalan", "durum"] as const) {
        const col = a.querySelector<HTMLElement>(`.bcol[data-col="${c}"]`)!;
        col.dataset.tone = r.tone[c];
        const cells = col.querySelectorAll<HTMLElement>(".cell");
        [...r.cells[c]].forEach((ch, i) => setCell(cells[i]!, ch, i * 10, 1));
      }
    });
  };
  // Tick only while the page is visible; catch up at once when it comes back; stop when it goes away.
  let timer = 0;
  const start = () => {
    if (!timer) timer = window.setInterval(everySecond, 1000);
  };
  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else {
      everySecond();
      start();
    }
  });
  addEventListener("pagehide", stop);
  addEventListener("pageshow", () => {
    if (!document.hidden) {
      everySecond();
      start();
    }
  });
  if (!document.hidden) start();

  return { render, intro };
}
