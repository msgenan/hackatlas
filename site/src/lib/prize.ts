import type { FxFile, Prize } from "./types";

/** Approximate USD value of a prize, for sorting only. null when unknown. */
export function prizeUsd(p: Prize | null | undefined, fx: FxFile): number | null {
  if (!p || p.amount == null || p.amount <= 0 || !p.currency) return null;
  const rate = fx.usd_per_unit[p.currency.toUpperCase()];
  return rate === undefined ? null : Math.round(p.amount * rate);
}
