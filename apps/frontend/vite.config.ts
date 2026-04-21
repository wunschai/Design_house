import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:31823",
        changeOrigin: false,
        ws: true,
      },
      "/ws": {
        target: "http://127.0.0.1:31823",
        changeOrigin: false,
        ws: true,
      },
      "/internal": {
        target: "http://127.0.0.1:31823",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
