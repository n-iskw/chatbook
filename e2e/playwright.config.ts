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
  // One at a time, because every spec shares the store above. The fixture is
  // the same file in all three, so it opens as the same book, and each spec
  // clears that book's highlights before it starts — run two at once and one
  // deletes the highlight the other is in the middle of asserting on.
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
  },
  // Two things decide what the reader does: the width of the window picks the
  // layout, and the kind of pointer picks the input path. Neither can be mixed
  // into one run, so the combinations that matter get a run each.
  // `chatbook.spec.ts` is written against the panes with a mouse and keeps the
  // default desktop window; `mobile.spec.ts` against the single column with a
  // finger; `tablet.spec.ts` against the panes with a finger.
  projects: [
    { name: "desktop", testMatch: /chatbook\.spec\.ts/ },
    {
      name: "tablet",
      testMatch: /tablet\.spec\.ts/,
      // Wide enough for the two panes, and touched rather than pointed at.
      // This is the combination the reader was written without: every gesture
      // used to be gated on the window being narrow, so a tablet fell through
      // to the mouse-only paths and could not select a passage at all.
      use: { viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
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
