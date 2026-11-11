import type { APIRoute } from "astro";
import { site } from "../lib/site";
import { absolute } from "../lib/url";
import { buildCalendar } from "../lib/ical";

export const GET: APIRoute = () => {
  const events = site().upcoming.map((v) => v.e);
  return new Response(buildCalendar("hackatlas: hackathon takvimi", events, (e) => absolute(`e/${e.id}/`)), {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
};
