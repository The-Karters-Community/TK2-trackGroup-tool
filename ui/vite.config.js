import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export default defineConfig(({ command, mode }) => {
  const web = mode === "web";
  let session;
  if (command === "serve" && mode !== "test" && !web) {
    session = JSON.parse(
      readFileSync(
        resolve(
          process.env.LOCALAPPDATA || homedir(),
          "TK2 Track Groups/session.json",
        ),
        "utf8",
      ),
    );
  }
  return {
    root: "ui",
    base: web ? "/TK2-trackGroup-tool/" : "./",
    resolve: {
      alias: {
        "@entry-app": resolve(web ? "ui/src/web/WebApp.jsx" : "ui/src/App.jsx"),
      },
    },
    cacheDir: "../local/vite-cache",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "session",
        transformIndexHtml: (html) =>
          web
            ? html
                .replace(/\s*<meta name="tk2-session"[^>]*>/, "")
                .replace(
                  "<title>TK2 Garage</title>",
                  '<title>TK2 Garage · Track groups & presets</title><meta name="description" content="Manage The Karters 2 track groups and customization presets locally in your browser. No executable or profile upload required." />',
                )
                .replace(
                  "</head>",
                  command === "build"
                    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://images.steamusercontent.com https://steamuserimages-a.akamaihd.net; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"></head>`
                    : "</head>",
                )
            : session
              ? html.replace("__SESSION_TOKEN__", session.token)
              : html,
      },
    ],
    server: {
      host: "127.0.0.1",
      port: web ? 5174 : 5173,
      strictPort: true,
      proxy: session ? { "/api": session.origin } : {},
    },
    test: { environment: "jsdom", include: ["src/**/*.test.{js,jsx}"] },
    build: {
      outDir: web ? "web-dist" : "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
