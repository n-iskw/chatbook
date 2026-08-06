# fullstack-worker-template

React 19 + Vite + Hono + Cloudflare D1 (Drizzle ORM) を単一の Cloudflare Workers プロジェクトにまとめたフルスタックテンプレート。SPA (`src/front`) と API Worker (`src/server`) を `@cloudflare/vite-plugin` で同一プロジェクトとして開発・デプロイする。

`skanehira/demo-site-template`（フロントオンリー静的 SPA 用）のバックエンド版。DB・決済・外部 ID 連携が必要なフルスタックプロジェクトはこちらを起点にする。

## 前提条件

`vp` / `wrangler` 以外に、以下の機能を使う場合は追加のツールが必要:

| コマンド    | 用途                                                                | 導入                                                                                           |
| ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docker`    | moto コンテナの起動（`compose.yaml`）                               | [Docker Desktop](https://www.docker.com/products/docker-desktop)                               |
| `terraform` | Cognito User Pool / Client のプロビジョニング（ローカル・本番共通） | [Terraform CLI](https://developer.hashicorp.com/terraform/install) 1.15+                       |
| `stripe`    | Stripe API のローカル開発（webhook 転送・イベント送信・ログ監視）   | `nix develop` + `direnv allow`（[direnv](https://direnv.net) 要導入）。初回のみ `stripe login` |

direnv 未導入の場合は `nix develop` を手動実行してもよい。

## 技術構成

| 領域                         | 技術                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| フロントエンド               | React 19 / React Router v8 系 (`createBrowserRouter`) / Tailwind CSS v4                                                                        |
| データ取得                   | [SWR](https://swr.vercel.app)（`useEffect` は lint で禁止）                                                                                    |
| バックエンド                 | Hono / Cloudflare D1 / Drizzle ORM                                                                                                             |
| 認証                         | Amazon Cognito（ローカルは moto + Terraform で代替。下記「認証」参照）                                                                         |
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

### Git hooks（lefthook）

`vp install` で [lefthook](https://github.com/evilmartians/lefthook) が `pre-push` フックを自動設定する（`lefthook.yml`）。`git push` のたびに `vp check` と `vp build` が実行され、失敗すると push がブロックされる。手動で確認したい場合は `lefthook run pre-push`。

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

ローカル開発では実際の AWS Cognito の代わりに [moto](https://github.com/getmoto/moto) の Cognito IDP モックを使う。User Pool / Client のプロビジョニングは（本番の AWS Cognito 用と同じ）Terraform で行う。事前に [Terraform](https://developer.hashicorp.com/terraform/install) CLI（1.15+）と Docker が必要。

```bash
docker compose up -d                 # moto を起動 (localhost:5001)
vp run cognito:setup                 # terraform apply（terraform/envs/local）
                                      # .dev.vars と .env.local を生成
vp dev
```

`compose.yaml` は moto をホスト側ポート `5001` で公開する（`5000` は macOS の AirPlay レシーバーが専有しているため避けている）。`MOTO_COGNITO_IDP_USER_POOL_ID_STRATEGY=HASH` / `MOTO_COGNITO_IDP_USER_POOL_CLIENT_ID_STRATEGY=HASH` により、User Pool ID / Client ID は名前から決定的に生成される（後述のとおり moto はステートレスだが、これにより再作成後も ID が変わらない）。

`terraform/` は環境ごとにディレクトリと state を分離している。`terraform/modules/cognito/` が User Pool / Client / テストユーザーの共通定義で、`terraform/envs/local/`（moto を対象、local backend、`create_test_user=true` 固定）と `terraform/envs/prod/`（実際の AWS Cognito を対象、backend は Cloudflare R2。`terraform/envs/prod/backend.hcl.example` を元に `backend.hcl` を作成し `terraform init -backend-config=backend.hcl` で初期化する）が呼び出す。ローカルの state（`terraform/envs/local/terraform.tfstate`）は使い捨て可能で、本番の state と物理的に分離されている。

moto はインメモリで永続化しないため、`docker compose down` でリソースは消える。コンテナを作り直した場合は `vp run cognito:setup` を再実行すれば良い（`terraform apply` が消失したリソースを自動検知して再作成し、上記 HASH 戦略により ID も変わらないため `.dev.vars` / `.env.local` の再生成だけで復旧する）。

セットアップ後にできるテストユーザーは `test@example.com` / `Passw0rd1!`。`/login` 画面から `amazon-cognito-identity-js` の SRP 認証（`USER_SRP_AUTH`）でサインインでき、成功すると `/mypage` に遷移する。

### 既知の制限（moto を使ったローカル認証）

- **SRP のパスワード署名は検証されない**: moto は `USER_SRP_AUTH` → `PASSWORD_VERIFIER` チャレンジのやり取り自体は実装しているが、SRP の暗号学的な検証は行わない。そのため**ローカルでは誤ったパスワードでもサインインが成功する**。パスワード検証込みの動作確認は実際の AWS Cognito に対してのみ可能（`POC_NEEDED` 相当）
- **IdToken の `email` クレームが正しく入らない**: moto の既知の不具合により、IdToken の `email` クレームには実際のメールアドレスではなく内部 UUID (`sub` と同じ値) が入る。そのため `/mypage` のメールアドレス表示はローカルでは UUID になる。実際の AWS Cognito では正しいメールアドレスが入る
- **`iss` claim の形式が固定**: moto が発行するトークンの `iss` は `https://cognito-idp.{region}.amazonaws.com/{pool_id}` で上書きできない。JWKS は moto 自身の `http://localhost:5001/{pool_id}/.well-known/jwks.json` から取得する必要があるため、Worker 側は `COGNITO_ISSUER`（署名検証の issuer）と `COGNITO_JWKS_URL`（鍵取得先。未設定時は `{issuer}/.well-known/jwks.json` にフォールバックし本番はこちらを使う）を分離している（`src/server/middleware/authenticate.ts` の `resolveJwksUrl`）
- サーバー側の検証: `src/server/auth/verifyAccessToken.ts`（`jose` で issuer / `token_use=access` / `client_id` / 有効期限を検証。JWKS 取得は関数注入のため `test/worker/verifyAccessToken.test.ts` は moto 起動なしでオフラインで検証できる）
- 本番の User Pool ID / Client ID / Issuer / JWKS URL は Terraform 適用結果を `wrangler secret put` 等でデプロイ時に設定する（`wrangler.jsonc` の `vars` は空文字のプレースホルダ）

### GitHub Actions での terraform apply

`.github/workflows/terraform.yml`(`plan`)と `.github/workflows/terraform-apply.yml`(`apply`)の 2 ワークフローで、`terraform/envs/prod` に対する plan/apply を行う。GitHub の Environment(Required reviewers)による承認ゲートは Free プランのプライベートリポジトリでは使えないため、**PR コメント駆動の自前承認フロー**にしている。

1. `terraform/` 配下を変更する PR を作成すると `plan` ジョブが実行され(`terraform fmt -check` / `validate` / `plan`)、結果がジョブサマリと PR コメントの両方に出力される。この時点では apply されない
2. PR を `main` にマージすると、push をトリガーに `plan` ジョブが再実行され、マージ後のフレッシュな plan が同じ PR にコメントされる(「承認するには `approve` とコメントしてください」という案内付き)
3. `TERRAFORM_APPROVERS`(後述)に登録された GitHub ユーザーが、その PR に **`approve`**(前後の空白のみ許容、それ以外の文言は不可)とコメントすると `terraform-apply.yml` が起動し、PR が `main` にマージ済みであることを確認したうえで `terraform apply -auto-approve` を実行する。結果(成功/失敗)は PR にコメントで返る

**apply は常にその時点の `main` の最新状態に対して実行される**(承認コメントを付けた PR 時点のコミットに固定されるわけではない)。複数の terraform PR が連続でマージされた後にどれか一つへ `approve` しても、適用されるのは常に最新の `main` の内容になる。保存済みの plan アーティファクトは再利用せず、`approve` のたびにフレッシュに plan → apply する(承認は非同期な人間の操作のため、時間が経つと Terraform は古い plan の適用を「state が変わった」として拒否するため)。

事前に以下の GitHub リポジトリ設定が必要:

- Secrets: `AWS_ROLE_ARN`(Cognito 操作を許可する IAM Role の ARN)、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`
- Variables: `R2_BUCKET`、`R2_ACCOUNT_ID`、**`TERRAFORM_APPROVERS`**(apply を承認できる GitHub ユーザー名をカンマ区切りで指定。例: `alice,bob`)
- AWS 側で GitHub OIDC Provider(`token.actions.githubusercontent.com`)と、このリポジトリの `sub` claim(例: `repo:<owner>/<repo>:ref:refs/heads/main`)を信頼する IAM Role を事前に用意する(Role 自体の作成はこの Terraform 構成に含まれない。Role がないと apply の OIDC 認証が成立しないため、循環を避けて手動またはこのパイプライン外で一度だけ作成する)

テンプレートリポジトリ自身(rename 前)ではリポジトリ名ガードにより CD 系ワークフロー(`deploy.yml` / `terraform.yml` / `terraform-apply.yml`)は実行されない。

### 認証が不要な場合

このプロジェクトで認証を使わないなら、以下を削除する:

- `compose.yaml` / `terraform/` / `scripts/cognito-setup.sh` / `.dev.vars.example` / `.env.local.example`
- `src/server/auth/` / `src/server/middleware/authenticate.ts` / `src/server/routes/me.ts`（`src/server/index.ts` の `meRoute` 登録も削除）
- `src/front/lib/cognitoClient.ts` / `src/front/pages/LoginPage.tsx`（+test）/ `src/front/pages/MyPage.tsx`（+test）/ `src/front/components/RequireAuth.tsx`（+test）/ `src/front/routes.test.tsx`（`routes.tsx` の `/login` `/mypage` も削除）
- `test/worker/verifyAccessToken.test.ts` / `test/worker/authenticate.test.ts`
- `wrangler.jsonc` の `vars`（`COGNITO_ISSUER` / `COGNITO_CLIENT_ID` / `COGNITO_JWKS_URL`）
- `package.json` の `amazon-cognito-identity-js` / `jose` 依存と `cognito:setup` script

## このテンプレート自体の CI/CD について

`ci.yml`（install → test → check → build）はこのテンプレートリポジトリ自身でも green になる。`deploy.yml` は `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` の Secrets をこのテンプレートリポジトリには設定していないため失敗する（想定内。テンプレは実運用のデプロイ対象ではない）。新規プロジェクトでは上記「2. プロジェクト名のリネーム」実施後、Secrets を設定すれば `deploy.yml` も green になる。

## 各プロジェクト側で追加する設定（テンプレートには含まれない）

- R2 バインディング・Cron Triggers（`wrangler.jsonc` にプロジェクトごとの要件に応じて追記）
- ドメイン固有のスキーマ・API・UI
