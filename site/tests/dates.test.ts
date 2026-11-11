import { describe, expect, it } from "vitest";
import { addDays, diffDays, formatDay, formatRange, isDateOnly, monthCells, todayISO, weekdayIndex } from "../src/lib/dates";

const T = "2026-11-12";

describe("dates", () => {
  it("formats a day without the current year", () => {
    expect(formatDay("2026-11-14", T)).toBe("14 Kasım");
    expect(formatDay("2027-01-10", T)).toBe("10 Ocak 2027");
  });
  it("formats ranges", () => {
    expect(formatRange("2026-12-12", "2026-12-13", T)).toBe("12-13 Aralık");
    expect(formatRange("2026-11-28", "2026-12-02", T)).toBe("28 Kasım - 2 Aralık");
    expect(formatRange("2026-12-01", "2027-01-15", T)).toBe("1 Aralık 2026 - 15 Ocak 2027");
    expect(formatRange("2027-02-20", "2027-02-22", T)).toBe("20-22 Şubat 2027");
    expect(formatRange("2027-02-20", "2027-03-01", T)).toBe("20 Şubat - 1 Mart 2027");
    expect(formatRange("2026-12-12", "2026-12-12", T)).toBe("12 Aralık");
    expect(formatRange("2026-12-12", null, T)).toBe("12 Aralık");
    expect(formatRange(null, null, T)).toBeNull();
  });
  it("does date arithmetic without timezone drift", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-11-14", T)).toBe(2);
    expect(weekdayIndex("2026-11-12")).toBe(3); // Thursday
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-02-28")).toBe(true);
  });
  it("uses the Turkey calendar day", () => {
    expect(todayISO(new Date("2026-11-11T22:30:00Z"))).toBe("2026-11-12");
  });
  it("builds Monday-first month grids of full weeks", () => {
    const cells = monthCells(2026, 11);
    expect(cells[0]).toBe("2026-10-26");
    expect(cells.at(-1)).toBe("2026-12-06");
    expect(cells.length % 7).toBe(0);
  });
});
