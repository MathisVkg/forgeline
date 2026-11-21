// @ts-check
import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "../package.json";

export default defineConfig(({ mode }) => {
  // Build commit for Settings > About: GITHUB_SHA in CI / Docker, "dev" locally.
  // loadEnv with an empty prefix also returns variables from the environment.
  const sha = loadEnv(mode, ".", "").GITHUB_SHA ?? "";
  return {
    plugins: [svelte()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_SHA__: JSON.stringify(/^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : "dev"),
    },
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
  };
});
