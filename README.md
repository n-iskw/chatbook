# fullstack-worker-template

React 19 + Vite + Hono + Cloudflare D1 (Drizzle ORM) を単一の Cloudflare Workers プロジェクトにまとめたフルスタックテンプレート。SPA (`src/front`) と API Worker (`src/server`) を `@cloudflare/vite-plugin` で同一プロジェクトとして開発・デプロイする。

`skanehira/demo-site-template`（フロントオンリー静的 SPA 用）のバックエンド版。DB・決済・外部 ID 連携が必要なフルスタックプロジェクトはこちらを起点にする。

## 前提条件

`vp` / `wrangler` 以外に、認証機能（cognito-local）を使う場合は以下が必要:

| コマンド    | 用途                                                                | 導入                                                                     |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `docker`    | cognito-local コンテナの起動（`compose.yaml`）                      | [Docker Desktop](https://www.docker.com/products/docker-desktop)         |
| `terraform` | Cognito User Pool / Client のプロビジョニング（ローカル・本番共通） | [Terraform CLI](https://developer.hashicorp.com/terraform/install) 1.15+ |

## 技術構成

| 領域                         | 技術                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| フロントエンド               | React 19 / React Router v7 系 (`createHashRouter`) / Tailwind CSS v4                                                                           |
| データ取得                   | [SWR](https://swr.vercel.app)（`useEffect` は lint で禁止）                                                                                    |
| バックエンド                 | Hono / Cloudflare D1 / Drizzle ORM                                                                                                             |
| 認証                         | Amazon Cognito（ローカルは cognito-local + Terraform で代替。下記「認証」参照）                                                                |
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

### 2. プロジェクト名のリネーム

このテンプレートはプレースホルダ置換方式を採らず、`fullstack-worker-template` という具体名を直接埋め込んでいる（CI (`ci.yml`) がテンプレートのままでも green になるようにするため）。新規プロジェクトを始めるときは、以下の箇所を手動でプロジェクト名に置き換える:

| ファイル                       | 箇所                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `package.json`                 | `"name"`                                                         |
| `wrangler.jsonc`               | `"name"`、`d1_databases[0].database_name`                        |
| `index.html`                   | `<title>`                                                        |
| `.github/workflows/deploy.yml` | `wrangler d1 migrations apply <db-name> --remote` の `<db-name>` |

`scripts/rename-project.sh` でまとめて置き換える（上記ファイル・箇所すべてと `wrangler.jsonc` の `compatibility_date` を実行日に更新する）:

```bash
bash scripts/rename-project.sh <project-name>
```

`d1_databases[0].database_id` は `wrangler d1 create <db-name>` で発行される実際の ID に置き換える（プレースホルダ `__D1_DATABASE_ID__` のままでも `vp build` / CI は通るが、実際の `wrangler deploy` はこの ID で対象データベースを解決するため本番投入前に必須）。

### 3. 依存インストール + 動作確認

```bash
vp install --frozen-lockfile
vp test                   # フロントエンドテスト
vp exec vitest run -c vitest.workers.config.ts   # バックエンドテスト
vp check                  # 型チェック + lint + フォーマット確認
vp build                  # dist/ にクライアント + Worker をビルド
vp dev                    # http://localhost:5173 で起動、/api/health が D1 疎通を返す
```

### `worker-configuration.d.ts`（`Env` 型定義）について

`wrangler.jsonc` の bindings（`d1_databases` / `vars` 等）と `main` から `wrangler types` で生成される型定義。秘密情報を含まないため commit 済み。`name` など bindings/`main` 以外のフィールドを変更しても中身は変わらない。

**bindings か `main` を変更したときだけ**、`vp exec wrangler types`（または `pnpm run types`）で再生成して commit し直す。`postinstall`（`vp install` 実行時に自動生成 + フォーマット）でも生成されるが、`node_modules` が既にインストール済みで pnpm が再インストールをスキップした場合は走らないため過信しないこと。CI (`ci.yml` / `deploy.yml`) は再生成せず commit された内容をそのまま使う。bindings/`main` を変更したのに再生成 + commit を忘れると `vp check` が型エラーで検出する。

すべてグリーンになればセットアップ完了。

## ディレクトリ構成

```
src/
├── front/           # React SPA（features/ で機能ごとにコロケーション推奨）
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

## 認証（Amazon Cognito）

ローカル開発では実際の AWS Cognito の代わりに [cognito-local](https://github.com/jagregory/cognito-local) を使う。User Pool / Client のプロビジョニングは（本番の AWS Cognito 用と同じ）Terraform で行う。事前に [Terraform](https://developer.hashicorp.com/terraform/install) CLI（1.15+）と Docker が必要。

```bash
docker compose up -d                 # cognito-local を起動 (localhost:9229)
vp run cognito:setup                 # terraform apply（terraform/local.tfvars）
                                      # .dev.vars と .env.local を生成
vp dev
```

`terraform/` は `cognito_local_endpoint` 変数が空なら実際の AWS Cognito を、値があれば cognito-local を対象にする（`main.tf` の `provider "aws" { endpoints { ... } }`）。本番適用時は `terraform apply`（`-var-file=local.tfvars` を付けない）で実行する想定。`create_test_user`（`aws_cognito_user` リソース）は `local.tfvars` でのみ `true` にする。テストユーザーを本番 Terraform で作らないこと。

セットアップ後にできるテストユーザーは `test@example.com` / `Passw0rd1!`。

### 既知の制限: cognito-local は SRP 認証フローを実装していない

`src/front/lib/cognitoClient.ts` は本番同様に `amazon-cognito-identity-js` の SRP 認証（`USER_SRP_AUTH`）を使うが、**cognito-local はこのフローを実装しておらず**、`/login` 画面からのサインインはローカルでは失敗する（`Cognito Local unsupported feature: InitAuth with AuthFlow=USER_SRP_AUTH`）。cognito-local が対応しているのは `USER_PASSWORD_AUTH` のみ。SRP 実装自体（`cognitoClient.ts`）は本番の Cognito に対してのみ動作確認できる（`POC_NEEDED` 相当、実 AWS 環境での確認が必要）。

ローカルでサーバー側（JWKS 取得・JWT 検証・`/api/me`）だけを確認したい場合は、`USER_PASSWORD_AUTH` で直接トークンを取得して curl できる:

```bash
CLIENT_ID=$(terraform -chdir=terraform output -raw client_id)
TOKEN=$(curl -s http://localhost:9229/ \
  -H 'Content-Type: application/x-amz-json-1.1' \
  -H 'X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth' \
  -d "{\"AuthFlow\":\"USER_PASSWORD_AUTH\",\"ClientId\":\"$CLIENT_ID\",\"AuthParameters\":{\"USERNAME\":\"test@example.com\",\"PASSWORD\":\"Passw0rd1!\"}}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['AuthenticationResult']['AccessToken'])")
curl -s http://localhost:5173/api/me -H "Authorization: Bearer $TOKEN"
# => {"sub":"..."}
```

- サーバー側の検証: `src/server/auth/verifyAccessToken.ts`（`jose` で issuer / `token_use=access` / `client_id` / 有効期限を検証。JWKS 取得は関数注入のため `test/worker/verifyAccessToken.test.ts` は cognito-local 起動なしでオフラインで検証できる）
- `.cognito/config.json`（`TokenConfig.IssuerDomain` を `http://localhost:9229` に固定）は commit 済み。設定しないと cognito-local が発行するトークンの `iss` が `http://0.0.0.0:9229/...` になり、`.dev.vars` の `COGNITO_ISSUER` と食い違って検証に失敗する
- 本番の User Pool ID / Client ID / Issuer は Terraform 適用結果を `wrangler secret put` 等でデプロイ時に設定する（`wrangler.jsonc` の `vars` は空文字のプレースホルダ）

### 認証が不要な場合

このプロジェクトで認証を使わないなら、以下を削除する:

- `compose.yaml` / `terraform/` / `scripts/cognito-local-setup.sh` / `.cognito/` / `.dev.vars.example` / `.env.local.example`
- `src/server/auth/` / `src/server/middleware/authenticate.ts` / `src/server/routes/me.ts`（`src/server/index.ts` の `meRoute` 登録も削除）
- `src/front/lib/cognitoClient.ts` / `src/front/pages/LoginPage.tsx`（+test）（`routes.tsx` の `/login` も削除）
- `test/worker/verifyAccessToken.test.ts`
- `wrangler.jsonc` の `vars`（`COGNITO_ISSUER` / `COGNITO_CLIENT_ID`）
- `package.json` の `amazon-cognito-identity-js` / `jose` 依存と `cognito:setup` script

## このテンプレート自体の CI/CD について

`ci.yml`（install → test → check → build）はこのテンプレートリポジトリ自身でも green になる。`deploy.yml` は `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` の Secrets をこのテンプレートリポジトリには設定していないため失敗する（想定内。テンプレは実運用のデプロイ対象ではない）。新規プロジェクトでは上記「2. プロジェクト名のリネーム」実施後、Secrets を設定すれば `deploy.yml` も green になる。

## 各プロジェクト側で追加する設定（テンプレートには含まれない）

- R2 バインディング・Cron Triggers（`wrangler.jsonc` にプロジェクトごとの要件に応じて追記）
- ドメイン固有のスキーマ・API・UI
