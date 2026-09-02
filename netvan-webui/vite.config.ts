import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const base = process.env.VITE_BASE_PATH || "/";
const apiProxyTarget = process.env.NETVAN_API_PROXY_TARGET ?? "http://127.0.0.1:8000";
const basePrefix = base.replace(/\/$/, "");

const apiProxy = {
  target: apiProxyTarget,
  changeOrigin: true,
  ws: true,
};

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      includeAssets: ["vite.svg", "icons/*.png"],
      manifest: {
        name: "Netvan",
        short_name: "Netvan",
        description: "Local network monitor (display-only PWA)",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        display: "standalone",
        start_url: base,
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("echarts") || id.includes("zrender")) return "echarts";
          if (
            id.includes("react-dom") ||
            id.includes("/react/") ||
            id.includes("\\react\\")
          ) {
            return "react-vendor";
          }
          if (id.includes("lucide-react")) return "icons";
        },
      },
    },
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT ?? 8001),
    strictPort: true,
    host: process.env.VITE_DEV_HOST ?? "127.0.0.1",
    allowedHosts: true,
    origin: process.env.VITE_DEV_ORIGIN,
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
      interval: Number(process.env.CHOKIDAR_INTERVAL ?? 400),
    },
    hmr: process.env.VITE_HMR_HOST
      ? {
          host: process.env.VITE_HMR_HOST,
          clientPort: process.env.VITE_HMR_CLIENT_PORT
            ? Number(process.env.VITE_HMR_CLIENT_PORT)
            : undefined,
          protocol: (process.env.VITE_HMR_PROTOCOL as "ws" | "wss" | undefined) ?? "ws",
        }
      : undefined,
    proxy: {
      "/api": apiProxy,
      ...(basePrefix
        ? {
            [`${basePrefix}/api`]: {
              ...apiProxy,
              rewrite: (p: string) => p.replace(new RegExp(`^${basePrefix}`), "") || "/",
            },
          }
        : {}),
    },
  },
});
