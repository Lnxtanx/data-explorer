import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Data Explorer | Schema Weaver',
        short_name: 'Data Explorer',
        description: 'PostgreSQL data explorer and SQL workbench inside Schema Weaver with exports, column statistics, and AI chat.',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'resona.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'resona.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8000,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
      },
      "/ai-api": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-api/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy charting + D3 ecosystem — only loaded when AI panel is opened
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-')) {
            return 'vendor-charts';
          }
          // Diagram rendering — only loaded in AI artifact views
          if (id.includes('/mermaid/')) {
            return 'vendor-mermaid';
          }
          // Report generation — only loaded when user exports
          if (id.includes('/pptxgenjs/') || id.includes('/jspdf')) {
            return 'vendor-reports';
          }
          // Stable React core — long-lived browser cache
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          // Radix UI primitives
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix';
          }
          // TanStack Query
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-query';
          }
        },
      },
    },
  },
});
