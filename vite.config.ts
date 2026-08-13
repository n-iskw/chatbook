import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Claude Code keeps its agent worktrees under `.claude/worktrees/`, which are
// whole checkouts of this repo. Without this, `vp check` and `pnpm test` in the
// main clone pick those up and report failures that belong to another branch —
// or collect their Playwright and workers-pool specs into the jsdom run.
const AGENT_WORKTREES = ".claude/**";

// Playwright starts the dev server with this set (see e2e/playwright.config.ts)
// so the E2E run gets a D1 and an R2 of its own, wiped before every run. Left
// on the default `.wrangler/state`, its uploads would pile up in the store the
// dev server reads and show up on the shelf while reading.
const e2eStatePath = process.env.E2E_PERSIST_PATH;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    !process.env.VITEST &&
      cloudflare(e2eStatePath ? { persistState: { path: e2eStatePath } } : undefined),
  ],
  fmt: {
    ignorePatterns: [AGENT_WORKTREES],
  },
  lint: {
    ignorePatterns: [AGENT_WORKTREES],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    // Naming any plugin replaces the base set, so the three oxlint turns on by
    // default have to be listed alongside the one being added
    plugins: ["unicorn", "typescript", "oxc", "vitest"],
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
      // 構造体の全体比較は toStrictEqual に揃える。toEqual は値が undefined の
      // 余剰キー・配列の穴・prototype の違いを見逃すので、欠落・余剰・変更された
      // フィールドを検出するという全体比較の目的に届かない。
      "vitest/prefer-strict-equal": "error",
      // vitest プラグインを入れると道連れで有効になるが、これは上のルールとは
      // 無関係な別の話なので切っておく。入れるなら既存 16 箇所の是非から議論する。
      "vitest/require-mock-type-parameters": "off",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ holds Playwright specs, which must not be collected by vitest
    exclude: ["**/node_modules/**", "**/dist/**", "test/worker/**", "e2e/**", AGENT_WORKTREES],
  },
});
