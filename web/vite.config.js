// @ts-check
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/data": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Never inline assets as data: URIs (small font subsets would be blocked
    // by the CSP font-src 'self').
    assetsInlineLimit: 0,
  },
});
