import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `wrangler dev` defaults to :8787. Adjust here if you change that.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
