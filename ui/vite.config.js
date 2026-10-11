import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export default defineConfig(({ command, mode }) => {
  let session;
  if (command === "serve" && mode !== "test") {
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
    base: "./",
    cacheDir: "../local/vite-cache",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "session",
        transformIndexHtml: (html) =>
          session ? html.replace("__SESSION_TOKEN__", session.token) : html,
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: session ? { "/api": session.origin } : {},
    },
    test: { environment: "jsdom", include: ["src/**/*.test.jsx"] },
    build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  };
});
