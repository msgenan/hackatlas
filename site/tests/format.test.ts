import { describe, expect, it } from "vitest";
import { accusative, countText, countryName, placeText, prizeText, teamText } from "../src/lib/format";
import { prizeUsd } from "../src/lib/prize";
import { comparator } from "../src/lib/filters";
import type { EventMeta } from "../src/lib/types";

describe("team wording", () => {
  it("covers the shapes", () => {
    expect(teamText({ min: 2, max: 5 })).toBe("2-5 kişi");
    expect(teamText({ min: null, max: 4 })).toBe("En fazla 4 kişi");
    expect(teamText({ min: 1, max: 4 })).toBe("En fazla 4 kişi");
    expect(teamText({ min: 2, max: null })).toBe("En az 2 kişi");
    expect(teamText({ min: 1, max: 1 })).toBe("Bireysel");
    expect(teamText({ min: null, max: 1 })).toBe("Bireysel");
    expect(teamText({ min: 3, max: 3 })).toBe("3 kişi");
    expect(teamText(null)).toBeNull();
    expect(teamText({ min: null, max: null })).toBeNull();
  });
});

describe("place", () => {
  it("formats online, in person and hybrid", () => {
    expect(placeText({ format: "online", location: null })).toBe("Online");
    expect(placeText({ format: "in_person", location: { city: "İzmir", country: "TR", venue: null } })).toBe("İzmir, Türkiye");
    expect(placeText({ format: "in_person", location: { city: "Berlin", country: "DE", venue: null } })).toBe("Berlin, Almanya");
    expect(placeText({ format: "hybrid", location: { city: "Ankara", country: "TR", venue: null } })).toBe("Hibrit: Ankara");
    expect(placeText({ format: null, location: null })).toBeNull();
    expect(placeText({ format: "in_person", location: { city: null, country: null, venue: "Moscone Center" } })).toBe("Moscone Center");
    expect(placeText({ format: "in_person", location: null })).toBe("Yerinde");
    expect(placeText({ format: "hybrid", location: null })).toBe("Hibrit");
  });
  it("names countries in Turkish", () => {
    expect(countryName("US")).toBe("ABD");
    expect(countryName("gb")).toBe("Birleşik Krallık");
    expect(countryName("FR")).toBe("Fransa");
  });
});

describe("prize", () => {
  const fx = { as_of: "x", usd_per_unit: { USD: 1, TRY: 0.024, EUR: 1.08 } };
  it("converts for sorting only", () => {
    expect(prizeUsd({ amount: 250000, currency: "TRY", text: null }, fx)).toBe(6000);
    expect(prizeUsd({ amount: 15000, currency: "EUR", text: null }, fx)).toBe(16200);
    expect(prizeUsd({ amount: 10, currency: "XYZ", text: null }, fx)).toBeNull();
    expect(prizeUsd({ amount: null, currency: null, text: "later" }, fx)).toBeNull();
  });
  it("shows the original text", () => {
    expect(prizeText({ prize: { amount: 1, currency: "TRY", text: "50.000 TL + staj" } })).toBe("50.000 TL + staj");
    expect(prizeText({ prize: { amount: 1000, currency: "TRY", text: null } })).toBe("1.000 TRY");
    expect(prizeText({ prize: null })).toBeNull();
  });
  const m = (id: string, prizeUsd: number | null): EventMeta => ({
    id, name: id, deadline: null, starts: null, ends: null, country: "TR", format: null, themes: [],
    hasPrize: prizeUsd !== null, prizeUsd, added: "", search: "", city: null, prizeAmount: null, prizeCurrency: null,
  });
  it("sorts by prize descending with unknown last", () => {
    const list = [m("a", null), m("b", 100), m("c", 6000), m("d", 16200)];
    expect(list.sort(comparator("odul")).map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("counts", () => {
  it("adds the right suffix", () => {
    expect(countText(124, 124)).toBe("124 hackathon");
    expect(countText(124, 18)).toBe("124 sonuçtan 18'i");
    expect(countText(124, 3)).toBe("124 sonuçtan 3'ü");
    expect(countText(124, 6)).toBe("124 sonuçtan 6'sı");
    expect(countText(124, 40)).toBe("124 sonuçtan 40'ı");
    expect(countText(124, 0)).toBe("124 sonuçtan 0'ı");
    expect(accusative(100)).toBe("'ü");
    expect(accusative(2)).toBe("'si");
  });
});
