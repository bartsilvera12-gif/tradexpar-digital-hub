import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/** Resuelve `og:image` / `twitter:image` con dominio de producción o ruta relativa. */
function tradexparOgImagePlugin(baseUrlFromEnv: string): Plugin {
  const base = baseUrlFromEnv.trim().replace(/\/+$/, "");
  const imageUrl = base
    ? `${base}/images/tradexpar-promo-banner.png`
    : "/images/tradexpar-promo-banner.png";
  return {
    name: "tradexpar-og-image",
    transformIndexHtml(html) {
      return html.replaceAll("__VITE_OG_IMAGE__", imageUrl);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicSite = env.VITE_PUBLIC_SITE_URL || "";
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
    plugins: [react(), tradexparOgImagePlugin(publicSite)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
