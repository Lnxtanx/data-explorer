import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: false,
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
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        'lucide-react',
        'clsx',
        'tailwind-merge',
        'sonner',
        'next-themes',
      ],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: true,
      port: 8000,
      proxy: {
        "/api": {
          target: env.VITE_PROXY_TARGET || "http://localhost:3000",
          changeOrigin: true,
          ws: true, // voice session WS (/api/voice/session) + agent data channel
        },
        "/ai-api": {
          target: "http://localhost:8001",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ai-api/, ""),
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-')) return 'vendor-charts';
            if (id.includes('/mermaid/')) return 'vendor-mermaid';
            if (id.includes('/jspdf')) return 'vendor-reports';
            if (id.includes('node_modules/katex/')) return 'vendor-katex';
            if (id.includes('node_modules/xlsx/')) return 'vendor-xlsx';
            if (id.includes('node_modules/framer-motion/')) return 'vendor-motion';
            if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom/')) return 'vendor-react';
            if (id.includes('node_modules/@radix-ui/')) return 'vendor-radix';
            if (id.includes('node_modules/@tanstack/')) return 'vendor-query';
          },
        },
      },
    },
  };
});
