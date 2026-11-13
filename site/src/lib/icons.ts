/** Lucide icons, inlined at build time (Node only). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require_ = createRequire(import.meta.url);
let root: string | null = null;
const cache = new Map<string, string>();

export function iconSvg(name: string, size = 16): string {
  const key = `${name}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  root ??= resolve(dirname(require_.resolve("lucide-static/package.json")), "icons");
  const src = readFileSync(resolve(root, `${name}.svg`), "utf8");
  const inner = src.replace(/<svg[^>]*>/, "").replace("</svg>", "").replace(/<!--[\s\S]*?-->/g, "").trim();
  const svg = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  cache.set(key, svg);
  return svg;
}

/** Every icon the site uses, once per page as <symbol>s; Icon.astro references them with <use>. */
export const SPRITE_ICONS = [
  "anchor", "bookmark", "bookmark-check", "calendar-plus", "chevron-left", "chevron-right", "compass", "external-link",
  "link", "locate-fixed", "plus", "search", "x", "globe", "shuffle", "map-pin", "monitor", "sun", "moon",
] as const;

export function iconSprite(): string {
  const symbols = SPRITE_ICONS.map((name) => {
    const inner = iconSvg(name).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    return `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${symbols}</svg>`;
}
