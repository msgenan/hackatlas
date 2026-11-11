import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, eventComponents, foldLine } from "../src/lib/ical";
import type { HackEvent } from "../src/lib/types";

const ev = (over: Partial<HackEvent> = {}): HackEvent => ({
  id: "demo-2026", name: "Demo, Hack; Weekend", organizer: null, url: "https://example.com", summary: "Satır bir\nsatır iki",
  format: null, location: null, starts_on: "2026-12-12", ends_on: "2026-12-13", deadline: "2026-11-14", prize: null, team: null,
  eligibility: null, themes: [], sources: [], confidence: null, added_at: "2026-11-12T09:00:00Z", updated_at: "2026-11-12T09:00:00Z", ...over,
});

describe("ical", () => {
  it("escapes text", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    // a bare carriage return must not start a new iCalendar property
    expect(escapeText("x\rDESCRIPTION:evil")).toBe("x\\nDESCRIPTION:evil");
  });
  it("folds at 75 octets without splitting characters", () => {
    const line = "SUMMARY:" + "ş".repeat(60);
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(parts.join("").replace(/ /g, "")).toBe(line.replace(/ /g, ""));
    expect(foldLine("SHORT:line")).toBe("SHORT:line");
  });
  it("builds all-day events with an exclusive end and stable UIDs", () => {
    const text = buildCalendar("hackatlas", [ev()], (e) => `https://x/e/${e.id}/`);
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
    expect(text).toContain("UID:demo-2026@hackatlas");
    expect(text).toContain("DTSTART;VALUE=DATE:20261212\r\nDTEND;VALUE=DATE:20261214");
    expect(text).toContain("DTSTART;VALUE=DATE:20261114\r\nDTEND;VALUE=DATE:20261115");
    expect(text).toContain("SUMMARY:Son başvuru: Demo\\, Hack\\; Weekend");
    expect(text).toContain("DTSTAMP:20261112T090000Z");
  });
  it("handles single-date and dateless events", () => {
    expect(eventComponents(ev({ deadline: null, ends_on: null }), "u").join("\n")).toContain("DTEND;VALUE=DATE:20261213");
    expect(eventComponents(ev({ deadline: null, starts_on: null, ends_on: null }), "u")).toEqual([]);
  });
});
