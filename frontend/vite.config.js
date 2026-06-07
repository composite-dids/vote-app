import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://<user>.github.io/vote-app/ , so assets live under /vote-app/.
// Override with VITE_BASE if you fork to a different repo name.
export default defineConfig({
  base: process.env.VITE_BASE || "/vote-app/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
