import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, fold, isFiltered, matches, parseFilters, serializeFilters, type Filters } from "../src/lib/filters";
import type { EventMeta } from "../src/lib/types";

describe("url filters", () => {
  it("round-trips every field", () => {
    const f: Filters = { q: "yapay zeka", bolge: "tumu", format: ["online", "hybrid"], konu: ["ai", "web3"], odul: true, sirala: "odul" };
    const qs = serializeFilters(f).toString();
    expect(parseFilters(new URLSearchParams(qs))).toEqual(f);
  });
  it("omits defaults and keeps unrelated params", () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
    const base = new URLSearchParams("ay=2026-12&bolge=tr");
    expect(serializeFilters({ ...DEFAULT_FILTERS, odul: true }, base).toString()).toBe("ay=2026-12&odul=1");
  });
  it("drops unknown values", () => {
    const f = parseFilters(new URLSearchParams("bolge=mars&format=online,foo&konu=ai,zzz&sirala=x"));
    expect(f).toEqual({ ...DEFAULT_FILTERS, format: ["online"], konu: ["ai"] });
    expect(isFiltered(f)).toBe(true);
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
  });
});

describe("matching", () => {
  const m: EventMeta = {
    id: "x", name: "Örnek Yapay Zekâ Hackathonu", deadline: null, starts: null, ends: null, country: "TR", format: "online",
    themes: ["ai"], hasPrize: true, prizeUsd: 1, added: "", search: fold("Örnek Yapay Zekâ Hackathonu İstanbul Türkiye"), city: "İstanbul", prizeAmount: 1, prizeCurrency: "USD",
  };
  it("folds Turkish letters in search", () => {
    expect(fold("İSTANBUL ışık")).toBe("istanbul isik");
    expect(matches(m, { ...DEFAULT_FILTERS, q: "yapay zeka" })).toBe(true);
    expect(matches(m, { ...DEFAULT_FILTERS, q: "ISTANBUL" })).toBe(true);
    expect(matches(m, { ...DEFAULT_FILTERS, q: "berlin" })).toBe(false);
  });
  it("applies region, format, theme and prize", () => {
    const us = { ...m, country: "US", format: "in_person" as const };
    expect(matches(us, DEFAULT_FILTERS)).toBe(false);
    expect(matches({ ...us, format: "online" }, DEFAULT_FILTERS)).toBe(true);
    expect(matches({ ...us, format: "hybrid" }, DEFAULT_FILTERS)).toBe(true);
    expect(matches({ ...us, country: null }, DEFAULT_FILTERS)).toBe(false);
    expect(matches({ ...m, country: "TR", format: "in_person" }, DEFAULT_FILTERS)).toBe(true);
    expect(matches({ ...m, format: "online" }, { ...DEFAULT_FILTERS, bolge: "tr" })).toBe(true);
    expect(matches({ ...us, format: "online" }, { ...DEFAULT_FILTERS, bolge: "tr" })).toBe(false);
    expect(matches(us, { ...DEFAULT_FILTERS, bolge: "tumu" })).toBe(true);
    expect(matches(m, { ...DEFAULT_FILTERS, format: ["hybrid"] })).toBe(false);
    expect(matches(m, { ...DEFAULT_FILTERS, format: ["hybrid", "online"] })).toBe(true);
    expect(matches(m, { ...DEFAULT_FILTERS, konu: ["web3"] })).toBe(false);
    expect(matches(m, { ...DEFAULT_FILTERS, odul: true })).toBe(true);
  });
});
