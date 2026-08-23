import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// This config lives in src/, which is also the Vite root (index.html is here).
//
// The app component (machine-adjustment-log.jsx) sits one level up, outside the
// Vite root. Node-style module resolution walks UP from the importing file, so
// that file cannot find src/node_modules on its own. These aliases point the
// packages it imports straight at this project's own node_modules.
const pkg = (name) => fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // In production (Vercel), VITE_API_URL should be set to the Render backend URL.
  // In development, proxy to localhost:3001.
  const apiTarget = env.VITE_API_URL || "http://localhost:3001";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        react: pkg("react"),
        "react-dom": pkg("react-dom"),
        "react/jsx-runtime": pkg("react/jsx-runtime.js"),
        "react/jsx-dev-runtime": pkg("react/jsx-dev-runtime.js"),
        recharts: pkg("recharts"),
        "lucide-react": pkg("lucide-react"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      open: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
      fs: {
        allow: [".."],
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "recharts", "lucide-react"],
    },
  };
});
