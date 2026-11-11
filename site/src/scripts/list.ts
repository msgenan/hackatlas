import type { EventMeta } from "../lib/types";
import { comparator, groupFor, isEnded, matches } from "../lib/filters";
import { GROUP_ORDER, type Group } from "../lib/countdown";
import { initFilters } from "./filter-form";
import { initRail } from "./rail";
import { clientToday, readData } from "./today";

const metas = readData<EventMeta[]>() ?? [];
const today = clientToday();
const rail = initRail(today);

const rowEl = new Map<string, HTMLElement>();
document.querySelectorAll<HTMLElement>(".row[data-id]").forEach((r) => rowEl.set(r.dataset.id!, r));
const lists = new Map<Group | "flat", HTMLElement>();
document.querySelectorAll<HTMLElement>("[data-rows]").forEach((l) => lists.set(l.dataset.rows as Group | "flat", l));
const sections = new Map<string, HTMLElement>();
document.querySelectorAll<HTMLElement>("[data-group]").forEach((s) => sections.set(s.dataset.group!, s));
const noneFound = document.getElementById("none-found");
const intro = document.getElementById("intro-count");

// Events that ended since the build belong in the archive; leave them out.
const live = metas.filter((m) => !isEnded(m, today));
const dayOfGroup = (m: EventMeta) => groupFor(m, today);

const filters = initFilters((f) => render(f));

function render(f = filters.get()): void {
  const visible = live.filter((m) => matches(m, f));
  const visibleIds = new Set(visible.map((m) => m.id));
  const flat = f.sirala !== "son-basvuru";
  const cmp = comparator(f.sirala);

  metas.forEach((m) => {
    const r = rowEl.get(m.id);
    if (r) r.hidden = !visibleIds.has(m.id);
  });

  const place = (list: HTMLElement | undefined, items: EventMeta[]) => {
    if (!list) return;
    items.forEach((m) => {
      const r = rowEl.get(m.id);
      if (r) list.appendChild(r);
    });
  };

  if (flat) {
    sections.forEach((s, k) => (s.hidden = k !== "flat"));
    place(lists.get("flat"), [...live].sort(cmp));
    sections.get("flat")!.hidden = visible.length === 0;
    const gc = sections.get("flat")!.querySelector<HTMLElement>(".gcount");
    if (gc) gc.textContent = `(${visible.length})`;
  } else {
    sections.get("flat")!.hidden = true;
    for (const g of GROUP_ORDER) {
      const items = live.filter((m) => dayOfGroup(m) === g).sort(cmp);
      place(lists.get(g), items);
      const shown = items.filter((m) => visibleIds.has(m.id)).length;
      const s = sections.get(g)!;
      s.hidden = shown === 0;
      const gc = s.querySelector<HTMLElement>(".gcount");
      if (gc) gc.textContent = `(${shown})`;
    }
  }

  if (noneFound) noneFound.hidden = visible.length > 0;
  filters.setCount(live.length, visible.length);
  if (intro) intro.textContent = String(visible.length);
  rail.render(visible.map((m) => ({ id: m.id, name: m.name, deadline: m.deadline })));
}

render();
