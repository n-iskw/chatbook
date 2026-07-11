import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // vitest (jsdom) と @cloudflare/vite-plugin の Worker environment は競合するため、
  // テスト実行時 (process.env.VITEST) は cloudflare() を無効化する。
  // バックエンド (Workers) のテストは vitest.workers.config.ts を別途使う。
  plugins: [react(), tailwindcss(), !process.env.VITEST && cloudflare()],
  // amazon-cognito-identity-js は Node の `global` を参照するが、ブラウザには存在しないためエイリアスする。
  define: {
    global: "globalThis",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffect"],
              message:
                "useEffect は誤用が多いため禁止。どうしても必要な場合は該当行に oxlint-disable コメントを付けて理由を明記する。",
            },
          ],
        },
      ],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "test/worker/**"],
  },
});
