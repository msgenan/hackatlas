import type { APIRoute } from "astro";
import { site } from "../../lib/site";
import { absolute } from "../../lib/url";
import { buildCalendar, hasCalendarDates } from "../../lib/ical";

export function getStaticPaths() {
  return site().all.filter((v) => hasCalendarDates(v.e)).map((v) => ({ params: { id: v.e.id }, props: { e: v.e } }));
}
export const GET: APIRoute = ({ props }) => {
  const e = props.e as import("../../lib/types").HackEvent;
  return new Response(buildCalendar(e.name, [e], (x) => absolute(`e/${x.id}/`)), { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
};
