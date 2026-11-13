import { describe, expect, it } from "vitest";
import { islandRadius, islandShape, labelLines, layoutChart, CHART_H, HARBOR_W } from "../src/lib/chart";
import { loadEvents, loadFx } from "../src/lib/data";
import { toMeta } from "../src/lib/events";
import { isEnded } from "../src/lib/filters";
import type { EventMeta } from "../src/lib/types";

const meta = (o: Partial<EventMeta>): EventMeta => ({
  id: "x", name: "X", deadline: null, starts: null, ends: null, country: null, format: null, themes: [],
  hasPrize: false, prizeUsd: null, added: "2026-11-12T00:00:00Z", search: "", city: null, prizeAmount: null,
  prizeCurrency: null, ...o,
});

describe("island shapes", () => {
  it("are deterministic and scale with the prize", () => {
    expect(islandShape("a-2026", 0, 0, 20)).toEqual(islandShape("a-2026", 0, 0, 20));
    expect(islandShape("a-2026", 0, 0, 20).land).not.toBe(islandShape("b-2026", 0, 0, 20).land);
    expect(islandRadius(null)).toBeLessThan(islandRadius(1000));
    expect(islandRadius(1_000)).toBeLessThan(islandRadius(1_000_000));
    expect(islandRadius(10_000_000)).toBe(islandRadius(1_000_000));
  });
});

describe("labels", () => {
  it("wrap to two lines and mark cuts", () => {
    expect(labelLines("Short")).toEqual(["Short"]);
    expect(labelLines("PayPal AI Hackathon")).toEqual(["PayPal AI Hackathon"]);
    const long = labelLines("AI for Medicine: A Global Student Hackathon on the Future of Care");
    expect(long).toHaveLength(2);
    expect(long[1]!.endsWith("…")).toBe(true);
    for (const l of long) expect(l.length).toBeLessThanOrEqual(21);
    expect(labelLines("Supercalifragilisticexpialidocious")[0]!.endsWith("…")).toBe(true);
  });
});

describe("chart layout", () => {
  const today = "2026-11-13";
  it("puts later deadlines further east and today after the harbor", () => {
    const c = layoutChart(
      [meta({ id: "a", deadline: "2026-11-20" }), meta({ id: "b", deadline: "2026-12-20" }), meta({ id: "c", deadline: "2026-11-01", ends: "2026-12-01" })],
      today,
    );
    const by = (id: string) => c.islands.find((i) => i.id === id)!;
    expect(c.todayX).toBeGreaterThan(HARBOR_W);
    expect(by("a").x).toBeLessThan(by("b").x);
    expect(by("c").x).toBeLessThan(c.todayX);
    expect(by("c").state).toBe("closed");
    expect(by("a").flare).toBe(true);
    expect(by("b").flare).toBe(false);
  });

  it("keeps undated events in the fog at the east edge", () => {
    const c = layoutChart([meta({ id: "a", deadline: "2026-11-20" }), meta({ id: "u" })], today);
    expect(c.fogX).not.toBeNull();
    expect(c.islands.find((i) => i.id === "u")!.x).toBeGreaterThan(c.fogX!);
  });

  it("places the real data without overlapping islands, inside the frame", () => {
    const fx = loadFx();
    const metas = loadEvents().map((e) => toMeta(e, fx)).filter((m) => !isEnded(m, today));
    const c = layoutChart(metas, today);
    expect(c.islands).toHaveLength(metas.length);
    for (const i of c.islands) {
      expect(i.y - i.r).toBeGreaterThan(0);
      expect(i.ly + i.label.length * 15).toBeLessThan(CHART_H);
      expect(i.x).toBeLessThan(c.width);
    }
    let clashes = 0;
    for (let a = 0; a < c.islands.length; a++)
      for (let b = a + 1; b < c.islands.length; b++) {
        const p = c.islands[a]!;
        const q = c.islands[b]!;
        if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) clashes++;
      }
    expect(clashes).toBe(0);
  });
});
