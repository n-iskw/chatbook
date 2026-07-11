import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // vitest (jsdom) と @cloudflare/vite-plugin の Worker environment は競合するため、
  // テスト実行時 (process.env.VITEST) は cloudflare() を無効化する。
  // バックエンド (Workers) のテストは vitest.workers.config.ts を別途使う。
  plugins: [react(), tailwindcss(), !process.env.VITEST && cloudflare()],
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "test/worker/**"],
  },
});
