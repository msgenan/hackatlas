import { railHtml, railSignature, type RailItem } from "../lib/rail";
import { reducedMotion } from "./today";

/** Renders the rail for the given items and wires tooltip, row highlight, click-to-scroll and arrow keys. */
export function initRail(today: string) {
  const host = document.querySelector<HTMLElement>(".rail");
  const track = host?.querySelector<HTMLElement>(".rail-track");
  const tip = document.getElementById("rail-tip");
  if (!host || !track || !tip) return { render: (_: RailItem[]) => {} };

  const rowsFor = (btn: HTMLElement) =>
    (btn.dataset.ids ?? "").split(" ").map((id) => document.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"]`)).filter((r): r is HTMLElement => !!r);

  const show = (btn: HTMLElement) => {
    tip.textContent = btn.dataset.tip ?? "";
    tip.setAttribute("aria-hidden", "false");
    tip.classList.add("is-on");
    const hr = host.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = br.left - hr.left + br.width / 2 - tw / 2;
    left = Math.max(0, Math.min(left, hr.width - tw));
    let top = br.top - hr.top - th - 6;
    if (top < -th) top = br.bottom - hr.top + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    btn.classList.add("is-active");
    rowsFor(btn).forEach((r) => r.classList.add("is-hl"));
  };
  const hide = () => {
    tip.classList.remove("is-on");
    tip.setAttribute("aria-hidden", "true");
    track.querySelectorAll(".is-active").forEach((b) => b.classList.remove("is-active"));
    document.querySelectorAll(".row.is-hl").forEach((r) => r.classList.remove("is-hl"));
  };
  const target = (e: Event) => (e.target as Element).closest<HTMLElement>(".tick");

  track.addEventListener("mouseover", (e) => { const b = target(e); if (b) show(b); });
  track.addEventListener("mouseout", (e) => { if (target(e)) hide(); });
  track.addEventListener("focusin", (e) => { const b = target(e); if (b) show(b); });
  track.addEventListener("focusout", (e) => { if (target(e)) hide(); });
  track.addEventListener("click", (e) => {
    const b = target(e);
    if (!b) return;
    const row = rowsFor(b).find((r) => !r.hidden);
    if (!row) return;
    row.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    row.querySelector<HTMLElement>(".name a")?.focus({ preventScroll: true });
  });
  track.addEventListener("keydown", (e) => {
    const b = target(e);
    if (!b) return;
    const days = [...track.querySelectorAll<HTMLElement>(".rail-day")];
    const day = b.closest<HTMLElement>(".rail-day")!;
    const di = days.indexOf(day);
    const ticks = [...day.querySelectorAll<HTMLElement>(".tick")];
    const ti = ticks.indexOf(b);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowRight") next = days[di + 1]?.querySelector<HTMLElement>(".tick") ?? undefined;
    else if (e.key === "ArrowLeft") next = days[di - 1]?.querySelector<HTMLElement>(".tick") ?? undefined;
    else if (e.key === "ArrowUp") next = ticks[ti + 1]; // column-reverse: later DOM items sit higher
    else if (e.key === "ArrowDown") next = ticks[ti - 1];
    else if (e.key === "Home") next = track.querySelector<HTMLElement>(".tick") ?? undefined;
    else if (e.key === "End") next = [...track.querySelectorAll<HTMLElement>(".tick")].pop();
    else return;
    e.preventDefault();
    if (!next) return;
    track.querySelectorAll<HTMLElement>(".tick").forEach((t) => (t.tabIndex = -1));
    next.tabIndex = 0;
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  const roving = () => {
    const first = track.querySelector<HTMLElement>(".tick");
    if (first) first.tabIndex = 0;
  };
  roving();

  return {
    render(items: RailItem[]) {
      const sig = railSignature(items, today);
      if (sig === track.dataset.sig) return;
      track.dataset.sig = sig;
      hide();
      host.removeAttribute("data-enter"); // the rise-in plays once, on first load only
      track.innerHTML = railHtml(items, today, false);
      roving();
    },
  };
}
