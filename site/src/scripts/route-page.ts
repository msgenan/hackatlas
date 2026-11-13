/** Rotam: shows the saved entries (rendered hidden at build time) and keeps up as they are removed. */
import { readSaved, SAVED_EVENT, storageAvailable } from "./saved";

const list = document.querySelector<HTMLElement>("[data-route-list]");
const empty = document.querySelector<HTMLElement>("[data-route-empty]");
const lead = document.querySelector<HTMLElement>("[data-route-lead]");
const paint = () => {
  if (!list) return;
  const ids = new Set(readSaved());
  let n = 0;
  list.querySelectorAll<HTMLLIElement>(".entry").forEach((li) => {
    const on = ids.has(li.dataset.id!);
    li.hidden = !on;
    if (on) n++;
  });
  if (empty) empty.hidden = n > 0;
  if (lead) lead.hidden = n === 0;
};
if (!storageAvailable()) {
  document.querySelector<HTMLElement>("[data-route-nostorage]")!.hidden = false;
} else {
  paint();
  document.addEventListener(SAVED_EVENT, paint);
}
