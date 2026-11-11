import type { EventMeta, FxFile, HackEvent } from "./types";
import { countdownStatus, groupOf, type Group, type Status } from "./countdown";
import { formatDay, formatRange } from "./dates";
import { countryName, placeText, prizeText, teamText, themeName } from "./format";
import { fold } from "./filters";
import { prizeUsd } from "./prize";

export interface ViewEvent {
  e: HackEvent;
  status: Status;
  group: Group;
  meta: EventMeta;
  deadlineDate: string | null;
  dates: string | null;
  place: string | null;
  prize: string | null;
  team: string | null;
}

export function toMeta(e: HackEvent, fx: FxFile): EventMeta {
  const usd = prizeUsd(e.prize, fx);
  const search = fold(
    [e.name, e.organizer, e.location?.city, countryName(e.location?.country), ...e.themes.map(themeName)]
      .filter(Boolean)
      .join(" "),
  );
  return {
    id: e.id,
    name: e.name,
    deadline: e.deadline,
    starts: e.starts_on,
    ends: e.ends_on,
    country: e.location?.country?.toUpperCase() ?? null,
    format: e.format,
    themes: e.themes,
    hasPrize: (e.prize?.amount ?? 0) > 0,
    prizeUsd: usd,
    added: e.added_at,
    search,
  };
}

export function toView(e: HackEvent, fx: FxFile, today: string): ViewEvent {
  const d = { deadline: e.deadline, starts: e.starts_on, ends: e.ends_on };
  return {
    e,
    status: countdownStatus(d, today),
    group: groupOf(d, today),
    meta: toMeta(e, fx),
    // Without a deadline the date under the chip is the start date.
    deadlineDate: e.deadline ? formatDay(e.deadline, today) : e.starts_on ? formatDay(e.starts_on, today) : null,
    dates: formatRange(e.starts_on, e.ends_on, today),
    place: placeText(e),
    prize: prizeText(e),
    team: teamText(e.team),
  };
}
