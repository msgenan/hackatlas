import { SAVED_EVENT, readSaved, storageAvailable } from "./saved";

const list = document.getElementById("saved-list")!;
const empty = document.getElementById("saved-empty")!;
const blocked = document.getElementById("saved-blocked")!;
const sub = document.getElementById("saved-sub")!;

function render(): void {
  if (!storageAvailable()) {
    blocked.hidden = false;
    empty.hidden = list.hidden = true;
    return;
  }
  const ids = new Set(readSaved());
  let n = 0;
  list.querySelectorAll<HTMLElement>(".row[data-id]").forEach((r) => {
    const on = ids.has(r.dataset.id!);
    r.hidden = !on;
    if (on) n++;
  });
  list.hidden = n === 0;
  empty.hidden = n !== 0;
  sub.hidden = n === 0;
  sub.textContent = `${n} hackathon kaydettin.`;
}
document.addEventListener(SAVED_EVENT, render);
render();
