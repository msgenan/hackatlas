import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://msgenan.github.io",
  base: "/hackatlas",
  trailingSlash: "always",
  output: "static",
  outDir: "./dist",
  build: { format: "directory" },
  devToolbar: { enabled: false },
});
