/** Internal links, respecting the configured base path. `path` has no leading slash: "e/foo/". */
export function href(path = ""): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/${path}`;
}

export const SITE_URL = "https://msgenan.github.io/hackatlas";
export function absolute(path = ""): string {
  return `${SITE_URL}/${path}`;
}
