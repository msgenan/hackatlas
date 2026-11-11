import { describe, expect, it } from "vitest";
import { railHtml, railWeeks } from "../src/lib/rail";

const T = "2026-11-12";
describe("rail", () => {
  it("labels Mondays", () => {
    const w = railWeeks(T);
    expect(w[0]).toEqual({ col: 4, label: "16 Kas" });
    expect(w.length).toBe(8);
  });
  it("stacks max 4 and summarises the rest", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, name: `Etkinlik ${i}`, deadline: "2026-11-14" }));
    const html = railHtml(items, T, false);
    expect((html.match(/class="tick"/g) ?? []).length).toBe(4);
    expect(html).toContain("+2");
    expect(html).toContain('data-tone="accent"');
  });
  it("skips past, far and missing deadlines and shows the empty note", () => {
    const html = railHtml([{ id: "a", name: "A", deadline: "2026-11-01" }, { id: "b", name: "B", deadline: "2027-06-01" }, { id: "c", name: "C", deadline: null }], T, false);
    expect(html).not.toContain("tick");
    expect(html).toContain("rail-empty");
  });
  it("escapes names", () => {
    expect(railHtml([{ id: "a", name: 'A "<b>"', deadline: "2026-12-20" }], T, false)).not.toContain("<b>");
  });
});
