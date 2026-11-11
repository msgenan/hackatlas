import { countdownStatus, countdownInner } from "../lib/countdown";
import { initPopovers } from "./popover";
import { initSave } from "./saved";
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
    const s = countdownStatus(
      { deadline: el.dataset.deadline || null, starts: el.dataset.starts || null, ends: el.dataset.ends || null },
      today,
    );
    el.dataset.tone = s.tone;
    el.innerHTML = countdownInner(s);
  });
}

function initCopy(): void {
  document.addEventListener("click", async (ev) => {
    const b = (ev.target as Element).closest<HTMLElement>("[data-copy]");
    if (!b) return;
    const label = b.querySelector<HTMLElement>(".copy-label");
    const done = () => {
      if (label) {
        const old = label.textContent;
        label.textContent = "Kopyalandı";
        setTimeout(() => (label.textContent = old), 1800);
      }
    };
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname);
      done();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = location.origin + location.pathname;
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

initTheme();
initPopovers();
initSave();
initCopy();
refreshCountdowns();
