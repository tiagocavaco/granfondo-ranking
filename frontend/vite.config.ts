import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // base: "/granfondo-ranking/", // uncomment when deploying to GitHub Pages at a sub-path
});
