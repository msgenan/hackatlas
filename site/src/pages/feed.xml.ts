import type { APIRoute } from "astro";
import { site } from "../lib/site";
import { absolute } from "../lib/url";
import { formatDay } from "../lib/dates";

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = () => {
  const { upcoming, today } = site();
  const items = [...upcoming].sort((a, b) => (a.e.added_at < b.e.added_at ? 1 : -1)).slice(0, 50);
  const body = items
    .map(({ e }) => {
      const link = absolute(`e/${e.id}/`);
      const bits = [e.summary, e.deadline ? `Son başvuru: ${formatDay(e.deadline, today)}` : null].filter(Boolean).join(" ");
      return `    <item>
      <title>${x(e.name)}</title>
      <link>${x(link)}</link>
      <guid isPermaLink="true">${x(link)}</guid>
      <pubDate>${new Date(e.added_at).toUTCString()}</pubDate>
      <description>${x(bits || e.name)}</description>
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>hackatlas</title>
    <link>${absolute()}</link>
    <description>Türkiye ve dünyadan hackathonlar, yeni eklenenler.</description>
    <language>tr</language>
${body}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
