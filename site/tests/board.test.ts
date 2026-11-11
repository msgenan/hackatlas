import { describe, expect, it } from "vitest";
import { BOARD_COLS, boardRows, boardText, prizeShort, remainingText, remainingTone } from "../src/lib/board";
import { barcode, barcodePath } from "../src/lib/barcode";
import type { EventMeta } from "../src/lib/types";

const at = (s: string) => Date.parse(s);
const meta = (o: Partial<EventMeta>): EventMeta => ({
  id: "x", name: "X", deadline: null, starts: null, ends: null, country: null, format: null, themes: [],
  hasPrize: false, prizeUsd: null, added: "2026-11-12T00:00:00Z", search: "", city: null, prizeAmount: null,
  prizeCurrency: null, ...o,
});

describe("board text", () => {
  it("uppercases Turkish correctly and pads to width", () => {
    expect(boardText("istanbul şişli", 16)).toBe("İSTANBUL ŞİŞLİ  ");
    expect(boardText("Yapay zekâ", 12)).toBe("YAPAY ZEKA  ");
    expect(boardText("Münster: Agentic AI", 12)).toBe("MÜNSTER: AGE");
    expect(boardText("a very long hackathon name that overflows", 10)).toHaveLength(10);
  });
  it("formats remaining time", () => {
    // deadline 2026-11-14 closes at the next midnight in Turkey, 2026-11-14T21:00:00Z
    expect(remainingText("2026-11-14", at("2026-11-14T08:00:00Z"))).toBe("13:00:00");
    expect(remainingText("2026-11-14", at("2026-11-14T20:59:59.500Z"))).toBe("00:00:00");
    expect(remainingText("2026-11-14", at("2026-11-14T21:00:00Z"))).toBe("KAPANDI ");
    expect(remainingText("2026-11-20", at("2026-11-12T20:59:59Z"))).toBe("8G 00S  ");
    expect(remainingText("2026-11-01", at("2026-11-12T00:00:00Z"))).toBe("KAPANDI ");
    for (const s of ["13:00:00", "8G 00S  ", "KAPANDI "]) expect(s).toHaveLength(BOARD_COLS.kalan);
  });
  it("tones by urgency", () => {
    expect(remainingTone("2026-11-13", at("2026-11-12T12:00:00Z"))).toBe("red");
    expect(remainingTone("2026-11-17", at("2026-11-12T12:00:00Z"))).toBe("amber");
    expect(remainingTone("2026-12-30", at("2026-11-12T12:00:00Z"))).toBe("normal");
  });
  it("compacts prizes", () => {
    expect(prizeShort(67500, "USD")).toBe("$68K");
    expect(prizeShort(150000, "TRY")).toBe("150K TL");
    expect(prizeShort(1_200_000, "USD")).toBe("$1.2M");
    expect(prizeShort(null, null)).toBe("-");
  });
  it("builds soonest-first rows of fixed width and skips closed or undated events", () => {
    const now = at("2026-11-12T09:00:00Z");
    const rows = boardRows(
      [
        meta({ id: "b", name: "Beta", deadline: "2026-11-20", format: "online" }),
        meta({ id: "a", name: "Alpha İzmir", deadline: "2026-11-13", city: "İzmir", prizeAmount: 50000, prizeCurrency: "TRY" }),
        meta({ id: "c", name: "Closed", deadline: "2026-11-01" }),
        meta({ id: "d", name: "No date" }),
      ],
      now,
      5,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0]!.cells.yer.trim()).toBe("İZMİR");
    expect(rows[0]!.cells.odul.trim()).toBe("50K TL");
    expect(rows[0]!.cells.durum.trim()).toBe("KAPANIYOR");
    for (const r of rows) for (const [k, v] of Object.entries(r.cells)) expect(v).toHaveLength(BOARD_COLS[k as keyof typeof BOARD_COLS]);
  });
});

describe("barcode", () => {
  it("is deterministic and stays inside its box", () => {
    expect(barcodePath("kiroween-2026")).toBe(barcodePath("kiroween-2026"));
    expect(barcodePath("kiroween-2026")).not.toBe(barcodePath("codegeist-2026"));
    for (const b of barcode("x", 120)) expect(b.x + b.w).toBeLessThanOrEqual(118);
  });
});
