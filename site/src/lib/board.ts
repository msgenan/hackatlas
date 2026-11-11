/** Departures board: pure helpers that turn events into fixed-width board rows. */
import type { EventMeta } from "./types";

/** Column widths in cells. Order is the visual order. */
export const BOARD_COLS = { kalan: 8, ad: 22, yer: 9, odul: 7, durum: 9 } as const;
export type BoardCol = keyof typeof BOARD_COLS;
export const BOARD_COL_ORDER: BoardCol[] = ["kalan", "ad", "yer", "odul", "durum"];
export const BOARD_LABELS: Record<BoardCol, string> = {
  kalan: "Kalan",
  ad: "Hackathon",
  yer: "Yer",
  odul: "Ödül",
  durum: "Durum",
};

export type BoardTone = "normal" | "amber" | "red" | "dim";
export interface BoardRow {
  id: string;
  name: string;
  deadline: string;
  label: string; // accessible summary
  cells: Record<BoardCol, string>;
  tone: Record<BoardCol, BoardTone>;
}

/** Characters the board can show; anything else becomes a space. */
const BOARD_CHARS = /[A-Z0-9ÇĞİÖŞÜ .,:&+\-/'$€£!?#@%]/;

export function boardText(s: string, width: number): string {
  const up = s.toLocaleUpperCase("tr-TR").normalize("NFC");
  let out = "";
  for (const ch of up) {
    if (BOARD_CHARS.test(ch)) out += ch;
    else if (ch === "₺") out += "TL";
    else {
      // Letters with other accents (Â, É, Ñ) fall back to their base letter.
      const base = ch.normalize("NFD")[0] ?? " ";
      out += BOARD_CHARS.test(base) ? base : " ";
    }
  }
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > width) out = out.slice(0, width);
  return out.padEnd(width, " ");
}

/** Exclusive end of the deadline day in Turkey (UTC+3, no DST): the next midnight, as epoch ms. */
export function deadlineEnd(deadline: string): number {
  return Date.parse(`${deadline}T00:00:00+03:00`) + 86_400_000;
}

/** "12G 04S" above 48 hours, "37:42:08" below, "KAPANDI" after. Always 8 characters. */
export function remainingText(deadline: string, nowMs: number): string {
  const ms = deadlineEnd(deadline) - nowMs;
  if (ms <= 0) return boardText("KAPANDI", BOARD_COLS.kalan);
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  if (h < 48) {
    const m = Math.floor((totalS % 3600) / 60);
    const sec = totalS % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return boardText(`${d}G ${String(rh).padStart(2, "0")}S`, BOARD_COLS.kalan);
}

export function remainingTone(deadline: string, nowMs: number): BoardTone {
  const h = (deadlineEnd(deadline) - nowMs) / 3_600_000;
  if (h <= 0) return "dim";
  if (h <= 72) return "red";
  if (h <= 168) return "amber";
  return "normal";
}

function statusOf(deadline: string, nowMs: number): [string, BoardTone] {
  const h = (deadlineEnd(deadline) - nowMs) / 3_600_000;
  if (h <= 0) return ["KAPANDI", "dim"];
  if (h <= 24) return ["SON ÇAĞRI", "amber"];
  if (h <= 72) return ["KAPANIYOR", "red"];
  if (h <= 168) return ["BU HAFTA", "amber"];
  return ["AÇIK", "dim"];
}

export function placeShort(m: Pick<EventMeta, "format" | "city" | "country">): string {
  if (m.format === "online") return "ONLINE";
  if (m.city) return m.city;
  if (m.format === "hybrid") return "HİBRİT";
  return m.country ?? "-";
}

export function prizeShort(amount: number | null, currency: string | null): string {
  if (amount == null || amount <= 0) return "-";
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  const compact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(Math.round(n));
  };
  const c = (currency ?? "").toUpperCase();
  if (sym[c]) return `${sym[c]}${compact(amount)}`;
  if (c === "TRY") return `${compact(amount)} TL`;
  return c ? `${compact(amount)} ${c}` : compact(amount);
}

/** Rows for events whose deadline has not passed yet, soonest first. */
export function boardRows(metas: EventMeta[], nowMs: number, limit: number): BoardRow[] {
  return metas
    .filter((m): m is EventMeta & { deadline: string } => !!m.deadline && deadlineEnd(m.deadline) > nowMs)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name, "tr"))
    .slice(0, limit)
    .map((m) => {
      const [durum, durumTone] = statusOf(m.deadline, nowMs);
      const cells: Record<BoardCol, string> = {
        kalan: remainingText(m.deadline, nowMs),
        ad: boardText(m.name, BOARD_COLS.ad),
        yer: boardText(placeShort(m), BOARD_COLS.yer),
        odul: boardText(prizeShort(m.prizeAmount, m.prizeCurrency), BOARD_COLS.odul),
        durum: boardText(durum, BOARD_COLS.durum),
      };
      return {
        id: m.id,
        name: m.name,
        deadline: m.deadline,
        label: `${m.name}: ${durum.toLocaleLowerCase("tr-TR")}, son başvuru ${m.deadline}`,
        cells,
        tone: { kalan: remainingTone(m.deadline, nowMs), ad: "normal", yer: "dim", odul: "normal", durum: durumTone },
      };
    });
}
