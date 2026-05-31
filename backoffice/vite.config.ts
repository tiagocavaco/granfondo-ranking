import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import {
  handleAdminRequest,
  serveCandidateFile,
} from "./server/admin-middleware.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "backoffice-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? "";

          if (serveCandidateFile(url, res, resolve(__dirname))) return;

          if (url.startsWith("/api/admin/")) {
            handleAdminRequest(req, res).catch((err: unknown) => {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : "Internal error",
                }),
              );
            });
            return;
          }

          next();
        });
      },
    },
  ],
  optimizeDeps: {
    include: ["sql.js"],
  },
});
