import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  plugins: [react()],
  base: isGitHubPagesBuild ? "/AUDIAR/" : "/",
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
});
