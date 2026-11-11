import { describe, expect, it } from "vitest";
import { countdownInner, countdownStatus, groupOf } from "../src/lib/countdown";

const T = "2026-11-12";
const future = { starts: "2027-03-01", ends: "2027-03-02" };
const st = (deadline: string | null, extra = future) => countdownStatus({ deadline, ...extra }, T);

describe("countdown wording", () => {
  it("today", () => {
    expect(st("2026-11-12")).toMatchObject({ text: "Bugün son gün", tone: "danger", kind: "today" });
  });
  it("1 to 3 days is danger", () => {
    expect(st("2026-11-13")).toMatchObject({ text: "1 gün kaldı", tone: "danger" });
    expect(st("2026-11-15")).toMatchObject({ text: "3 gün kaldı", tone: "danger" });
  });
  it("4 to 7 days is accent", () => {
    expect(st("2026-11-16")).toMatchObject({ text: "4 gün kaldı", tone: "accent" });
    expect(st("2026-11-19")).toMatchObject({ text: "7 gün kaldı", tone: "accent" });
  });
  it("8 days and more is neutral", () => {
    expect(st("2026-11-20")).toMatchObject({ text: "8 gün kaldı", tone: "neutral" });
    expect(st("2026-12-06")).toMatchObject({ text: "24 gün kaldı", tone: "neutral" });
  });
  it("no deadline but event dates known", () => {
    expect(st(null)).toMatchObject({ text: "Başvuru tarihi yok", tone: "muted", kind: "nodeadline" });
  });
  it("no deadline and no dates at all", () => {
    expect(st(null, { starts: null, ends: null } as never)).toMatchObject({ text: "Tarih açıklanmadı", tone: "muted", kind: "unknown" });
  });
  it("closed when the deadline passed but the event is not over", () => {
    expect(st("2026-11-11")).toMatchObject({ text: "Başvuru kapandı", kind: "closed" });
  });
  it("ended when the event is over", () => {
    expect(st("2026-10-05", { starts: "2026-10-18", ends: "2026-10-19" })).toMatchObject({ text: "Bitti", kind: "ended" });
    expect(st(null, { starts: "2026-11-11", ends: "2026-11-11" }).kind).toBe("ended");
    expect(st(null, { starts: "2026-11-12", ends: "2026-11-12" }).kind).toBe("nodeadline");
  });
  it("renders the big number separately", () => {
    expect(countdownInner(st("2026-11-18"))).toBe('<b class="cd-n">6</b> <span class="cd-t">gün kaldı</span>');
  });
  it("groups by horizon", () => {
    const g = (d: string | null) => groupOf({ deadline: d, ...future }, T);
    expect(g("2026-11-19")).toBe("week");
    expect(g("2026-11-20")).toBe("month");
    expect(g("2026-12-13")).toBe("month"); // 31 days
    expect(g("2026-12-14")).toBe("later");
    expect(g(null)).toBe("later"); // grouped by start date (2027-03-01)
    expect(groupOf({ deadline: null, starts: "2026-11-20", ends: "2026-11-21" }, T)).toBe("month");
    expect(groupOf({ deadline: null, starts: "2026-11-15", ends: null }, T)).toBe("week");
    expect(groupOf({ deadline: null, starts: null, ends: null }, T)).toBe("unknown");
    expect(g("2026-11-01")).toBe("closed");
  });
});
