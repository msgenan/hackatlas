import type { EventMeta } from "../lib/types";
import { matches, type Filters } from "../lib/filters";
import { MONTHS, formatWeekdayDay, monthCells, monthKey, parts } from "../lib/dates";
import { initFilters } from "./filter-form";
import { clientToday, readData } from "./today";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const metas = readData<EventMeta[]>() ?? [];
const today = clientToday();
const body = document.getElementById("cal-body")!;
const title = document.getElementById("cal-title")!;
const panel = document.getElementById("day-panel") as HTMLDialogElement;
const none = document.getElementById("cal-none")!;

let ym = (() => {
  const q = new URLSearchParams(location.search).get("ay");
  const m = q && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : today.slice(0, 7);
  return { y: +m.slice(0, 4), m: +m.slice(5, 7) };
})();
let visible: EventMeta[] = metas;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Entry { m: EventMeta; kind: "deadline" | "event" }
function entriesOn(d: string): Entry[] {
  const out: Entry[] = [];
  for (const m of visible) if (m.deadline === d) out.push({ m, kind: "deadline" });
  for (const m of visible) {
    const s = m.starts ?? m.ends;
    const e = m.ends ?? m.starts;
    if (s && e && s <= d && d <= e) out.push({ m, kind: "event" });
  }
  return out;
}
const entryHtml = ({ m, kind }: Entry) =>
  `<a class="cal-entry ${kind === "deadline" ? "dl" : "ev"}" href="${BASE}/e/${esc(m.id)}/" title="${esc(m.name)}${kind === "deadline" ? ", son başvuru" : ""}">${kind === "deadline" ? '<i class="dot"></i>' : ""}<span>${esc(m.name)}</span></a>`;

function render(): void {
  title.textContent = `${MONTHS[ym.m - 1]} ${ym.y}`;
  const cells = monthCells(ym.y, ym.m);
  const key = monthKey(ym.y, ym.m);
  let html = "";
  for (let i = 0; i < cells.length; i += 7) {
    html += '<div class="cal-week">';
    for (const d of cells.slice(i, i + 7)) {
      const list = entriesOn(d);
      const shown = list.slice(0, 3);
      const rest = list.length - shown.length;
      const cls = ["cal-day", d.startsWith(key) ? "" : "out", d === today ? "today" : ""].join(" ");
      html += `<div class="${cls}" data-day="${d}"><span class="dnum">${parts(d).d}</span><div class="cal-entries">${shown.map((e) => `<div>${entryHtml(e)}</div>`).join("")}${
        rest > 0 ? `<div><button type="button" class="cal-more" data-day="${d}">+${rest} daha</button></div>` : ""
      }</div></div>`;
    }
    html += "</div>";
  }
  body.innerHTML = html;
  const q = new URLSearchParams(location.search);
  if (key === today.slice(0, 7)) q.delete("ay");
  else q.set("ay", key);
  const qs = q.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
}

const step = (n: number) => {
  const t = ym.y * 12 + (ym.m - 1) + n;
  ym = { y: Math.floor(t / 12), m: (t % 12) + 1 };
  render();
};
document.getElementById("cal-prev")!.addEventListener("click", () => step(-1));
document.getElementById("cal-next")!.addEventListener("click", () => step(1));
document.getElementById("cal-today")!.addEventListener("click", () => {
  ym = { y: +today.slice(0, 4), m: +today.slice(5, 7) };
  render();
});
body.addEventListener("click", (ev) => {
  const b = (ev.target as Element).closest<HTMLElement>(".cal-more");
  if (!b) return;
  const d = b.dataset.day!;
  document.getElementById("day-title")!.textContent = formatWeekdayDay(d, today);
  document.getElementById("day-list")!.innerHTML = entriesOn(d).map((e) => `<li>${entryHtml(e)}</li>`).join("");
  panel.showModal();
});
panel.addEventListener("click", (ev) => {
  if (ev.target === panel) panel.close();
});

const filters = initFilters(apply);
function apply(f: Filters = filters.get()): void {
  visible = metas.filter((m) => matches(m, f));
  const ids = new Set(visible.map((m) => m.id));
  document.querySelectorAll<HTMLElement>("#cal-agenda li").forEach((li) => (li.hidden = !ids.has(li.dataset.id!)));
  document.querySelectorAll<HTMLElement>("#cal-agenda .agenda-day").forEach((d) => (d.hidden = ![...d.querySelectorAll("li")].some((li) => !li.hidden)));
  none.hidden = visible.length > 0;
  filters.setCount(metas.length, visible.length);
  render();
}
apply();
