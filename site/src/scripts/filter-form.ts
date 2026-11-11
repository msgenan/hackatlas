import { DEFAULT_FILTERS, isFiltered, parseFilters, serializeFilters, type Filters } from "../lib/filters";
import type { Format } from "../lib/types";
import { countText } from "../lib/format";

/** Wires the shared filter form to the URL (replaceState) and calls `onChange` with the parsed filters. */
export function initFilters(onChange: (f: Filters) => void): {
  get: () => Filters;
  setCount: (total: number, shown: number) => void;
} {
  const form = document.getElementById("filters") as HTMLFormElement | null;
  const read = (): Filters => {
    if (!form) return parseFilters(new URLSearchParams(location.search));
    const fd = new FormData(form);
    return parseFilters(
      new URLSearchParams({
        q: String(fd.get("q") ?? ""),
        bolge: String(fd.get("bolge") ?? ""),
        format: fd.getAll("format").join(","),
        konu: fd.getAll("konu").join(","),
        odul: String(fd.get("odul") ?? ""),
        sirala: String(fd.get("sirala") ?? ""),
      }),
    );
  };
  const write = (f: Filters) => {
    if (!form) return;
    (form.elements.namedItem("q") as HTMLInputElement).value = f.q;
    form.querySelectorAll<HTMLInputElement>('input[name="bolge"]').forEach((i) => (i.checked = i.value === f.bolge));
    form.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((i) => (i.checked = f.format.includes(i.value as Format)));
    form.querySelectorAll<HTMLInputElement>('input[name="konu"]').forEach((i) => (i.checked = f.konu.includes(i.value)));
    (form.elements.namedItem("odul") as HTMLInputElement).checked = f.odul;
    const sort = form.elements.namedItem("sirala") as HTMLSelectElement | null;
    if (sort) sort.value = f.sirala;
    for (const [name, n] of [["format", f.format.length], ["konu", f.konu.length]] as const) {
      const badge = form.querySelector<HTMLElement>(`[aria-controls="pop-${name}"] .count`);
      if (badge) {
        badge.textContent = String(n);
        badge.hidden = n === 0;
      }
    }
  };

  let current = parseFilters(new URLSearchParams(location.search));
  write(current);

  const apply = () => {
    current = read();
    write(current);
    const params = serializeFilters(current, new URLSearchParams(location.search));
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
    onChange(current);
  };
  form?.addEventListener("input", apply);
  form?.addEventListener("change", apply);
  document.addEventListener("click", (ev) => {
    if ((ev.target as Element).closest("[data-clear]")) {
      // Keep the chosen sort; reset everything else.
      write({ ...DEFAULT_FILTERS, sirala: current.sirala });
      apply();
    }
  });

  const countEl = document.getElementById("result-count");
  const clearBtns = document.querySelectorAll<HTMLElement>("[data-clear]");
  return {
    get: () => current,
    setCount: (total, shown) => {
      if (countEl) countEl.textContent = countText(total, shown);
      clearBtns.forEach((b) => {
        if (b.closest("#filters")) b.hidden = !isFiltered(current);
      });
    },
  };
}
