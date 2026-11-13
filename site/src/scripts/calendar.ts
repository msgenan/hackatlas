/** Calendar: one month at a time (all months stay in the page without JS), region switch shared with the URL. */
import type { EventMeta } from "../lib/types";
import { DEFAULT_FILTERS, matches, parseFilters, type Region } from "../lib/filters";
import { readData } from "./today";

const root = document.querySelector<HTMLElement>("[data-cal]");
const metas = readData<Record<string, EventMeta>>("hackatlas-data") ?? {};
if (root) {
  const blocks = [...root.querySelectorAll<HTMLElement>("[data-month]")];
  const label = root.querySelector<HTMLElement>("[data-cal-label]")!;
  const steps = root.querySelectorAll<HTMLButtonElement>("[data-cal-step]");
  const params = new URLSearchParams(location.search);
  let cur = Math.min(blocks.length - 1, Math.max(0, Number(params.get("ay") ?? 0) || 0));
  const show = () => {
    blocks.forEach((b, i) => (b.hidden = i !== cur));
    label.textContent = blocks[cur]?.getAttribute("aria-label") ?? "";
    steps[0]!.disabled = cur === 0;
    steps[1]!.disabled = cur === blocks.length - 1;
    const p = new URLSearchParams(location.search);
    if (cur) p.set("ay", String(cur));
    else p.delete("ay");
    history.replaceState(history.state, "", p.toString() ? `?${p}` : location.pathname);
  };
  steps.forEach((b) => b.addEventListener("click", () => ((cur = Math.min(blocks.length - 1, Math.max(0, cur + Number(b.dataset.calStep)))), show())));
  root.classList.add("one-month");
  show();

  const region = root.querySelector<HTMLElement>("[data-cal-region]");
  const apply = (bolge: Region) => {
    const f = { ...DEFAULT_FILTERS, bolge };
    root.querySelectorAll<HTMLElement>(".ce").forEach((li) => {
      const m = metas[li.dataset.id!];
      li.hidden = !m || !matches(m, f);
      li.removeAttribute("data-pre");
    });
    root.querySelectorAll<HTMLElement>(".cal-day").forEach((d) => d.classList.toggle("has", !!d.querySelector(".ce:not([hidden])")));
  };
  const initial = parseFilters(params).bolge === "tumu" ? "tumu" : "katilabilir";
  region?.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = i.value === initial));
  apply(initial);
  region?.addEventListener("change", (e) => {
    const v = (e.target as HTMLInputElement).value as Region;
    const p = new URLSearchParams(location.search);
    if (v === "tumu") p.set("bolge", "tumu");
    else p.delete("bolge");
    history.replaceState(history.state, "", p.toString() ? `?${p}` : location.pathname);
    apply(v);
  });
}
