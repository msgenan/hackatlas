import type { APIRoute } from "astro";
import { site } from "../lib/site";

export const GET: APIRoute = () => {
  const { upcoming, updated } = site();
  return new Response(JSON.stringify({ updated_at: updated, events: upcoming.map((v) => v.e) }, null, 2) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
