<!-- 種別: README -->

# chatbook

技術書を読みながら、気になった箇所を選択して AI に質問できる PDF リーダーです。
Cloudflare Workers 上で動くセルフホスト型のアプリで、**利用者 1 人**を前提に作られています。

読んでいる本文をドラッグで選ぶと、その一節を引用したまま AI に質問できます。回答は
ストリーミングで流れ、回答が挙げた出典は本文中のページ番号に解決されるので、そこから
本文へ飛び戻れます。選んだ箇所はハイライトとして残り、読んでいた場所は端末をまたいで
引き継がれます。

## 特徴

- **選択して質問** — 本文をドラッグ → 「AI に質問」。質問と一緒に選択した一節が渡る
- **回答から本文へ戻れる** — 回答の `## Sources` を解析し、PDF の引用は本文位置から
  ページ番号を割り出してジャンプ可能にする。見つからないときは理由（引用文が空 /
  本文に無い / 1 ページの本）を読者に見せる
- **ハイライトの永続化** — 選択範囲の矩形を保存し、次に開いたときも同じ場所に乗る
- **読書位置の同期** — ページ・開いていた会話・パネルの開閉をサーバに持たせ、別の端末でも続きから読める
- **見開き表示** — ペインに 2 ページ分の幅があれば自動で 2 ページ並べる
- **モバイル / タブレット対応** — 狭い画面は 1 カラム + ボトムシート、指でのタップ・スワイプ・ピンチに対応
- **キーバインド** — Vim / Emacs 風のキー操作を選べる
- **Web 検索** — 本文だけで足りない質問のために、DeepSeek の web_search を既定で有効にしてある

テキスト選択とハイライトまわりの実装（pdf.js の座標変換や DOM 契約など、見た目では
気付きにくい落とし穴）は [`docs/PDF_TEXT_SELECTION.md`](docs/PDF_TEXT_SELECTION.md) に
まとめてあります。

## 技術スタック

React 19 の SPA と Hono の Worker を **1 つの Cloudflare Workers プロジェクト**にまとめ、
`@cloudflare/vite-plugin` で両方を同じ開発サーバーから動かしています。

| 領域                   | 使っているもの                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| フロントエンド         | React 19 / React Router / Jotai（クライアント状態）/ SWR（サーバのデータ）/ Tailwind CSS 4 |
| PDF                    | pdfjs-dist 5（描画・テキスト抽出・表紙生成はすべてブラウザ側）                             |
| サーバー               | Hono（Cloudflare Workers）                                                                 |
| データベース           | Cloudflare D1 + Drizzle ORM                                                                |
| オブジェクトストレージ | Cloudflare R2                                                                              |
| LLM                    | DeepSeek（`deepseek-v4-flash`、OpenAI SDK 互換）                                           |
| バリデーション         | zod（`src/shared/schemas/` にフロント・サーバ共通のスキーマ）                              |
| エラーの運搬           | neverthrow（`ResultAsync`）                                                                |
| ツールチェーン         | [Vite+](https://viteplus.dev)（`vp`）/ Vitest / Playwright                                 |

`vp` は devDependency として同梱しているので、グローバルへの install は要りません
（`pnpm exec vp <サブコマンド>` で呼べます）。

## 仕様の要点

このアプリを動かすうえで知っておくと迷わない点です。

### PDF の処理はすべてブラウザ側で行う

pdf.js は workerd 上では動きません（native canvas を要求して落ちます）。そのため
テキスト抽出・表紙の生成・描画はすべてクライアントで行い、抽出済みの本文・ページ数・
表紙画像を multipart で `POST /api/pdf/open` に送ります。**Worker は保存だけを担います。**

### ストレージの分担

| 置き場所          | 内容                                                          |
| ----------------- | ------------------------------------------------------------- |
| D1 (`DB`)         | `pdfs` / `selections` / `chat_messages` のメタデータ          |
| R2 (`PDF_BUCKET`) | PDF 本体 `pdfs/<sha256>.pdf`、表紙 `thumbnails/<sha256>.webp` |

本の同一性は**内容の SHA-256** で判定します。同じ本を開き直すと同じ ID を返しつつ、
ファイル名・本文・ページ数は最新の抽出結果で上書きされます（読書位置は残ります）。

### ログインとセッション

インターネットに公開する前提なので、**`/api/*` は既定で閉じています**。素通しするのは
`/api/health` と `/api/auth/login` と `/api/auth/logout` の 3 つだけです。

- セッションは **HMAC で署名した Cookie 1 本**（30 日）。中身は失効時刻だけで、D1 に
  テーブルはありません
- Cookie に `Secure` を付けているため、**LAN の `http://192.168.x.x:5173` ではログインできません**
  （ブラウザが Cookie を保存しないため）。スマホからは公開 URL を使ってください。
  `localhost` は安全なオリジンとして扱われるので、ローカル開発には影響しません
- **`AUTH_USERNAME` / `AUTH_PASSWORD` / `AUTH_SESSION_SECRET` のどれかが空だと、
  すべて閉じたままになります**（ログインは 500、保護対象は 401）。設定を忘れたまま
  公開してしまう事故を防ぐためです
- 端末を失くしたときの取り消し手段は **`AUTH_SESSION_SECRET` の入れ替え 1 つだけ**です。
  stateless なので個別には失効させられず、入れ替えると自分の端末も含めて全部ログアウトになります

利用者が 1 人という前提なので、**D1 に所有者の列はありません**。「ログインした人 = 全データの
持ち主」です。複数アカウントを扱いたい場合はスキーマから設計し直す必要があります。

### AI への問い合わせ

`POST /api/pdf/:pdfId/selections/:selId/chats` が SSE（`token` / `citation` / `done` /
`error`）を返します。Web 検索が ON のときは DeepSeek の `/responses` に
`tools: [{ type: "web_search" }]` を渡し、OFF のときは `/chat/completions` を使います。

本の全文をコンテキストに載せるため、**200 ページ級の本では最初のトークンまで 10 秒前後**
かかります（ストリーミングが壊れているわけではありません）。

## 必要要件

- Node.js 24
- pnpm 11（`packageManager` フィールドで固定してあります）
- Cloudflare アカウント（Workers / D1 / R2）
- DeepSeek の API キー（AI への質問を使う場合）

## ローカル開発

```bash
pnpm install
cp .dev.vars.example .dev.vars   # ログインは skanehira / skanehira（ローカル専用の値）
pnpm run db:migrate:local        # D1 のマイグレーション（初回と migrations 追加時のみ）
pnpm exec vp dev                 # http://localhost:5173
```

`.dev.vars` は**必ず用意してください**。`AUTH_*` が無いと API はすべて 401 になり、画面も
E2E も動きません。

`.dev.vars.example` の `DEEPSEEK_API_KEY` はダミー値です。PDF を開いて読む・ハイライトを
付けるところまではダミーのまま動きますが、**AI の回答を実際に生成するには実キーが要ります**。

## テスト

```bash
pnpm test              # フロント単体（jsdom）
pnpm run test:worker   # Worker 単体（@cloudflare/vitest-pool-workers）
pnpm run test:e2e      # E2E（Playwright。サーバーは自動起動するので vp dev は不要）
pnpm exec vp check     # フォーマット + lint + 型チェック（--fix で自動修正）
```

E2E は `desktop` / `tablet` / `mobile` の 3 プロジェクトに分かれています
（`pnpm run test:e2e --project=tablet` で 1 つだけ実行）。ウィンドウ幅がレイアウトを、
ポインタの種類が入力の経路を決めるため、意味のある組み合わせごとに実行を分けています。

## デプロイ

初回は**順番が重要**です。

```bash
# 1. Cloudflare にログイン
pnpm exec wrangler login

# 2. D1 と R2 を作る
pnpm exec wrangler d1 create chatbook-db
pnpm exec wrangler r2 bucket create chatbook-pdfs
```

`d1 create` が出力した `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id`
に書きます（初期値はプレースホルダです）。Worker 名やバケット名を変えたい場合も
`wrangler.jsonc` を編集してください。

```bash
# 3. マイグレーションをリモートの D1 に当てる（デプロイより先）
pnpm exec vp build
pnpm exec wrangler d1 migrations apply chatbook-db --remote

# 4. デプロイ
pnpm run deploy

# 5. 秘密を入れる（Worker が存在してから）
pnpm exec wrangler secret put DEEPSEEK_API_KEY
pnpm exec wrangler secret put AUTH_USERNAME
pnpm exec wrangler secret put AUTH_PASSWORD
pnpm exec wrangler secret put AUTH_SESSION_SECRET
```

順番の理由:

- **マイグレーションはデプロイより先。** 列を足したマイグレーションが当たっていない D1 に
  新しいコードを載せると、本を開く経路ごと 500 になります。列の追加は旧コードに無害なので、
  先に当てるのが常に安全です
- **`vp build` を先に。** `d1 migrations apply` は `dist/chatbook/wrangler.json` を読むので、
  ビルドを飛ばすと古い設定が使われます
- **`secret put` はデプロイの後。** Worker がまだ無い状態で実行すると対話プロンプトが出ます。
  `secret put` は既存 Worker に新しいバージョンを自動で配るので、入れ終わったあとの
  再デプロイは要りません
- `.dev.vars` はローカル専用で、デプロイには乗りません

鍵がかかっていることの確認は、公開 URL に対する 401 が唯一の証拠です:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<your-worker>.workers.dev/api/pdfs  # 401
```

2 回目以降の更新は `pnpm run deploy` だけです（マイグレーションを足したときは、先に
`vp build` → `d1 migrations apply --remote` を実行してください）。

## 使い方

1. デプロイした URL を開き、`AUTH_USERNAME` / `AUTH_PASSWORD` でログインする
2. 本棚で PDF を選んでアップロードする（テキスト抽出と表紙生成はブラウザで走ります）
3. 本文をドラッグして選択する
   - マウスなら、離した位置に質問の入力欄が出ます
   - 指なら、画面下端にバーが出るので「AI に質問」を押します
4. 質問を送ると、回答がストリーミングで流れます
5. 回答に付いた出典バッジを押すと、引用元のページへ飛びます
6. 付けたハイライトはチャットパネルの一覧に並び、そこから過去の会話を開き直せます

読んでいた場所は自動で保存されるので、次に本棚から開いたときは続きから始まります。
リロードや共有リンク（`?page=` / `?selection=`）で開いたときは、URL が指す場所が優先されます。

### キーバインド

設定メニューから Vim / Emacs / なし を選べます（既定は Vim）。

| 操作           | Vim  | Emacs   |
| -------------- | ---- | ------- |
| 次のページ     | `l`  | `C-n`   |
| 前のページ     | `h`  | `C-p`   |
| 下にスクロール | `j`  | —       |
| 上にスクロール | `k`  | —       |
| 目次の開閉     | `t`  | `C-c t` |
| 最初のページ   | `gg` | `M-<`   |
| 最後のページ   | `G`  | `M->`   |

## ライセンス

[MIT](LICENSE)
