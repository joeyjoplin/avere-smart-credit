import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/score": { target: "http://localhost:8000", changeOrigin: true },
      "/oracle-pubkey": { target: "http://localhost:8000", changeOrigin: true },
      "/passkey": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "process", "stream", "util", "crypto"],
      globals: { Buffer: true, process: true, global: true },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
