import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildVersion = process.env.GITHUB_SHA || "local";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "version-static-assets",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return html.replace(
            /(\/shared-calendar\/assets\/(?:app\.js|index\.css))(["'])/g,
            `$1?v=${buildVersion}$2`,
          );
        },
      },
    },
  ],
  base: "/shared-calendar/",
  build: {
    rolldownOptions: {
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: "assets/[name][extname]",
        codeSplitting: false,
      },
    },
  },
});
