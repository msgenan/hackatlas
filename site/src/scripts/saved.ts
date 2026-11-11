const KEY = "hackatlas:saved";
export const SAVED_EVENT = "hackatlas:saved-changed";

export function storageAvailable(): boolean {
  try {
    const k = "hackatlas:probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function readSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export function toggleSaved(id: string): boolean {
  const ids = readSaved();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  write(next);
  document.dispatchEvent(new CustomEvent(SAVED_EVENT));
  return next.includes(id);
}

function paint(): void {
  const ids = new Set(readSaved());
  document.querySelectorAll<HTMLButtonElement>("[data-save]").forEach((b) => {
    const on = ids.has(b.dataset.save!);
    b.setAttribute("aria-pressed", String(on));
    if (!b.classList.contains("save-full")) b.title = on ? "Kaydedildi" : "Kaydet";
  });
}

export function initSave(): void {
  if (!storageAvailable()) {
    document.documentElement.classList.add("no-storage");
    return;
  }
  paint();
  document.addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>("[data-save]");
    if (!b) return;
    ev.preventDefault();
    toggleSaved(b.dataset.save!);
  });
  document.addEventListener(SAVED_EVENT, paint);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      paint();
      document.dispatchEvent(new CustomEvent(SAVED_EVENT));
    }
  });
}
