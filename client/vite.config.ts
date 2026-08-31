import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    target: "esnext",
  },
});
