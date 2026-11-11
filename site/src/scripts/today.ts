import { isDateOnly, todayISO } from "../lib/dates";

/** Real current date in Turkey. `?today=YYYY-MM-DD` overrides it (for deterministic screenshots only). */
export function clientToday(): string {
  try {
    const q = new URLSearchParams(location.search).get("today");
    if (q && isDateOnly(q)) return q;
  } catch {
    /* ignore */
  }
  return todayISO();
}

export function readData<T>(id = "hackatlas-data"): T | null {
  const el = document.getElementById(id);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
