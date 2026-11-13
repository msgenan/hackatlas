/**
 * The sea chart in the browser: native horizontal scroll underneath, plus
 * - mouse drag with inertia, and glides with a critically damped follower (adapted from the time-scrubber sample);
 * - the scrubber under the chart: the visible window over the whole season, draggable, keyboard operable;
 * - a survey reveal: each coastline draws itself the first time it comes into view;
 * - tips on hover, the saved route as a magenta course line, filter ghosts.
 */
import { formatShort } from "../lib/dates";
import { readSaved, SAVED_EVENT } from "./saved";
import { readData, reducedMotion } from "./today";

interface Geo {
  w: number;
  h: number;
  today: number;
  harbor: number;
  islands: Record<string, [number, number, number, number]>;
  months: [number, string][];
  weeks: number[];
  days: [number, string][];
}
type Tip = [string, string, string, string, string, string, string];

export interface ChartApi {
  setVisible(ids: Set<string>): void;
  locate(id: string): void;
  hot(id: string | null): void;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Critically damped step: stable for any dt, never overshoots. */
function damp(cur: number, target: number, vel: number, smoothTime: number, dt: number): [number, number] {
  const w = 2 / smoothTime;
  const k = w * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const change = cur - target;
  const temp = (vel + w * change) * dt;
  let v = (vel - w * temp) * e;
  let out = target + (change + temp) * e;
  if (target - cur > 0 === out > target) {
    out = target;
    v = 0;
  }
  return [out, v];
}

export function initChart(): ChartApi | null {
  const wrap = document.querySelector<HTMLElement>("[data-chart]");
  const sea = wrap?.querySelector<HTMLElement>("[data-sea]");
  const svg = sea?.querySelector<SVGSVGElement>("svg.chart");
  const geo = readData<Geo>("chart-geo");
  const tips = readData<Record<string, Tip>>("chart-tips") ?? {};
  if (!wrap || !sea || !svg || !geo) return null;

  const reduce = reducedMotion();
  const cartouche = wrap.querySelector<HTMLElement>("[data-cartouche]");
  const win = wrap.querySelector<HTMLElement>("[data-scrub-win]")!;
  const track = wrap.querySelector<HTMLElement>("[data-scrub-track]")!;
  const rangeEl = wrap.querySelector<HTMLElement>("[data-scrub-range]")!;
  const live = wrap.querySelector<HTMLElement>("[data-scrub-live]");
  const tip = wrap.querySelector<HTMLElement>("[data-tip]")!;
  const routeEl = svg.querySelector<SVGPathElement>("[data-route]")!;
  const isles = new Map<string, SVGAElement>();
  svg.querySelectorAll<SVGAElement>(".isle").forEach((a) => isles.set(a.dataset.id!, a));
  const marks = new Map<string, HTMLElement>();
  wrap.querySelectorAll<HTMLElement>("[data-mk]").forEach((m) => marks.set(m.dataset.mk!, m));

  let k = 1; // screen px per chart unit
  const measure = () => {
    k = svg.getBoundingClientRect().height / geo.h || 1;
    wrap.style.setProperty("--k", k.toFixed(4));
  };

  /* ---- glide: one target, one damped follower; any user input cancels it ---- */
  let goal: number | null = null;
  let pos = 0; // the follower's own position: scrollLeft snaps to device pixels and would stall it
  let vel = 0;
  let prev = 0;
  let raf = 0;
  const maxScroll = () => sea.scrollWidth - sea.clientWidth;
  const glideTo = (px: number) => {
    goal = clamp(px, 0, maxScroll());
    if (reduce) {
      sea.scrollLeft = goal;
      goal = null;
      return;
    }
    if (!raf) {
      pos = sea.scrollLeft;
      prev = performance.now();
      raf = requestAnimationFrame(step);
    }
  };
  const step = (now: number) => {
    raf = 0;
    if (goal === null) return;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const [x, v] = damp(pos, goal, vel, 0.32, dt);
    vel = v;
    pos = x;
    sea.scrollLeft = x;
    if (Math.abs(x - goal) < 0.5) {
      sea.scrollLeft = goal;
      goal = null;
      vel = 0;
      announce();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  const cancelGlide = () => {
    goal = null;
    vel = 0;
    stopInertia();
  };
  const centerOn = (unitX: number) => glideTo(unitX * k - sea.clientWidth / 2);

  /* ---- mouse drag with inertia (touch and trackpads use native scrolling) ---- */
  let drag: { id: number; x: number; sl: number; moved: boolean; samples: { x: number; t: number }[] } | null = null;
  let inertia = 0;
  const stopInertia = () => {
    cancelAnimationFrame(inertia);
    inertia = 0;
  };
  sea.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    cancelGlide();
    drag = { id: e.pointerId, x: e.clientX, sl: sea.scrollLeft, moved: false, samples: [{ x: e.clientX, t: performance.now() }] };
  });
  sea.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      sea.classList.add("is-drag");
      try {
        sea.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      hideTip();
    }
    if (!drag.moved) return;
    sea.scrollLeft = drag.sl - dx;
    const now = performance.now();
    drag.samples.push({ x: e.clientX, t: now });
    while (drag.samples.length > 2 && now - drag.samples[0]!.t > 90) drag.samples.shift();
  });
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    sea.classList.remove("is-drag");
    if (!d.moved) return;
    // Swallow the click that ends a drag, so dropping on an island does not open it.
    sea.addEventListener("click", (c) => c.preventDefault(), { capture: true, once: true });
    const a = d.samples[0]!;
    const b = d.samples.at(-1)!;
    const dts = (b.t - a.t) / 1000;
    let v = dts > 0.01 && performance.now() - b.t < 80 ? clamp(-(b.x - a.x) / dts, -3200, 3200) : 0; // px per second
    if (reduce || Math.abs(v) < 60) return announce();
    let last = performance.now();
    const fly = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      v *= Math.exp(-dt / 0.33);
      const before = sea.scrollLeft;
      sea.scrollLeft = before + v * dt;
      if (Math.abs(v) < 12 || sea.scrollLeft === before) {
        inertia = 0;
        announce();
        return;
      }
      inertia = requestAnimationFrame(fly);
    };
    inertia = requestAnimationFrame(fly);
  };
  sea.addEventListener("pointerup", release);
  sea.addEventListener("pointercancel", release);
  sea.addEventListener("dragstart", (e) => e.preventDefault());
  sea.addEventListener("wheel", cancelGlide, { passive: true });
  sea.addEventListener("touchstart", cancelGlide, { passive: true });

  /* ---- scrubber ---- */
  const dateAt = (unitX: number) => {
    let lo = 0;
    let hi = geo.days.length - 1;
    if (unitX <= geo.days[0]![0]) return geo.days[0]![1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (geo.days[mid]![0] <= unitX) lo = mid;
      else hi = mid - 1;
    }
    return geo.days[lo]![1];
  };
  const rangeText = () => {
    const l = Math.max(sea.scrollLeft / k, geo.today);
    const r = (sea.scrollLeft + sea.clientWidth) / k;
    const ty = geo.days.find((d) => d[0] >= geo.today)?.[1].slice(0, 4);
    const f = (iso: string) => (iso.slice(0, 4) === ty ? formatShort(iso) : `${formatShort(iso)} ${iso.slice(0, 4)}`);
    return `${f(dateAt(l))} - ${f(dateAt(r))}`;
  };
  function announce() {
    const t = rangeText();
    win.setAttribute("aria-valuetext", t);
    if (live) live.textContent = `Haritada ${t} arası görünüyor`;
  }
  const paintScrub = () => {
    const sw = sea.scrollWidth || 1;
    const left = sea.scrollLeft / sw;
    const width = sea.clientWidth / sw;
    win.style.left = `${(left * 100).toFixed(3)}%`;
    win.style.width = `${(width * 100).toFixed(3)}%`;
    win.setAttribute("aria-valuenow", String(Math.round((sea.scrollLeft / Math.max(1, maxScroll())) * 100)));
    rangeEl.textContent = rangeText();
    // Keep the date label above the window but inside the track.
    const tw = track.clientWidth;
    const lw = rangeEl.offsetWidth;
    const mid = (left + width / 2) * tw;
    rangeEl.style.transform = `translateX(${Math.round(clamp(mid - lw / 2, 0, tw - lw))}px)`;
  };
  let wdrag: { id: number; grab: number } | null = null;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    cancelGlide();
    const r = track.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    if (e.target instanceof Element && win.contains(e.target)) {
      wdrag = { id: e.pointerId, grab: e.clientX - wr.left };
      track.setPointerCapture(e.pointerId);
      win.focus({ preventScroll: true });
      track.classList.add("is-drag");
    } else {
      const f = (e.clientX - r.left) / r.width;
      glideTo(f * sea.scrollWidth - sea.clientWidth / 2);
    }
  });
  track.addEventListener("pointermove", (e) => {
    if (!wdrag || e.pointerId !== wdrag.id) return;
    const r = track.getBoundingClientRect();
    sea.scrollLeft = ((e.clientX - wdrag.grab - r.left) / r.width) * sea.scrollWidth;
  });
  const wrelease = (e: PointerEvent) => {
    if (!wdrag || e.pointerId !== wdrag.id) return;
    wdrag = null;
    track.classList.remove("is-drag");
    announce();
  };
  track.addEventListener("pointerup", wrelease);
  track.addEventListener("pointercancel", wrelease);

  const weekStep = (dir: number) => {
    const cur = (goal ?? sea.scrollLeft) / k + 1;
    const ws = [geo.days[0]![0], ...geo.weeks];
    const next = dir > 0 ? ws.find((x) => x > cur + 2) : [...ws].reverse().find((x) => x < cur - 2);
    glideTo((next ?? (dir > 0 ? geo.w : 0)) * k - 1);
  };
  const toToday = () => glideTo((geo.today - 120) * k);
  win.addEventListener("keydown", (e) => {
    const map: Record<string, () => void> = {
      ArrowRight: () => weekStep(1),
      ArrowLeft: () => weekStep(-1),
      PageDown: () => glideTo((goal ?? sea.scrollLeft) + sea.clientWidth),
      PageUp: () => glideTo((goal ?? sea.scrollLeft) - sea.clientWidth),
      Home: toToday,
      End: () => glideTo(maxScroll()),
    };
    const f = map[e.key];
    if (!f) return;
    e.preventDefault();
    stopInertia();
    f();
  });
  wrap.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) => b.addEventListener("click", () => weekStep(Number(b.dataset.step))));
  wrap.querySelector("[data-today-btn]")?.addEventListener("click", toToday);

  /* ---- survey reveal: coastlines draw themselves the first time they come into view ---- */
  const unseen = new Set(isles.keys());
  const survey = () => {
    if (!unseen.size) return;
    const l = sea.scrollLeft / k - 40;
    const r = (sea.scrollLeft + sea.clientWidth) / k + 40;
    const batch: [string, number][] = [];
    for (const id of unseen) {
      const x = geo.islands[id]![0];
      if (x >= l && x <= r) batch.push([id, x]);
    }
    batch.sort((a, b) => a[1] - b[1]);
    batch.forEach(([id, x], n) => {
      unseen.delete(id);
      const el = isles.get(id)!;
      el.style.setProperty("--delay", `${Math.min(n * 28, 900) + Math.round(((x - l) / (r - l)) * 120)}ms`);
      el.classList.add("surveyed");
    });
  };

  /* ---- cartouche: on wide screens it is printed on the chart, so it sails west with it ---- */
  const cartoucheOnChart = () => cartouche && getComputedStyle(cartouche).position === "absolute";
  let painted = false;
  const onScroll = () => {
    if (painted) return;
    painted = true;
    requestAnimationFrame(() => {
      painted = false;
      paintScrub();
      survey();
      if (cartoucheOnChart()) cartouche!.style.transform = `translate3d(${-sea.scrollLeft}px,0,0)`;
    });
  };
  sea.addEventListener("scroll", onScroll, { passive: true });

  /* ---- tips ---- */
  let tipFor: string | null = null;
  const tipCd = tip.querySelector<HTMLElement>("[data-tip-cd]")!;
  const setT = (sel: string, v: string) => (tip.querySelector<HTMLElement>(sel)!.textContent = v || "Belirtilmemiş");
  const showTip = (id: string) => {
    const t = tips[id];
    const g = geo.islands[id];
    if (!t || !g) return;
    tipFor = id;
    tipCd.textContent = t[1];
    tipCd.dataset.tone = t[5];
    setT("[data-tip-name]", t[0]);
    setT("[data-tip-org]", t[6]);
    setT("[data-tip-date]", t[2]);
    setT("[data-tip-place]", t[3]);
    setT("[data-tip-prize]", t[4]);
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect();
    const sr = sea.getBoundingClientRect();
    const cx = sr.left - wr.left + g[0] * k - sea.scrollLeft;
    const cy = sr.top - wr.top + g[1] * k;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const right = cx + g[2] * k + 18;
    const x = right + tw < wr.width - 8 ? right : cx - g[2] * k - 18 - tw;
    tip.style.transform = `translate3d(${clamp(x, 8, wr.width - tw - 8)}px, ${clamp(cy - th / 2, sr.top - wr.top + 8, sr.bottom - wr.top - th - 8)}px, 0)`;
    requestAnimationFrame(() => tip.classList.add("on"));
  };
  function hideTip() {
    tipFor = null;
    tip.classList.remove("on");
    tip.hidden = true;
  }
  svg.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || drag?.moved) return;
    const a = (e.target as Element).closest<SVGAElement>(".isle");
    if (a && a.dataset.id !== tipFor) showTip(a.dataset.id!);
  });
  svg.addEventListener("pointerout", (e) => {
    const to = (e.relatedTarget as Element | null)?.closest?.(".isle");
    if (!to) hideTip();
  });
  sea.addEventListener("scroll", () => tipFor && hideTip(), { passive: true });

  /* ---- route through saved islands, in deadline order ---- */
  const paintRoute = () => {
    const saved = readSaved();
    const savedSet = new Set(saved);
    const pts = saved
      .map((id) => geo.islands[id])
      .filter((g): g is [number, number, number, number] => !!g && g[3] !== 2)
      .sort((a, b) => a[0] - b[0]);
    isles.forEach((el, id) => el.classList.toggle("saved", savedSet.has(id)));
    if (!pts.length) {
      routeEl.setAttribute("d", "");
      return;
    }
    let d = `M${geo.today} ${geo.h / 2}`;
    for (const p of pts) d += `L${p[0]} ${p[1]}`;
    routeEl.setAttribute("d", d);
    if (!reduce) {
      const len = routeEl.getTotalLength();
      routeEl.animate([{ strokeDashoffset: len, strokeDasharray: `${len} ${len}` }, { strokeDashoffset: 0, strokeDasharray: `${len} ${len}` }], { duration: Math.min(1600, 300 + len / 4), easing: "cubic-bezier(.23,1,.32,1)" });
    }
  };
  document.addEventListener(SAVED_EVENT, paintRoute);

  /* ---- start ---- */
  const start = () => {
    measure();
    // Phones see the title above the chart, so the chart opens at today instead of on the harbor.
    if (!cartoucheOnChart()) sea.scrollLeft = Math.max(0, (geo.today - 90) * k);
    else if (cartouche) cartouche.style.transform = `translate3d(${-sea.scrollLeft}px,0,0)`;
    paintScrub();
    announce();
    if (reduce) isles.forEach((el) => el.classList.add("surveyed"));
    wrap.classList.add("ready");
    survey();
    paintRoute();
  };
  new ResizeObserver(() => {
    const before = sea.scrollLeft / k;
    measure();
    sea.scrollLeft = before * k;
    onScroll();
  }).observe(sea);
  start();

  return {
    setVisible(ids) {
      isles.forEach((el, id) => el.toggleAttribute("data-off", !ids.has(id)));
      marks.forEach((el, id) => el.toggleAttribute("data-off", !ids.has(id)));
    },
    locate(id) {
      const g = geo.islands[id];
      const el = isles.get(id);
      if (!g || !el) return;
      wrap.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      centerOn(g[0]);
      el.classList.remove("ping");
      void el.getBoundingClientRect();
      el.classList.add("ping");
      setTimeout(() => el.classList.remove("ping"), 2600);
    },
    hot(id) {
      isles.forEach((el, i) => el.classList.toggle("hot", i === id));
    },
  };
}
