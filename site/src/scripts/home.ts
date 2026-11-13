/** Home page: filters drive the gazetteer and ghost the islands that drop out. State lives in the URL. */
import type { EventMeta } from "../lib/types";
import { comparator, DEFAULT_FILTERS, groupFor, isFiltered, matches, parseFilters, serializeFilters, type Filters } from "../lib/filters";
import { countText } from "../lib/format";
import { initChart } from "./chart";
import { clientToday, readData } from "./today";

const metas = readData<EventMeta[]>("hackatlas-data") ?? [];
const byId = new Map(metas.map((m) => [m.id, m]));
const form = document.querySelector<HTMLFormElement>("[data-filters]");
const chart = initChart();
const today = clientToday();

const entries = new Map<string, HTMLLIElement>();
const home = new Map<HTMLLIElement, { parent: HTMLElement; index: number }>();
document.querySelectorAll<HTMLLIElement>(".gazetteer .entry").forEach((li) => {
  entries.set(li.dataset.id!, li);
  home.set(li, { parent: li.parentElement!, index: [...li.parentElement!.children].indexOf(li) });
});
const flatGroup = document.querySelector<HTMLElement>('[data-group="flat"]');
const flatList = flatGroup?.querySelector<HTMLElement>("[data-rows]");
const none = document.querySelector<HTMLElement>("[data-none]");
const countEl = document.querySelector<HTMLElement>("[data-count]");
const visibleCount = document.querySelector<HTMLElement>("[data-visible-count]");
const clearBtns = document.querySelectorAll<HTMLButtonElement>("[data-clear]");
const SORT_NAMES: Record<string, string> = { odul: "Ödüle göre", tarih: "Başlangıç tarihine göre", yeni: "Yeni eklenenler önce" };

function readForm(): Filters {
  if (!form) return DEFAULT_FILTERS;
  const fd = new FormData(form);
  const p = new URLSearchParams();
  p.set("q", String(fd.get("q") ?? ""));
  p.set("bolge", String(fd.get("bolge") ?? "katilabilir"));
  p.set("format", fd.getAll("format").join(","));
  p.set("konu", fd.getAll("konu").join(","));
  if (fd.get("odul")) p.set("odul", "1");
  p.set("sirala", String(fd.get("sirala") ?? "son-basvuru"));
  return parseFilters(p);
}

function writeForm(f: Filters): void {
  if (!form) return;
  (form.elements.namedItem("q") as HTMLInputElement).value = f.q;
  form.querySelectorAll<HTMLInputElement>('input[name="bolge"]').forEach((i) => (i.checked = i.value === f.bolge));
  form.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((i) => (i.checked = f.format.includes(i.value as never)));
  form.querySelectorAll<HTMLInputElement>('input[name="konu"]').forEach((i) => (i.checked = f.konu.includes(i.value)));
  (form.elements.namedItem("odul") as HTMLInputElement).checked = f.odul;
  (form.elements.namedItem("sirala") as HTMLSelectElement).value = f.sirala;
}

function restoreHome(): void {
  // Put every entry back in its group, in its original order.
  const byParent = new Map<HTMLElement, HTMLLIElement[]>();
  home.forEach((h, li) => {
    const arr = byParent.get(h.parent) ?? [];
    arr[h.index] = li;
    byParent.set(h.parent, arr);
  });
  byParent.forEach((arr, parent) => arr.forEach((li) => li && parent.appendChild(li)));
}

function apply(f: Filters): void {
  const shown = new Set<string>();
  for (const m of metas) if (matches(m, f)) shown.add(m.id);
  entries.forEach((li, id) => {
    li.hidden = !shown.has(id);
    li.removeAttribute("data-pre");
  });

  const grouped = f.sirala === "son-basvuru";
  if (grouped) {
    restoreHome();
    if (flatGroup) flatGroup.hidden = true;
    document.querySelectorAll<HTMLElement>(".gazetteer .group[data-group]").forEach((g) => {
      if (g.dataset.group === "flat") return;
      const n = [...g.querySelectorAll<HTMLLIElement>(".entry")].filter((li) => !li.hidden).length;
      g.hidden = n === 0;
      const c = g.querySelector("[data-gcount]");
      if (c) c.textContent = String(n);
    });
  } else if (flatGroup && flatList) {
    const cmp = comparator(f.sirala);
    const ids = [...shown].sort((a, b) => cmp(byId.get(a)!, byId.get(b)!));
    ids.forEach((id) => flatList.appendChild(entries.get(id)!));
    document.querySelectorAll<HTMLElement>(".gazetteer .group[data-group]").forEach((g) => (g.hidden = g !== flatGroup));
    flatGroup.hidden = ids.length === 0;
    flatGroup.querySelector("[data-gcount]")!.textContent = String(ids.length);
    flatGroup.querySelector("[data-flat-name]")!.textContent = SORT_NAMES[f.sirala] ?? "Sıralı liste";
  }

  if (none) none.hidden = shown.size > 0;
  if (countEl) countEl.textContent = countText(metas.length, shown.size);
  if (visibleCount) visibleCount.textContent = String([...shown].filter((id) => groupFor(byId.get(id)!, today) !== "closed").length);
  clearBtns.forEach((b) => {
    if (b.closest("[data-filters]")) b.hidden = !isFiltered(f);
  });
  chart?.setVisible(shown);
}

function sync(): void {
  const f = readForm();
  const params = serializeFilters(f, new URLSearchParams(location.search));
  const qs = params.toString();
  history.replaceState(history.state, "", qs ? `?${qs}${location.hash}` : `${location.pathname}${location.hash}`);
  apply(f);
}

if (form) {
  const initial = parseFilters(new URLSearchParams(location.search));
  writeForm(initial);
  apply(initial);
  let t = 0;
  form.addEventListener("input", (e) => {
    clearTimeout(t);
    if ((e.target as HTMLInputElement).name === "q") t = window.setTimeout(sync, 140);
    else sync();
  });
  clearBtns.forEach((b) =>
    b.addEventListener("click", () => {
      writeForm({ ...DEFAULT_FILTERS, sirala: readForm().sirala });
      sync();
    }),
  );
}

/* List and chart talk to each other: hovering an entry lights its island, the locate button sails to it. */
document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("[data-locate]");
  if (b) chart?.locate(b.dataset.locate!);
});
const gz = document.querySelector(".gazetteer");
gz?.addEventListener("pointerover", (e) => {
  const li = (e.target as Element).closest<HTMLLIElement>(".entry");
  chart?.hot(li?.dataset.id ?? null);
});
gz?.addEventListener("pointerleave", () => chart?.hot(null));
