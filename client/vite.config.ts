import path from "node:path";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  // Load root .env (client/ is one level down, empty prefix '' loads all variables including PORT)
  const envDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, envDir, "");
  const backendPort = env.PORT || "3000";

  return {
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/ws": {
          target: `ws://localhost:${backendPort}`,
          ws: true,
        },
      },
    },
    build: {
      target: "esnext",
    },
  };
});
