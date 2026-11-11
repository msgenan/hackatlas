/** Menus: a button with aria-controls pointing at a .pop panel. One open at a time; Escape and outside click close. */
function closeAll(except?: Element): void {
  document.querySelectorAll<HTMLElement>(".pop.is-open").forEach((p) => {
    if (p === except) return;
    p.classList.remove("is-open");
    document.querySelector(`[aria-controls="${p.id}"]`)?.setAttribute("aria-expanded", "false");
  });
}

/** Align an open panel to its button's right edge when it would run past the viewport. */
function keepInViewport(panel: HTMLElement): void {
  if (panel.dataset.align === "end") return;
  panel.classList.remove("pop-end");
  if (panel.getBoundingClientRect().right > document.documentElement.clientWidth) panel.classList.add("pop-end");
}

export function initPopovers(): void {
  document.addEventListener("click", (ev) => {
    const t = ev.target as Element;
    const btn = t.closest<HTMLElement>("[aria-controls][aria-expanded]");
    if (btn) {
      const panel = document.getElementById(btn.getAttribute("aria-controls")!);
      if (!panel?.classList.contains("pop")) return;
      const open = !panel.classList.contains("is-open");
      closeAll(open ? panel : undefined);
      panel.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (open) keepInViewport(panel);
      return;
    }
    if (!t.closest(".pop")) closeAll();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const open = document.querySelector<HTMLElement>(".pop.is-open");
    if (!open) return;
    closeAll();
    document.querySelector<HTMLElement>(`[aria-controls="${open.id}"]`)?.focus();
  });
}
