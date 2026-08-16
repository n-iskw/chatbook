# chatbook

<img width="2032" height="1162" alt="image" src="https://github.com/user-attachments/assets/fcb35a29-3f7a-47c0-86bb-94ee4fcc79dc" />

技術書を読みながら、気になった箇所を選択して AI に質問できる PDF リーダーです。
Cloudflare Workers 上で動くセルフホスト型のアプリで、**利用者 1 人**を前提に作られています。

読んでいる本文をドラッグで選ぶと、その一節を引用したまま AI に質問できます。回答は
ストリーミングで流れ、回答が挙げた出典は本文中のページ番号に解決されるので、そこから
本文へ飛び戻れます。選んだ箇所はハイライトとして残り、読んでいた場所は端末をまたいで
引き継がれます。

## できること

- **本棚に PDF を並べる** — 表紙は 1 ページ目から自動生成。中身が同じなら同じ本として
  扱うので、追加し直しても読書位置とハイライトは残ります
- **本文を選んで質問する** — 選んだ一節が質問に付いて送られるので「これはどういう意味?」で
  通じます。本の全文を渡すため、200 ページ級では最初の一文字まで 10 秒前後かかります
  （既定の DeepSeek での実測）
- **Web 検索は既定で ON** — 設定メニューの「チャット > Web検索」で切り替えられます
- **出典から本文へ飛ぶ** — 本からの引用にはページ番号が付きます。引用文が本文に見つから
  なかったときはその旨が出るので、AI が本文どおりに引用しなかったことに気付けます
- **ハイライトと会話が残る** — ページ上のハイライトか一覧から、そのときの会話を開き直せます
- **続きから読める** — ページと開いていた会話が保存されるので、PC で読んでいた本の続きを
  スマホで開けます
- **読み方を調整できる** — 目次、幅が余れば自動で見開き、拡大縮小（倍率は本ごとに記憶）、
  ページ送りはクリック / スワイプ / キーボード（Vim・Emacs のキーバインドを選べます）
- **スマホ・タブレットでも読める** — 狭い画面は 1 カラムとチャットのシート。指で触る端末は
  画面幅によらず指向けの操作になります

操作の詳細は [`docs/USAGE.md`](docs/USAGE.md) にあります。

## 使う前に知っておくこと

- **利用者 1 人向けです。** ログインした人が全データの持ち主で、アカウントを分ける仕組みは
  ありません。複数人で使うにはスキーマから設計し直す必要があります
- **AI の回答には LLM の API キーが要ります。** 自分で用意して、自分で使った分を払う
  形になります。キーが無くても PDF を読む・ハイライトを付けるところまでは動きます。
  既定の接続先は DeepSeek ですが、OpenAI 互換の API なら環境変数だけで差し替えられます
  （下記「接続先とモデルを差し替える」）
- **スマホからは公開 URL を使ってください。** セッション Cookie に `Secure` を付けているため、
  LAN の `http://192.168.x.x:5173` ではブラウザが Cookie を保存せずログインできません
- **端末を失くしたときの取り消し手段は `AUTH_SESSION_SECRET` の入れ替えだけです。**
  セッションはサーバに記録を持たないので個別には失効させられず、入れ替えると自分の端末も
  含めて全部ログアウトになります

## 必要要件

- Node.js 24
- pnpm 11（`packageManager` フィールドで固定してあります）
- Cloudflare アカウント（Workers / D1 / R2）
- OpenAI 互換の LLM API キー（AI への質問を使う場合。既定の接続先は DeepSeek。
  差し替えは下記「接続先とモデルを差し替える」）

以下のコマンドに出てくる `vp` は [Vite+](https://viteplus.dev) のことで、devDependency として
同梱しているのでグローバルへの install は要りません（`pnpm exec vp <サブコマンド>` で呼べます）。

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
に書きます。**初期値は作者の環境の ID なので、必ず自分の値へ置き換えてください**
（D1 の ID はアカウントの API トークンが無ければ使えないため秘密ではありませんが、
そのままでは自分のデータベースに繋がりません）。Worker 名やバケット名を変えたい場合も
`wrangler.jsonc` を編集してください。

```bash
# 3. マイグレーションをリモートの D1 に当てる
#    デプロイより先に。列の無い D1 に新しいコードを載せると本を開く経路ごと 500 になる。
#    列の追加は旧コードに無害なので、先に当てるのが常に安全
#    vp build を飛ばすと d1 migrations apply が古い dist/chatbook/wrangler.json を読む
pnpm exec vp build
pnpm exec wrangler d1 migrations apply chatbook-db --remote

# 4. デプロイ
pnpm run deploy

# 5. 秘密を入れる（Worker がまだ無いと対話プロンプトが出るので、デプロイの後）
#    secret put は既存 Worker に新しいバージョンを自動で配るので再デプロイは不要
pnpm exec wrangler secret put LLM_API_KEY   # DeepSeek 以外に向けるなら下記「接続先とモデルを差し替える」も見る
pnpm exec wrangler secret put AUTH_USERNAME
pnpm exec wrangler secret put AUTH_PASSWORD
pnpm exec wrangler secret put AUTH_SESSION_SECRET
```

`AUTH_USERNAME` / `AUTH_PASSWORD` がログインに使う ID とパスワード、
`AUTH_SESSION_SECRET` はセッション Cookie の署名鍵です（ランダムな長い値にしてください）。
**この 3 つのどれかが空だと API はすべて閉じたまま**になります。設定を忘れたまま公開して
しまう事故を防ぐためで、初回のデプロイは意図的に閉じた状態で出ます。
`.dev.vars` はローカル専用で、デプロイには乗りません。

鍵がかかっていることの確認は、公開 URL に対する 401 が唯一の証拠です:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<worker 名>.<アカウント>.workers.dev/api/pdfs  # 401
```

2 回目以降の更新は `pnpm run deploy` だけです（マイグレーションを足したときは、先に
`pnpm exec vp build` →
`pnpm exec wrangler d1 migrations apply chatbook-db --remote` を実行してください）。

## 接続先とモデルを差し替える

**OpenAI 互換の API なら環境変数だけで差し替えられます。**接続先とモデルを設定しなければ
DeepSeek に向きます。キーは `pnpm exec wrangler secret put LLM_API_KEY`、接続先・モデル・
Web 検索の可否（`LLM_BASE_URL` / `LLM_MODEL` / `LLM_WEB_SEARCH_SUPPORTED`）は秘密ではないので
`wrangler.jsonc` の `vars` に書きます。

変数の一覧と既定値、乗り換えの手順、Web 検索を持たないプロバイダの設定、失敗したときの
切り分けは [`docs/LLM_PROVIDERS.md`](docs/LLM_PROVIDERS.md) にあります。旧バージョンの
`DEEPSEEK_API_KEY` から移ってくる場合もそちらです。

## ローカル開発

```bash
pnpm install
cp .dev.vars.example .dev.vars   # ログインは demo / demo（ローカル専用の値）
pnpm run db:migrate:local        # D1 のマイグレーション（初回と migrations 追加時のみ）
pnpm run dev                     # http://localhost:5173（macOSではMac音声Bridgeも自動起動）
```

`npm run dev` でも起動できます。macOS以外では音声Bridgeは起動せず、macOSで自動起動を
無効にしたい場合は `CHATBOOK_DISABLE_MAC_SPEECH=1 pnpm run dev` とします。

`.dev.vars` は**必ず用意してください**。`AUTH_*` が無いと API はすべて 401 になり、画面も
E2E も動きません。`LLM_API_KEY` はダミー値なので、PDF を読む・ハイライトを付けるところまでは
そのまま動きますが、**AI の回答を生成するには実キーが要ります**。

### Mac 上の Codex を回答モデルにする

Codex を chatbook の AI として使う場合は、`pnpm run codex:bridge` で Mac 上のブリッジを
起動し、`.dev.vars` を次のように設定します。`CODEX_BRIDGE_TOKEN` はランダムな長い値にし、
`.dev.vars` には同じ値を `LLM_API_KEY` として書きます。ブリッジは既定で `127.0.0.1` に
bind するため、公開Workerからは使えません。

```bash
export CODEX_BRIDGE_TOKEN="$(openssl rand -hex 32)"
pnpm run codex:bridge
```

```dotenv
LLM_API_KEY=<CODEX_BRIDGE_TOKEN と同じ値>
LLM_BASE_URL=http://127.0.0.1:8788/v1
LLM_MODEL=codex
LLM_WEB_SEARCH_SUPPORTED=false
```

Codex CLI がログイン済みであることが前提です。ブリッジは Codex App Server を read-only
で起動し、PDF本文と会話履歴をプロンプトとして渡します。ファイル編集とネットワーク
アクセスは許可せず、プロンプトでもローカルツールを使わないよう指定します。Web検索は
chatbook の本文コンテキストに限定するため無効になります。
設定変更後は Worker とブリッジを再起動してください。

### Mac音声で表示中のページを読む

Macの「Speak selection」と同じ読み上げを現在表示中のPDFページで使う場合は、`npm run dev`
（または `pnpm run dev`）で開発サーバーを起動します。macOSでは同じコマンドがMac音声Bridgeも
自動起動します。表示ページの「このページを読む」を押すと、pdf.jsの
本文を画面外の専用テキスト領域で選択してmacOSの `Option + Esc` を実行します。PDFの可視テキストや
質問ポップオーバーの選択UIは変更しません。ブリッジが使えない場合は
ブラウザの読み上げへフォールバックします。詳細は[Mac音声でページを読む](docs/MAC_SPEECH.md)
を参照してください。

初回は、次のmacOS設定を確認してください。

- **システム設定 > アクセシビリティ > 読み上げコンテンツ**で「選択項目を読み上げ」をオンにする
- 同じ画面で、システム音声を `Siri (Voice 2)`、言語を「日本語」にする
- 「言語を自動検出」はオフにする（英単語だけ別音声になるのを避けるため）
- 「Pronunciations」はオンにする
- **システム設定 > プライバシーとセキュリティ > アクセシビリティ**で、ブリッジを起動する
  `Terminal` / `iTerm2` / `Visual Studio Code` などのアプリを許可する

権限を変更した後は、開発サーバーを再起動してください。Chromeにキー送信権限を
与えるのではなく、`Option + Esc` を送信する側のターミナルアプリに権限を与えます。

**`.dev.vars` の行を消したり並べ替えたりしないでください。**
コミット済みの生成物 `worker-configuration.d.ts` は、`.dev.vars` にあるキーの一覧**と並び順**、
および `wrangler.jsonc` の `vars` から生成されます（`pnpm install` の `postinstall` が
`wrangler types` を回します）。キーを消しても並べ替えても型に差分が出ます
（値は空でもダミーでも型に影響しません）。
`LLM_BASE_URL` / `LLM_MODEL` / `LLM_WEB_SEARCH_SUPPORTED` が値の空いた行で並べてあるのは
そのためで、別のプロバイダをローカルで試すときはここに値を入れて `pnpm exec vp dev` で
確かめられます（上記「接続先とモデルを差し替える」）。

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

## 技術スタック

React 19 の SPA と Hono の Worker を **1 つの Cloudflare Workers プロジェクト**にまとめ、
`@cloudflare/vite-plugin` で両方を同じ開発サーバーから動かしています。

| 領域                   | 使っているもの                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| フロントエンド         | React 19 / React Router / Jotai（クライアント状態）/ SWR（サーバのデータ）/ Tailwind CSS 4 |
| PDF                    | pdfjs-dist 6（描画・テキスト抽出・表紙生成はすべてブラウザ側）                             |
| サーバー               | Hono（Cloudflare Workers）                                                                 |
| データベース           | Cloudflare D1 + Drizzle ORM                                                                |
| オブジェクトストレージ | Cloudflare R2                                                                              |
| LLM                    | OpenAI 互換 API（既定は DeepSeek。OpenAI SDK 経由。→ `docs/LLM_PROVIDERS.md`）             |
| バリデーション         | zod（`src/shared/schemas/` にフロント・サーバ共通のスキーマ）                              |
| エラーの運搬           | neverthrow（`ResultAsync`）                                                                |
| ツールチェーン         | [Vite+](https://viteplus.dev)（`vp`）/ Vitest / Playwright                                 |

設計上の判断とその理由は [`CLAUDE.md`](CLAUDE.md) に、テキスト選択とハイライトの実装
（pdf.js の座標変換や DOM 契約など、見た目では気付きにくい落とし穴）は
[`docs/PDF_TEXT_SELECTION.md`](docs/PDF_TEXT_SELECTION.md) にまとめてあります。

## 貢献

作者 1 人が自分のために作っているアプリなので機能追加の採否は読めませんが、バグ報告と
その修正は歓迎します（[CONTRIBUTING.md](CONTRIBUTING.md)）。**脆弱性は公開の Issue では
なく** [SECURITY.md](SECURITY.md) の手順で報告してください。

## ライセンス

[MIT](LICENSE)
