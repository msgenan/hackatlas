import { describe, expect, it } from "vitest";
import { isHttpUrl, validateEvents } from "../src/lib/data";

const base = {
  id: "x-2026", name: "X", url: "https://ok.example", added_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z",
  sources: [{ kind: "web", url: "https://ok.example/a", seen_at: "2026-11-12T00:00:00Z" }],
};

describe("data safety", () => {
  it("accepts only absolute http(s) URLs", () => {
    expect(isHttpUrl("https://a.example")).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative", "", null]) expect(isHttpUrl(bad)).toBe(false);
  });
  it("refuses an event or source with a script URL", () => {
    expect(() => validateEvents({ events: [{ ...base, url: "javascript:alert(1)" }] })).toThrow(/http\(s\)/);
    const badSource = { ...base, sources: [{ kind: "web", url: "javascript:x", seen_at: "2026-11-12T00:00:00Z" }] };
    expect(() => validateEvents({ events: [badSource] })).toThrow(/http\(s\)/);
    expect(validateEvents({ events: [base] })).toHaveLength(1);
  });
});
