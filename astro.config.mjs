import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://tsu.wang",
  markdown: {
    shikiConfig: {
      theme: "github-light"
    }
  }
});
