/** Build-time data loading (Node only). */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventFile, FxFile, HackEvent } from "./types";
import { isDateOnly, todayISO } from "./dates";

function dataDir(): string {
  for (const rel of ["../data", "data", "../../data"]) {
    const p = resolve(process.cwd(), rel);
    if (existsSync(resolve(p, "fx.json"))) return p;
  }
  throw new Error("Could not find the data/ directory (looked next to and above the site folder).");
}

function readJson(file: string, explicit?: string): unknown {
  const path = explicit ? resolve(process.cwd(), explicit) : resolve(dataDir(), file);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNullableStr = (v: unknown) => v === null || v === undefined || typeof v === "string";

/** Light shape check with a clear message; the collector does the strict validation. */
export function validateEvents(raw: unknown, source = "events file"): HackEvent[] {
  const fail = (msg: string): never => {
    throw new Error(`${source} is broken: ${msg}`);
  };
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as EventFile).events)) {
    return fail('expected an object like {"events": [...]}');
  }
  const seen = new Set<string>();
  return (raw as EventFile).events.map((e, i) => {
    const at = `events[${i}]${isStr((e as HackEvent)?.id) ? ` (${(e as HackEvent).id})` : ""}`;
    if (typeof e !== "object" || e === null) return fail(`${at} is not an object`);
    if (!isStr(e.id) || !/^[a-z0-9-]+$/.test(e.id)) fail(`${at}: id must be a lowercase slug`);
    if (seen.has(e.id)) fail(`${at}: duplicate id`);
    seen.add(e.id);
    if (!isStr(e.name)) fail(`${at}: name is required`);
    if (!isStr(e.url)) fail(`${at}: url is required`);
    for (const k of ["starts_on", "ends_on", "deadline"] as const) {
      if (e[k] != null && !isDateOnly(e[k])) fail(`${at}: ${k} must be YYYY-MM-DD`);
    }
    if (!Array.isArray(e.sources) || e.sources.length === 0) fail(`${at}: sources needs at least one entry`);
    if (!isNullableStr(e.organizer) || !isNullableStr(e.summary) || !isNullableStr(e.eligibility)) fail(`${at}: text fields must be strings`);
    if (!Array.isArray(e.themes ?? [])) fail(`${at}: themes must be a list`);
    if (!isStr(e.added_at) || !isStr(e.updated_at)) fail(`${at}: added_at and updated_at are required`);
    return {
      organizer: null,
      summary: null,
      format: null,
      location: null,
      starts_on: null,
      ends_on: null,
      deadline: null,
      prize: null,
      team: null,
      eligibility: null,
      confidence: null,
      ...(e as Partial<HackEvent>),
      themes: e.themes ?? [],
    } as HackEvent;
  });
}

export function loadEvents(): HackEvent[] {
  // Dev only: HACKATLAS_DATA=../data/pending.json previews real-shaped data.
  const override = process.env.HACKATLAS_DATA;
  if (override) return validateEvents(readJson("", override), override);
  const sample = process.env.HACKATLAS_SAMPLE === "1";
  const file = sample ? "sample-events.json" : "events.json";
  return validateEvents(readJson(file), `data/${file}`);
}

export function loadFx(): FxFile {
  const raw = readJson("fx.json") as FxFile;
  if (!raw || typeof raw.usd_per_unit !== "object") throw new Error("data/fx.json is broken: usd_per_unit missing");
  return raw;
}

export function buildToday(): string {
  const t = process.env.HACKATLAS_TODAY;
  if (t) {
    if (!isDateOnly(t)) throw new Error(`HACKATLAS_TODAY must be YYYY-MM-DD, got "${t}"`);
    return t;
  }
  return todayISO();
}
