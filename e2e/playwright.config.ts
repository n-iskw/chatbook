import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// worktree ごとに専用ポートを割り当てる。5173 固定だと別クローンの dev サーバーに
// 誤接続したまま「成功」しうるため、リポジトリのパスから決定的に導出する。
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pathHash = createHash("sha256").update(projectRoot).digest().readUInt16BE(0);
const port = Number(process.env.E2E_PORT ?? 5175 + (pathHash % 500));

// D1 と R2 の置き場所。dev サーバーの既定 (`.wrangler/state`) と分けることで、
// テストがアップロードした本が読書中の本棚に現れなくなる。実行のたびに消すので
// 前回の残骸に依存したテストは書けない。wrangler の `--persist-to` も
// @cloudflare/vite-plugin の `persistState` も、渡したパスの下に `v3` を作る。
const statePath = ".wrangler/e2e-state";

export default defineConfig({
  testDir: "./",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
  },
  // Which layout the reader is in comes from the width of the window, so the
  // two of them are two runs of the suite rather than two assertions in one.
  // `chatbook.spec.ts` is written against the panes and keeps the default
  // desktop window; `mobile.spec.ts` is written against the single column.
  projects: [
    { name: "desktop", testMatch: /chatbook\.spec\.ts/ },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      // A phone's window, and the fingers that come with it: the viewer binds
      // its gestures only where the browser reports touch.
      //
      // Spelled out rather than taken from `devices["iPhone 14"]`, which would
      // pull in WebKit and a second browser to install. What a phone-shaped
      // Chromium can show is the layout and the gestures; how iOS itself
      // behaves — the long press, the platform's selection menu, the keyboard
      // over the sheet — no headless browser answers for, and those are checked
      // by hand on a device.
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      `rm -rf ${statePath} && wrangler d1 migrations apply chatbook-db --local --persist-to ${statePath}` +
      ` && vp dev --port ${port} --strictPort`,
    port,
    timeout: 120000,
    reuseExistingServer: false,
    cwd: "../",
    env: { E2E_PERSIST_PATH: statePath },
  },
});
