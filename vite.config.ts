import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  /** Destino del proxy solo en `vite` dev: `/api/*` → Node (`server/`). */
  const paymentsProxyTarget = env.PAYMENTS_API_PROXY_TARGET || "http://127.0.0.1:8787";

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("recharts")) return "recharts";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@tanstack/react-query")) return "react-query";
          },
        },
      },
    },
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/api": {
          target: paymentsProxyTarget,
          changeOrigin: true,
        },
      },
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
