import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server proxies API to the local backend. If you change the backend
// `PORT`, set the same in `web/.env` as VITE_DEV_API_PORT (optional).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.VITE_DEV_API_PORT || "3000";
  const target = `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      /** If 5173 is taken, fail fast instead of switching to 5174 (localStorage is per origin). */
      strictPort: true,
      // Long LLM calls can exceed default proxy idle limits; avoid ECONNRESET → "Failed to fetch"
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          timeout: 300_000,
          proxyTimeout: 300_000,
        },
        "/health": {
          target,
          changeOrigin: true,
          timeout: 300_000,
          proxyTimeout: 300_000,
        },
      },
    },
  };
});
