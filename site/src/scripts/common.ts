import { countdownStatus, countdownInner } from "../lib/countdown";
import { initSave, readSaved, SAVED_EVENT } from "./saved";
import { clientToday } from "./today";

function initTheme(): void {
  const root = document.documentElement;
  const mark = () => {
    const cur = root.getAttribute("data-theme") ?? "system";
    document.querySelectorAll<HTMLElement>("[data-theme-set]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeSet === cur)));
  };
  mark();
  document.addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLElement>("[data-theme-set]");
    if (!b) return;
    const v = b.dataset.themeSet!;
    if (v === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", v);
    try {
      if (v === "system") localStorage.removeItem("hackatlas:theme");
      else localStorage.setItem("hackatlas:theme", v);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    mark();
  });
}

/** A stale build still shows correct day counts: recompute every countdown from the real date. */
export function refreshCountdowns(root: ParentNode = document): void {
  const today = clientToday();
  root.querySelectorAll<HTMLElement>("[data-cd]").forEach((el) => {
    const s = countdownStatus({ deadline: el.dataset.deadline || null, starts: el.dataset.starts || null, ends: el.dataset.ends || null }, today);
    el.dataset.tone = s.tone;
    const inner = el.querySelector<HTMLElement>(".cd-in") ?? el;
    inner.innerHTML = countdownInner(s);
  });
}

function initSavedCount(): void {
  const paint = () => {
    const n = readSaved().length;
    document.querySelectorAll<HTMLElement>("[data-saved-count]").forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  };
  paint();
  document.addEventListener(SAVED_EVENT, paint);
}

function initCopy(): void {
  document.addEventListener("click", async (ev) => {
    const b = (ev.target as Element).closest<HTMLElement>("[data-copy]");
    if (!b) return;
    const label = b.querySelector<HTMLElement>(".copy-label");
    const url = location.origin + location.pathname;
    const done = () => {
      if (!label) return;
      const old = label.textContent;
      label.textContent = "Kopyalandı";
      setTimeout(() => (label.textContent = old), 1800);
    };
    try {
      await navigator.clipboard.writeText(url);
      done();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        /* nothing else to try */
      }
      ta.remove();
    }
  });
}

/** Remembers where a hackathon was opened, so the detail page can open as a circle from that spot. */
function initIris(): void {
  document.addEventListener("click", (ev) => {
    const a = (ev.target as Element).closest<HTMLAnchorElement | SVGAElement>("a[data-iris], a.isle");
    if (!a || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    const r = a.getBoundingClientRect();
    const x = ((ev.clientX || r.left + r.width / 2) / innerWidth) * 100;
    const y = ((ev.clientY || r.top + r.height / 2) / innerHeight) * 100;
    try {
      sessionStorage.setItem("hackatlas:iris", JSON.stringify({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }));
    } catch {
      /* no storage: plain navigation */
    }
  });
}

initTheme();
initSave();
initSavedCount();
initCopy();
initIris();
refreshCountdowns();
