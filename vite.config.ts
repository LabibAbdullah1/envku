import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import obfuscator from "vite-plugin-javascript-obfuscator";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const isProd = command === "build";

  return {
    plugins: [
      react(),
      tailwindcss(),
      isProd
        ? (obfuscator as any)({
            options: {
              compact: true,
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.75,
              numbersToExpressions: true,
              simplify: true,
              stringArrayThreshold: 0.75,
              splitStrings: true,
              splitStringsChunkLength: 10,
              unicodeEscapeSequence: true,
            },
          })
        : null,
    ].filter(Boolean),

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
