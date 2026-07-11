# fullstack-worker-template

React 19 + Vite + Hono + Cloudflare D1 (Drizzle ORM) を単一の Cloudflare Workers プロジェクトにまとめたフルスタックテンプレート。SPA (`src/client`) と API Worker (`src/server`) を `@cloudflare/vite-plugin` で同一プロジェクトとして開発・デプロイする。

`skanehira/demo-site-template`（フロントオンリー静的 SPA 用）のバックエンド版。DB・決済・外部 ID 連携が必要なフルスタックプロジェクトはこちらを起点にする。

## 技術構成

| 領域                         | 技術                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| フロントエンド               | React 19 / React Router v7 系 (`createHashRouter`) / Tailwind CSS v4                                                                           |
| バックエンド                 | Hono / Cloudflare D1 / Drizzle ORM                                                                                                             |
| ビルド・ローカル開発         | Vite 8 + `@cloudflare/vite-plugin`（SPA と Worker を単一 `vp dev` で同時起動）                                                                 |
| 言語                         | TypeScript 7.0.2                                                                                                                               |
| ツールチェーン               | [`vp` (Vite+)](https://vite.plus) — `vp install` / `vp dev` / `vp test` / `vp check` / `vp build` に統合                                       |
| テスト                       | フロント: Vitest (jsdom) 経由 `vp test`。バックエンド: `@cloudflare/vitest-pool-workers` 経由 `vp exec vitest run -c vitest.workers.config.ts` |
| 事前同梱の外部連携ライブラリ | `stripe` / `@stripe/stripe-js` / `@stripe/react-stripe-js` / `jose` / `amazon-cognito-identity-js` / `zod` / `neverthrow` / `ulid`             |
| CI/CD                        | GitHub Actions（`.github/workflows/ci.yml` + `deploy.yml`）、`vp` ベース                                                                       |

## 使い方

### 1. テンプレートから新規プロジェクトを作成

```bash
gh repo create <project-name> \
  --template skanehira/fullstack-worker-template \
  --private --clone
cd <project-name>
```

### 2. プレースホルダ置換

`__PROJECT_NAME__` と `__COMPATIBILITY_DATE__` を実際の値に置き換える。

```bash
PROJECT_NAME="<project-name>"
COMPAT_DATE="$(date +%Y-%m-%d)"

sed -i.bak "s/__PROJECT_NAME__/${PROJECT_NAME}/g" \
  package.json wrangler.jsonc index.html .github/workflows/deploy.yml
sed -i.bak "s/__COMPATIBILITY_DATE__/${COMPAT_DATE}/g" wrangler.jsonc
rm -f package.json.bak wrangler.jsonc.bak index.html.bak .github/workflows/deploy.yml.bak
```

`wrangler.jsonc` の `d1_databases[0].database_id` は `wrangler d1 create <db-name>` で発行した実際の ID に置き換える（`__D1_DATABASE_ID__` のまま起動すると Worker types 生成やビルドが失敗する）。

### 3. 依存インストール + 動作確認

```bash
vp install --frozen-lockfile
vp exec wrangler types    # wrangler.jsonc のバインディングから Env 型を生成
vp test                   # フロントエンドテスト
vp exec vitest run -c vitest.workers.config.ts   # バックエンドテスト
vp check                  # 型チェック + lint + フォーマット確認
vp build                  # dist/ にクライアント + Worker をビルド
vp dev                    # http://localhost:5173 で起動、/api/health が D1 疎通を返す
```

すべてグリーンになればセットアップ完了。

## ディレクトリ構成

```
src/
├── client/          # React SPA（features/ で機能ごとにコロケーション推奨）
│   ├── pages/
│   ├── main.tsx
│   └── routes.tsx
├── server/           # Hono Worker（main エントリ）
│   ├── index.ts
│   ├── db/schema.ts  # Drizzle スキーマ
│   └── routes/
└── shared/            # client/server 共有の型・スキーマ

test/worker/           # @cloudflare/vitest-pool-workers によるバックエンドテスト
migrations/             # D1 マイグレーション SQL（drizzle-kit generate の出力先）
```

## フロント/バックエンドのテストを分けている理由

`@cloudflare/vite-plugin`（Worker 用の Vite environment）と Vitest の jsdom environment は同一 `vite.config.ts` 内で共存できない（`resolve.external` の Node 組み込みモジュール一覧が Worker environment の検証に引っかかる）。そのため `vite.config.ts` は `process.env.VITEST` が立っているときだけ `cloudflare()` プラグインを無効化し、バックエンドの Workers テストは `vitest.workers.config.ts`（`@cloudflare/vitest-pool-workers` の `cloudflareTest` プラグインを使用）という別ファイルに分離している。

## このテンプレート自体の CI について

このリポジトリ自体は `__PROJECT_NAME__` 等のプレースホルダを含んだままのため、`ci.yml`（`vp build` が `wrangler.jsonc` の検証に失敗する）と `deploy.yml`（`CLOUDFLARE_API_TOKEN` 等の Secrets 未設定）はこのテンプレートリポジトリ自身の Actions では失敗する想定。テンプレは実運用のデプロイ対象ではなく、`gh repo create --template` で複製してプレースホルダを置換した後のプロジェクトで green になることを意図している。

## 各プロジェクト側で追加する設定（テンプレートには含まれない）

- R2 バインディング・Cron Triggers（`wrangler.jsonc` にプロジェクトごとの要件に応じて追記）
- 外部 ID SaaS（Cognito 等）のローカルエミュレータ（`compose.yaml` 等）
- ドメイン固有のスキーマ・API・UI
