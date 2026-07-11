# CLAUDE.md

React 19 (SPA) + Hono (API Worker) + Cloudflare D1 (Drizzle ORM) を単一の Cloudflare Workers プロジェクトにまとめたフルスタックテンプレート。`@cloudflare/vite-plugin` で SPA と Worker を同一 `vp dev` で開発する。詳細は README.md を参照。

## 新規プロジェクトとして使い始めるとき

このリポジトリから `gh repo create --template` で clone した直後に必ず行う:

```bash
bash scripts/rename-project.sh <project-name>
wrangler d1 create <project-name>-db   # database_id を wrangler.jsonc に反映
```

## コマンド

`vp`（Vite+）に統一。生の `pnpm` / `vite` / `vitest` を直接叩かない。

- `vp install` — 依存インストール（`postinstall` で `worker-configuration.d.ts` も生成・フォーマットされる。ただし node_modules 既存時は走らないことがある）
- `vp dev` — SPA + Worker を同時起動
- `vp test` — フロントエンドテスト（jsdom）
- `vp exec vitest run -c vitest.workers.config.ts` — バックエンドテスト（`@cloudflare/vitest-pool-workers`）
- `vp check` / `vp check --fix` — 型チェック + lint + フォーマット
- `vp build` — `dist/client`（SPA）+ `dist/<name>`（Worker）をビルド
- `vp exec wrangler types` — `wrangler.jsonc` の bindings/`main` から `Env` 型を再生成

`git push` 時は lefthook の `pre-push` フックが `vp check` + `vp build` を自動実行する（`lefthook.yml`、`vp install` で自動セットアップ）。失敗すると push はブロックされる。

## 守るべき規約

- **`useEffect` は import 禁止**（`vite.config.ts` の `no-restricted-imports` で lint エラー）。データ取得は `useSWR` を使う。他の用途でどうしても必要なら oxlint-disable コメントで理由を明記する
- ディレクトリ構成: `src/front`（SPA）/ `src/server`（Worker、`modules/{domain,usecase,adapter}` 相当のレイヤ分離）/ `src/shared`（両者共有の型）
- フロント/バックエンドのテストは別ランナー（`vite.config.ts` の jsdom テストと `vitest.workers.config.ts` の Workers pool テストは同一プロセスで共存できない。`vite.config.ts` は `process.env.VITEST` のとき `cloudflare()` プラグインを無効化している）
- `worker-configuration.d.ts` は commit 済みの生成物。**bindings（`d1_databases` / `vars` 等）か `main` を変更したときだけ** `vp exec wrangler types` で再生成して commit し直す（`name` 等それ以外のフィールドは型に影響しない）。CI は再生成せず commit された内容をそのまま使う（忘れると `vp check` が型エラーで検出する）
- `wrangler.jsonc` の `assets.directory` は必ず `./dist/client` を指す。トップレベル `./dist/` を指定すると Worker ビルド成果物（ローカルシークレットを含む `.dev.vars` 等）まで静的配信対象に入ってしまう

## 認証（Cognito）を使う場合

- User Pool / Client は `terraform/` で管理（ローカル・本番共通の Terraform 構成。`local.tfvars` で cognito-local を対象にする）
- ローカルは `docker compose up -d` → `vp run cognito:setup` → `.dev.vars` / `.env.local` が生成される
- **cognito-local は `USER_SRP_AUTH` 未実装**。`/login` 画面（`amazon-cognito-identity-js` の SRP 認証）はローカルではサインインできない。サーバー側だけ確認したい場合は `USER_PASSWORD_AUTH` で直接トークンを取得する（README「認証」節に curl 例あり）
- 認証が不要なプロジェクトでは README「認証が不要な場合」に列挙されたファイル・依存を削除する

## テスト・実装方針

- TDD（RED→GREEN→REFACTOR）で実装する
- 外部ネットワーク呼び出し（JWKS 取得等）は関数注入で DI し、テストはオフラインで完結させる（`src/server/auth/verifyAccessToken.ts` の `getKey` 引数を参照）
