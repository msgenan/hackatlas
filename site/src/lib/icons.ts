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
