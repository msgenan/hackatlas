/** Mirror of collector/hackatlas/model.py. Change both together. */

export type Format = "online" | "in_person" | "hybrid";
export type SourceKind = "devpost" | "mlh" | "devfolio" | "techcareer" | "web" | "instagram" | "manual";

export const THEMES = [
  "ai",
  "web3",
  "fintech",
  "health",
  "sustainability",
  "education",
  "games",
  "mobility",
  "security",
  "social-impact",
  "hardware",
  "open",
] as const;
export type Theme = (typeof THEMES)[number];

/** ISO calendar date, YYYY-MM-DD. */
export type DateOnly = string;

export interface Location {
  city: string | null;
  country: string | null;
  venue: string | null;
}
export interface Prize {
  amount: number | null;
  currency: string | null;
  text: string | null;
}
export interface Team {
  min: number | null;
  max: number | null;
}
export interface SourceRef {
  kind: SourceKind;
  url: string;
  seen_at: string;
}

export interface HackEvent {
  id: string;
  name: string;
  organizer: string | null;
  url: string;
  summary: string | null;
  format: Format | null;
  location: Location | null;
  starts_on: DateOnly | null;
  ends_on: DateOnly | null;
  deadline: DateOnly | null;
  prize: Prize | null;
  team: Team | null;
  eligibility: string | null;
  themes: string[];
  sources: SourceRef[];
  confidence: number | null;
  added_at: string;
  updated_at: string;
}

export interface EventFile {
  events: HackEvent[];
}

export interface FxFile {
  as_of: string;
  usd_per_unit: Record<string, number>;
}

/** Compact per-event record the browser needs for filtering, sorting, rail and calendar. */
export interface EventMeta {
  id: string;
  name: string;
  deadline: DateOnly | null;
  starts: DateOnly | null;
  ends: DateOnly | null;
  country: string | null;
  format: Format | null;
  themes: string[];
  hasPrize: boolean;
  prizeUsd: number | null;
  added: string;
  search: string;
  /** For the departures board. */
  city: string | null;
  prizeAmount: number | null;
  prizeCurrency: string | null;
}
