# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

技術書を読みながら、気になった箇所を選択して AI に質問できる PDF リーダー。利用者は 1 人。
React 19 (SPA) + Hono (Worker) + D1 + R2 を単一の Cloudflare Workers プロジェクトにまとめ、
`@cloudflare/vite-plugin` で SPA と Worker を同一の `vp dev` で動かす。

**公開先は https://chatbook.techlead-it.workers.dev** で、API はログインの内側にある
（下記「ログインとセッション」）。ローカルだけで動かしていた頃の前提（ログイン不要）は
もう成り立たない。

## コマンド

`vp`（Vite+）に統一。生の `vite` / `vitest` は直接叩かない。

```bash
vp dev                    # SPA + Worker を同時起動 (http://localhost:5173)
pnpm run db:migrate:local # D1 マイグレーション適用（初回 / migrations 追加時のみ、自動適用はしない）

pnpm test                 # フロント単体 (jsdom)
pnpm run test:worker      # Worker 単体 (@cloudflare/vitest-pool-workers)
pnpm run test:e2e         # E2E (Playwright)。サーバーは自動起動するので vp dev は不要

vp check                  # フォーマット + lint + 型チェック（--fix で自動修正）
vp exec wrangler types    # wrangler.jsonc の bindings/main 変更後に Env 型を再生成
```

単体テストを1ファイルだけ走らせる: `vp exec vitest run src/front/lib/sseParser.test.ts`
1 つの project だけ走らせる: `pnpm run test:e2e --project=mobile`（`desktop` / `tablet` / `mobile`）
E2E を1件だけ走らせる: `pnpm run test:e2e -g "テスト名の一部"`（`--` を挟むと pnpm が
それをそのまま playwright へ渡し、`-g` が効かないまま全件走る）

`git push` 時に lefthook の `pre-push` が `vp check` + `vp build` を実行し、失敗すると push はブロックされる。

### worktree を作ったら最初に `.dev.vars` を用意する

`.dev.vars` は gitignore 済み（`.gitignore:4`）で **worktree には複製されない**。無いまま
`vp dev`（`pnpm run test:e2e` の自動起動を含む）を動かすと、`@cloudflare/vite-plugin` が
commit 済みの `worker-configuration.d.ts` を再生成し、`DEEPSEEK_API_KEY` の宣言が消えた差分が
毎回出る。worktree を切ったら実装を始める前に用意する:

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars.example` が実際に読む鍵をそのまま並べてあるので、コピーすればそのまま動く
（`DEEPSEEK_API_KEY` はダミー、ログインは `skanehira` / `skanehira`）。

型の差分は値ではなく鍵の**存在**で決まるので、ダミー値で消える。現在の E2E は DeepSeek へ
問い合わせないので、実キーが要るのは手で回答の生成を確かめるときだけ。そのときはメインクローンの
`.dev.vars` からコピーする。**チャット送信を E2E に足すなら実キーが要る**——ダミー値では認証が
通らず、トークンが 1 つも届かないまま 60 秒のタイムアウトまで粘って落ちる。

**`AUTH_*` が無いと API は全部 401 になる**ので、`.dev.vars` を用意しないと E2E も画面も
何も動かない（上記「ログインとセッション」の「秘密が無ければ閉じる」）。

### `useEffect` の扱い

`vite.config.ts` の `no-restricted-imports` が `useEffect` の import を禁止している。
このアプリは canvas 描画・DOM 購読・pdf.js の命令的 API が本質なので使う場面が多いが、
ルールは**残したまま**、使う側が import 行に
`// oxlint-disable-next-line no-restricted-imports -- <理由>` を付けて理由を明記する運用にしている。
新しく足すときも同じように理由を書くこと。

現在 10 ファイルに理由コメントがあり、内訳は次の 5 つしかない。新しく足す `useEffect` も
このどれかに当てはまるはずで、当てはまらないなら書き方を疑うこと:

| 用途                                                    | ファイル                                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pdf.js という命令的ライブラリの呼び出しと後始末         | `PdfPage.tsx`（`RenderTask` / `TextLayer`）、`usePdfDocument.ts`（バイナリ取得とドキュメント構築）、`usePdfOutline.ts`（`getOutline` と dest 解決）                           |
| `document` / `window` / `ResizeObserver` の購読         | `useKeyboardShortcuts.ts`、`SettingsMenu.tsx`、`SelectionPopover.tsx`、`PdfViewer.tsx`、`useSettledSelection.ts`（`document` の `selectionchange` と `window` の pointer 系） |
| 非 passive なジェスチャの購読（ブラウザの既定を止める） | `PdfViewer.tsx`（ctrlKey wheel のピンチ、touch と Safari の gesture イベント）                                                                                                |
| DOM への命令的な書き込み（スクロール位置）              | `ChatMessageList.tsx`（最下部へ追随）、`PdfViewer.tsx`（ページ遷移時のリセット）                                                                                              |
| URL という React の外の状態への同期                     | `useReadingLocation.ts`                                                                                                                                                       |

**画面幅の購読には `useEffect` を使わない**。`useIsNarrow`（`src/front/hooks/useIsNarrow.ts`）が
`useSyncExternalStore` で `matchMedia` を購読する。購読するのは幅そのものではなく
メディアクエリの真偽なので、再レンダーはレイアウトが切り替わるときだけ起きる。

**データ取得は理由にならない**。一覧・本・ハイライト・引用箇所のページ解決は SWR へ
移してある（下記「状態管理とルーティング」）。

**SWR が持っているものを atom へ写すのも理由にならない**。写した瞬間に同じデータが
2 箇所に載り、更新のたびに 1 レンダー遅れる。読み手が少ないなら props で配る
（`AppPage` → `PdfViewer` / `ChatArea` の `book` がその形）。

これと紛らわしいものが 2 つある。どちらも `useReadingLocation.ts` で、SWR が解いた値を
atom に一度だけ書く——`useSWRImmutable` が解いた「引用箇所のページ番号」を
`currentPageAtom` に、`useBook` が返した本の中から URL の `?selection=` が名指した
ハイライトを `activeSelectionAtom` に（`openChat` 経由。下記「リーダーの URL は
`useReadingLocation` が単独で書く」）。これは写しではない: どちらの atom も「読者が今どこを
見ているか」というクライアント状態で、キーボード・ページ送りボタン・目次・URL・一覧の
クリックも書き込む。取得結果はその状態を**一度だけ動かすきっかけ**であって、サーバのデータを
atom に常駐させているわけではない。
**サーバの値がそのまま atom に載り続けるなら写し（禁止）、一度きりの入力なら可**。

## アーキテクチャ

### ログインとセッション

インターネットに出しているので、`/api/*` は**既定で閉じている**。素通しするのは
`/api/health` と `/api/auth/login` と `/api/auth/logout` の 3 つだけで、
`src/server/routes/auth.ts` の `requireSession` が**完全一致で**列挙する。前方一致にしないのは、
あとから足したパスが偶然素通りしないようにするため。middleware は
`src/server/index.ts` で全ルートより先に登録してあるので、新しいルートは黙って守られる。

**利用者が 1 人なので、D1 に所有者の列は無い**。「ログインした人＝全データの持ち主」で
正しい。アカウントを増やすときに初めて `schema.ts` とマイグレーションと全クエリに波及する。

| 何を                                        | どこに                                                 |
| ------------------------------------------- | ------------------------------------------------------ |
| セッションの署名・検証・Cookie の組み立て   | `src/server/auth/session.ts`（純関数。単体テストあり） |
| ログイン・ログアウト・在籍確認と middleware | `src/server/routes/auth.ts`                            |
| front と server が交わす形                  | `src/shared/schemas/auth.ts`                           |
| 画面側のゲートとパスワード入力              | `src/front/components/RequireSession.tsx`              |
| 在籍を確かめるフック                        | `src/front/hooks/useSession.ts`                        |

**セッションは HMAC で署名した Cookie 1 本**（`chatbook_session`、30 日）。中身は失効時刻
だけで、誰であるかを持たない。**署名を先に検証してから失効を読む**ので、失効時刻を書き換えた
トークンは長いセッションではなく偽物として落ちる。D1 にテーブルは無い。

**Cookie には `Secure` を付ける**。公開する以上、平文で運ばれるセッションは平文で運ばれる
パスワードと同じであるため。代償として**LAN の `http://192.168.x.x:5173` ではログインできない**
（ブラウザが Cookie を保存しない）。スマホからは公開 URL を使う。`localhost` は安全な
オリジンとして扱われるので、ローカル開発と E2E は影響を受けない。

**秘密が設定されていなければ全部閉じる**。`AUTH_USERNAME` / `AUTH_PASSWORD` /
`AUTH_SESSION_SECRET` のどれかが空だと、ログインは 500 (`CONFIG_ERROR`)、保護対象は 401 の
まま。設定を忘れたまま公開してしまう事故を防ぐためで、**初回のデプロイは意図的に閉じた状態で
出す**（下記「デプロイ」）。

画面側は `/login` へ飛ばさず、`RequireSession` がその場でパスワードを聞く。読者の居場所は
アドレスに載っている（`?page=` / `?panel=` / `?selection=`）ので、別ルートへ送ると戻り先を
持ち回る仕掛けが要る。**401 とそれ以外は区別する**——401 はサーバーが「まだログインして
いない」と言っているのでパスワードを聞き、それ以外（回線断・500）は「確かめられなかった」
と出す。後者でパスワードを聞くと、読者のせいでないことを読者のせいにしてしまう。

**端末を失くしたときの取り消し手段は `AUTH_SESSION_SECRET` の入れ替え 1 つだけ**。
セッションは stateless なので個別には失効させられず、入れ替えると自分の端末も含めて
全部ログアウトになる。

### デプロイ

```bash
pnpm run deploy   # vp build してから wrangler deploy
```

本番のリソースは作成済み（D1 `chatbook-db` / R2 `chatbook-pdfs`）。`wrangler.jsonc` の
`database_id` は実 ID が入っている。**マイグレーションを足したらリモートにも当てる**:

```bash
vp build   # dist/chatbook/wrangler.json を作り直す。これを飛ばすと古い設定が読まれる
vp exec wrangler d1 migrations apply chatbook-db --remote
```

秘密は 4 つ、`wrangler secret put <名前>` で入れる（`.dev.vars` はローカル専用でデプロイには
乗らない）: `DEEPSEEK_API_KEY` / `AUTH_USERNAME` / `AUTH_PASSWORD` / `AUTH_SESSION_SECRET`。
**Worker がまだ無い状態の `secret put` は対話プロンプトを出す**ので、順番は
「デプロイ → secret put」。`secret put` は既存 Worker に新しいバージョンを自動で配るので、
入れ終わったあとの再デプロイは要らない。

鍵がかかっていることの確認は、公開 URL に対する 401 が唯一の証拠:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://chatbook.techlead-it.workers.dev/api/pdfs  # 401
```

### PDF の処理はブラウザ側で行う（重要）

pdf.js は workerd 上で動かない（native canvas を要求して落ちる）。そのため:

- **テキスト抽出・表紙生成・描画はすべてクライアント**（`src/front/lib/pdfLoader.ts`）
- クライアントが抽出済みの `fullText` / `pageCount` / 表紙 webp を **multipart** で
  `POST /api/pdf/open` に送り、Worker は保存だけを担う

サーバ側で PDF を解析しようとしないこと。

### ストレージの分担

| 置き場所          | 内容                                                          |
| ----------------- | ------------------------------------------------------------- |
| D1 (`DB`)         | `pdfs` / `selections` / `chat_messages` のメタデータ          |
| R2 (`PDF_BUCKET`) | PDF 本体 `pdfs/<sha256>.pdf`、表紙 `thumbnails/<sha256>.webp` |

同一性は **内容の SHA-256** で判定する。同じ本を開き直すと同じ `pdfs.id` を返しつつ、
`fileName` / `fullText` / `pageCount` を最新の抽出結果で**上書き**する
(`src/server/services/pdfService.ts` の `openPdf`)。ここを「既存レコードをそのまま返す」に
戻すと、古いメタデータが残り続ける不具合になる。

### 外部入力のバリデーション（zod）

front と server が交わす形は `src/shared/schemas/` に zod スキーマとして 1 箇所だけ置き、
型は `z.infer` で導出する（`error.ts` / `book.ts` / `selection.ts` / `citation.ts` /
`chat.ts` / `sse.ts`）。front・server どちらにも同じ概念の型を書かないこと。

- **サーバの受け口**は `src/server/routes/validation.ts` の `validate(target, schema)`
  （`@hono/zod-validator` のラッパ）を通す。素の `zValidator` は zod のレポートをそのまま
  400 で返すため、クライアントが読む `error.message` を持たない。`validate` は
  `{ error: { code: "VALIDATION_ERROR", message: "Invalid request body: pageNumber" } }`
  の形に揃える。メッセージは zod の文言ではなく違反フィールドのパスなので、zod の更新で
  変わらない
- **クライアントの受け口**は `src/front/lib/fetcher.ts` の `fetcher(url, schema, init?, fetchFn?)`。
  `schema.safeParse` を通った値だけを返す。**レスポンスが返ったあとの失敗 2 系統**——サーバが
  拒否した（`error.code` を載せる。取れないときは `"UNKNOWN"`）と、レスポンスがスキーマに
  合わない（`"INVALID_RESPONSE"`）——を `ApiError`（`message` / `code` / `status` / `kind`）に
  揃えて throw する。`fetch` 自体が reject するネットワーク断・abort はここでは包まず、
  `TypeError` / `AbortError` がそのまま呼び出し側へ伝わる（包む版は下記 `resultFetcher`）
- **`src/server/services/chatService.ts` の `LlmMessage`** は LLM 送信用で `system` role を
  含み、保存される `ChatMessage`（`src/shared/schemas/chat.ts`）とは別物。shared に混ぜないこと

エラー形式は 2 系統あり、**ペイロード `{ code, message }` だけを共通化して transport の差は
残している**。ストリーム開始前は HTTP ステータス + `{ error: { code, message } }`、開始後は
`event: error` + 裸の `{ code, message }`。SSE ではイベント名が判別子なので `error` で包む
意味がない。ワイヤ上の `code` は前方互換のため `z.string()` で受け（読み手は知らない code を
渡す以外にできることがない）、サーバ側の構築だけ `shared/schemas/error.ts` の `ErrorCode`
union + `satisfies` で固定する。

### 失敗の運び方（neverthrow）

**失敗はユーザーに見える形にするか、握りつぶす理由をコメントに書くかのどちらかにする。**
`console.error` だけで済ませない（それは前者でも後者でもない）。

- **D1 / R2 に触る service は `ResultAsync`**（現状 `pdfService.ts` の 4 関数）。エラー型は
  `src/server/services/serviceError.ts` の
  `ServiceError = { type: "NOT_FOUND" } | { type: "STORAGE"; cause }` の 2 つだけで、
  `notFound()` / `storageFailure(cause)` が作る。route が `.match()` で封筒に落とす
  （`src/server/routes/pdf.ts` の `serviceFailureResponse` が 404、`storageFailureResponse`
  が 500 を組み立てる。**名前が似ているが、`storageFailure` は service が返す値、
  `storageFailureResponse` は route が返すレスポンス**）。「無い」は各エンドポイントの言葉で
  404、「ストアが応答しない」は一律 `INTERNAL_ERROR` の 500 で、`cause` はサーバのログにだけ
  出す。バインディングに触らない service（`chatService.ts` は純粋関数、`deepseekService.ts`
  は throw + callbacks でストリームを運ぶ）はこの対象外
- **想定外の throw と未定義パスは `src/server/index.ts` の `app.onError` / `notFound` が拾う**
  （それぞれ `INTERNAL_ERROR` / `ROUTE_NOT_FOUND`。どちらも `shared/schemas/error.ts` の
  `ERROR_CODES` に載っており、`index.ts` が `satisfies ErrorCode` で固定して唯一発行する）。
  Hono の既定は `text/plain` の "Internal Server Error" を返し、これは封筒ではないので
  `fetcher` からは `UNKNOWN` にしか見えない。`/api/*` だけが Worker に来る
  （`wrangler.jsonc` の `run_worker_first`）ので、`notFound` が SPA の直リンクを奪うことはない
- **フロントの読み取り（SWR）は throw ベースの `fetcher` のまま**。SWR の `error` state が
  その境界の Result そのもので、`Err` に変換して戻すのは往復の無駄
- **失敗を画面に出す mutation とイベントハンドラ起点の 1 回きりの取得は `resultFetcher`**
  （`ResultAsync<T, ApiError>`）。受け皿になる SWR が無いので、失敗は値で返さないと消える。
  現在の該当箇所は本の削除（`ShelfPage`）・アップロード（`FileSelector`）・ハイライトの作成
  （`useAskAboutSelection`）・チャット履歴の取得（`AppPage`）の 4 つ。
  **例外は `usePdfDocument.ts` の `storeCoverIfMissing`** で、これは失敗を出さないと決めた
  書き込み（下記「意図的に握りつぶす」）なので `fetcher` + try/catch のままでよい
- **`ApiError` の `kind`** は `http`（サーバが拒否した）/ `parse`（返ってきた形が違う）/
  `network`（応答が無い）。`parse` は `fetcher` も立てるので throw 経路にも現れる。
  `network` だけは `resultFetcher` でしか作られない（`fetcher` は fetch の reject を包まない）。
  クライアント固有の `code` は `fetcher.ts` の `CLIENT_ERROR_CODES` に集約してあり
  （`UNKNOWN` / `INVALID_RESPONSE` / `NETWORK_ERROR` / `ABORTED`）、**リテラルで書かないこと**——
  `ApiError.code` は `string` なので typo しても型で落ちない
- **レンダー中の throw は Result では拾えない**ので、`src/front/routes.tsx` が両ルートに
  `errorElement`（`src/front/components/RouteErrorBoundary.tsx`）を張る

**表示する文言は、それを描くコンポーネントが組み立てる。**フックは理由（サーバや例外の
`message`）だけを返す——`usePdfDocument` / `usePdfOutline` / `useAskAboutSelection` /
`PdfPage` の `onError` はすべてこの形で、前置きは `PdfViewer` と `PdfOutline` が付ける。
**例外は `chatErrorAtom` ただ 1 つ**で、書き手が複数（送信の失敗と履歴の取得失敗）・読み手が
1 つ（`ChatArea`）なので、完成した文を atom が持つ。

失敗の受け皿と表示場所は次のとおり。新しい失敗を足すときはこの表のどれかに合流させる:

| 失敗                              | 受け皿                                                | 出る場所                                                                         |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| 本棚の読み込み・削除・追加        | `ShelfPage` の `actionError` と SWR の `error`        | 本棚上部の赤い枠                                                                 |
| 本の読み込み                      | `useBook` の `error` → `bookError` prop               | ビューア中央とチャットパネル                                                     |
| PDF バイナリの取得・pdf.js の構築 | `usePdfDocument` の `error`                           | ビューア中央                                                                     |
| ページの描画                      | `PdfPage` の `onError` → `PdfViewer` の `renderError` | ビューア上部（ページを移ると消える）                                             |
| 目次の取得                        | `usePdfOutline` の `error`                            | 目次パネル                                                                       |
| ハイライトの保存                  | `useAskAboutSelection` の `saveError`                 | ビューア上部（ポップオーバーは開いたまま。狭い画面では質問の入力欄が開いたまま） |
| チャットの送信・履歴の取得        | `chatErrorAtom`                                       | チャットパネル（狭い画面ではシート）                                             |
| リンク先の passage が見つからない | `useReadingLocation` の `passageMiss`                 | ヘッダ直下の帯                                                                   |

`chatErrorAtom` だけ二重の口がある。**atom が表示の正、`sendMessage` の戻り値
（`ResultAsync<string, ApiError>`。成功時の値は保存された回答の id）は呼び出し元の
フロー制御用**という分担で、戻り値を捨てた呼び出し元があっても画面が無言にならないように
してある。新しい送信の開始と、別のハイライトを開いたときにクリアする。

#### 意図的に握りつぶす

次の 7 箇所は失敗を画面に出さない。いずれも理由をコメントに書いてあり、**理由を書かずに
握りつぶしを増やさないこと**:

| 箇所                                                         | 握りつぶす理由                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pdfLoader.ts` の表紙生成 / `usePdfDocument.ts` の後追い保存 | 表紙は装飾。本棚がタイトルで代替する                                 |
| `sseParser.ts` / `deepseekService.ts` の断片パース           | ストリームの 1 ブロックが壊れても残りは使える                        |
| `routes/pdf.ts` のクライアント切断後の送信                   | throw を通すと回答の保存に届かない                                   |
| `pdfService.ts` の `readPositionData`                        | 壊れた 1 行で本ごと開けなくしない（下記「`positionData` の正準形」） |
| `chatService.ts` の `readCitations`                          | 出典が読めなくても回答そのものは見せる                               |
| `textFragment.ts` のリンク解析                               | 解析できない = passage へのリンクではない、という正常系              |
| `usePdfOutline.ts` の `resolvePageNumber`                    | dest が解けない 1 項目はページ無しで並べ、残りは使える               |

`SelectionPopover` の `onSubmit` を囲む catch も握りつぶしだが、これは**報告しないため
ではなく報告する主体が別だから**（質問の失敗は `useAskAboutSelection` が受け持つ。
ここで再 throw するとイベントハンドラの外へ抜け、`errorElement` にも届かない）。

#### `positionData` の正準形

ハイライトの座標は `{ rects, pageWidth? }` が正準形で、**未知のキーは strip する**。

- 書き込み（`POST /api/pdf/:pdfId/selections`）は `validate("json", ...)` で厳格に検証する。
  ビューアは計測結果（`startIndex` / `endIndex` / `pageNumber` も持つ）を丸ごと送ってくるが、
  保存されるのは正準形だけ
- 読み出し（`pdfService.ts` の `readPositionData`）は `safeParse` + `{ rects: [] }`
  フォールバック。**ここを strict にすると正準形でない既存行のある本が開けなくなる**。
  JSON として壊れた行 1 件で本ごと 500 にしないためでもある

### pdf.js のランタイムアセット

`scripts/copy-pdfjs-assets.mjs`（`postinstall` で実行）が `cmaps` と `standard_fonts` を
`public/pdfjs/` に複製する。`src/front/lib/pdfjsConfig.ts` の `PDFJS_ASSET_OPTIONS` で
`cMapUrl` / `standardFontDataUrl` を渡す。

**`cMapUrl` が欠けると、出版された日本語 PDF が白紙になる**——CID-keyed フォントを描くには
CMap テーブルが要る。これを守っているのは実書籍を読む E2E 1 本だけで（下記「E2E の前提」）、
グリフを埋め込んだ PDF では再現しないので、cMap 周りに触ったらそのテストを走らせること。
**`standardFontDataUrl`（埋め込まれていない標準 14 フォント）を守るテストは今のところ無い**。
ブラウザは黙ってシステムフォントに落とすため、自動で検出する手立てがない。

`src/index.css` の `.hiddenCanvasElement { display: none }` も必須。pdf.js が `<body>` に足す
計測用 canvas が既定の 300×150 でレイアウトに参加し、ページ下部に空白が出る。

### テキスト選択とハイライト

**この機能に手を入れる前に `docs/PDF_TEXT_SELECTION.md` を読むこと。** 選択位置のズレ・選択範囲の
暴走・ハイライトの欠けは、いずれも見た目では気付きにくく、原因も pdf.js の CSS 契約や DOM 順序と
いった非自明な箇所にある。実装の勘所と検証方法をそこにまとめてある。

以下は特に壊しやすい点の要約:

- テキストレイヤーは pdf.js 公式の `TextLayer` を使う（`src/front/components/PdfViewer/PdfPage.tsx`）。
  自前で span を並べると座標変換を誤って選択位置がずれる
- `src/index.css` の `.textLayer` は pdf.js 公式 CSS の移植。`--font-height` / `--scale-x` を
  `font-size` と `transform` に変換する定義を削ると、span が本文より狭くなり選択範囲がずれる
- `endOfContent` とその移動処理（`src/front/lib/textLayerSelectionGuard.ts`）が無いと、
  行末を越えたドラッグがページ全体を選択する
- 同じ canvas への並行 `render()` は pdf.js が例外を投げる。StrictMode の二重実行に備えて
  `RenderTask` を保持し再実行前に `cancel()` する
- `HighlightOverlay` はテキストレイヤーより上（`z-10`）に置きつつ、コンテナは
  `pointer-events-none`、ハイライト自身だけ `pointer-events-auto` にする。
  コンテナが pointer events を受け取るとページ全面が覆われ、選択が一切できなくなる
- 選択矩形はスクロールコンテナではなく**ページ要素**基準で保存する

### チャットのストリーミング

`POST /api/pdf/:pdfId/selections/:selId/chats` が SSE を返す。イベントは
`token` / `citation` / `done` / `error`。

- クライアントは `src/front/lib/sseParser.ts` の `createSseParser` で読む。
  SSE は**空行がブロック境界**で、`event:` は同じブロックの `data:` と対にする。
  バッファ全体から `data:` を検索すると同時到着したイベントが混線する
- `createSseParser` が返すのは `{ event, data: unknown }` まで。そのあと
  `src/front/hooks/useChatStream.ts` が `src/shared/schemas/sse.ts` の
  `chatSseEventSchema`（4 イベントの discriminated union）で `safeParse` し、通ったものだけ
  扱う。**キャストで済ませないこと**——未知の種別の出典が `CitationBadge` の描画に届く
- 送信は **必ず `useChatStream` の `sendMessage` を通す**。ポップオーバーからの初回質問も
  `useAskAboutSelection` 経由でここに来る。生 `fetch` にすると質問文の即時表示と
  「考え中…」が出なくなる
- **回答を保存できなかったときは `done` ではなく `event: error`（`CHAT_SAVE_FAILED`）を送る**。
  保存前に `done` を送ると、画面には回答が出そろっているのにリロードで消える。
  ここを `.catch(console.error)` に戻さないこと
- **`CHAT_SAVE_FAILED` だけは回答を画面に残す**。他の `event: error` は生成が途中で切れた
  ことを意味するので断片を捨てるが、これは回答が完成したうえで書き込みだけが落ちた場合で、
  消すと読むこともコピーすることもできなくなる（生成コストは既に払っている）。
  `useChatStream` がこのコードで分岐し、`chatFailureMessage` も「取得に失敗」ではなく
  「保存できませんでした」と言い換える
- ポップオーバーからの初回質問は**保存された回答を待たない**。`sendMessage` の完了を待つと
  ポップオーバーが 10 秒前後ページを覆う。閉じる合図はハイライトの保存が成功したこと
  （`useAskAboutSelection`）で、ストリーム自体の失敗は `chatErrorAtom` が受ける
- **ポップオーバーは保存が終わるまで開いたままなので、送信中フラグが要る**
  （`SelectionPopover` の `asking`）。無いと 2 回目の送信がハイライトを二重に作り、
  2 本目の回答が 1 本目を `abortChatStream` で殺す。`onSubmit` を await する型なのはこのため

### DeepSeek の呼び分け

`src/server/services/deepseekService.ts`。モデルは `deepseek-v4-flash`。

| モード      | エンドポイント                                    |
| ----------- | ------------------------------------------------- |
| 通常        | `/chat/completions`（OpenAI SDK 互換）            |
| Web 検索 ON | `/responses` に `tools: [{ type: "web_search" }]` |

Web 検索は既定で ON（`useWebSearchAtom`）。API キーは `.dev.vars` の `DEEPSEEK_API_KEY`。

出典は system prompt で `## Sources` セクションを書かせ、`parseCitations` が抽出する。
PDF 引用は `fullText` 内の位置からページ番号を割り出してジャンプ可能にしている。

ページ解決は `src/server/services/chatService.ts` の `findPageNumber` が行い、
`src/shared/schemas/book.ts` の `LocatedPage`（`{found: true, pageNumber}` か
`{found: false, miss}`）を返す。**見つからない理由を潰さないこと**——`miss` は
`no-quote`（引用文が空）/ `not-in-book`（本文に無い）/ `single-page-book`（1 ページの本）の
3 つで、読者に伝える内容がそれぞれ違う。とくに `not-in-book` は、**AI が引用を本文どおりに
書かなかった可能性**を読者が知る唯一の手がかりになる。消費者は 2 つ:

- `GET /pdf/:pdfId/locate` がそのまま返し、`useReadingLocation` の `passageMiss`
  （lookup 自体が失敗した `lookup-failed` を加えた 4 値）を経て `AppPage` の
  `PASSAGE_MISS_MESSAGE` が文言にする
- `parseCitations` が `pageMiss` として引用に載せ、`CitationBadge` の `PAGE_MISS_TITLE` が
  title にする。**引用は JSON で保存される**ため、`pageMiss` は discriminated union ではなく
  任意フィールドにしてある（この列が無い既存の行も読めるようにするため）

なお 200 ページ級の本（E2E が読む実書籍がちょうどそれ。下記「E2E の前提」の `PUBLISHED_BOOK`）
では全文をコンテキストに載せるため、最初のトークンまで **10 秒前後** かかる。
ストリーミングが壊れているのと区別すること（`read()` が複数回に分かれるかで判別できる）。

### 状態管理とルーティング

**画面に出しっぱなしにするサーバのデータは SWR、クライアントだけの状態は Jotai の atom**
（`src/front/atoms/`）。両方に同じものを載せないこと。

- `/` … 本棚（`ShelfPage`）。一覧は `useSWR("/api/pdfs")`
- `/books/:pdfId` … リーダー（`AppPage`）。本は `useBook(pdfId)` で読むので
  リロード・直リンクでも開ける。読んだ本は `PdfViewer` / `ChatArea` へ **props で**
  渡す（atom に写さない。読み手はこの 2 つだけなので prop drilling にならない）
- どちらのルートにも `errorElement` が付く（上記「失敗の運び方（neverthrow）」）

#### 狭い画面のリーダーは 1 カラム

リーダーは幅で 2 つの姿を持つ。**境界の数値を持つのは `src/front/lib/viewport.ts` だけ**
（`NARROW_MAX_WIDTH = 767`px と、そこから作る `NARROW_QUERY`。Tailwind の `md` の 1px 下）。
`useIsNarrow`（上記「`useEffect` の扱い」）も `outlineOpenAtom` もここを読む。
**同名の `src/test/viewport.ts` は別物**で、そちらは jsdom 用の `matchMedia` スタブ
（下記「jsdom に無いものは `src/test/setup.ts` が埋める」）。

**要素の親子関係が変わる分岐は `useIsNarrow` の JS で行う**（パネルがオーバーレイになる、
ページ操作の行が別の場所へ移る、など）。CSS では親子関係を書けないため。**見た目だけが変わる
ところは `md:` 接頭辞でよい**——本棚（`ShelfPage.tsx` の削除ボタン）と、リーダーのヘッダ
（`AppPage.tsx` の `md:block` / `md:ml-4` / `md:flex-none md:max-w-xs`。狭い画面で「本棚」への
リンクが折り返さないようにするためのもの）がそれ。本棚のグリッドの列数は `md:` ではなく
`sm:` / `lg:` で刻む。

| 広い画面（768px 以上）                      | 狭い画面（767px 以下）                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| 目次は横に並ぶ（`PdfOutline` の `w-60`）    | 左からのドロワー + 背後を覆う暗幕（タップで閉じる）。目次から飛んだときも閉じる      |
| PDF + チャットの 2 ペイン                   | PDF 全幅の 1 カラム                                                                  |
| チャットは右のパネル（`chatPanelOpenAtom`） | 下から出るシート `ChatSheet`（`src/front/components/ChatArea/ChatSheet.tsx`）        |
| ページ操作はページの下（スクロール内）      | `PageToolbar`（`components/PdfViewer/PageToolbar.tsx`。描くのは `AppPage`）          |
| 選択したら浮遊ポップオーバー                | 下端の `SelectionActionBar` →「AIに質問」で `SelectionPopover`（`floating={false}`） |
| ペイン境界のドラッグハンドルで幅を変える    | ハンドルは出さない（分ける相手がいない）                                             |

**この表は「何が画面に出るか」だけを決める。「どう触れるか」は幅で分けない**——タブレットは
幅が広く指しかないので、幅で分けると全部マウス向けの経路に落ち、本文を選ぶことすらできなく
なる。ノート PC の画面に触ることもタブレットにマウスを挿すこともあるので、端末単位の判定も
同じく取りこぼす。**入力の分岐はイベント自身で行う**（`touchstart` はマウスでは発火しない、
`PointerEvent.pointerType` は 1 件ごとに `"mouse"` / `"touch"` / `"pen"` を報せる）。
ジェスチャの配線は `useIsNarrow` を読まない。

| 入力                         | どう分けるか                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ピンチ・スワイプ             | `touchstart` / `gesturestart` の購読だけ。指のときしか発火しない                                                                                                      |
| 左右タップでのページ送り     | 分けない（マウスのクリックでも送る）                                                                                                                                  |
| 中央のダブルタップでの拡大   | `pointerType !== "mouse"` のときだけ（マウスには Ctrl+ホイールがある）                                                                                                |
| 選択の確定                   | 分けない。常に `useSettledSelection`（`src/front/hooks/useSettledSelection.ts`。`selectionchange` が止まり、**かつ**ポインタが離れてから `SELECTION_SETTLE_MS` 待つ） |
| ペイン境界のハンドル         | 分けない。pointer イベント + `setPointerCapture` で、マウス・指・ペンの 3 種が同じ 1 本のコードを通る                                                                 |
| hover が無い端末での常時表示 | ここだけ CSS の `@media (hover: none)`（本棚の削除ボタン。JS の分岐ではなく端末の能力そのものを問うため）                                                             |

**幅から切り離せたのは「選択が確定したと分かる仕組み」までで、確定したあと何を出すかは
まだ幅で分けている**——狭い画面は `SelectionActionBar`、広い画面は浮遊するポップオーバー。
そのため幅の広いタブレットでは、指で選んだ直後に入力欄が開いて自分でフォーカスを取り、
ソフトキーボードが上がる（`docs/PDF_TEXT_SELECTION.md` §8 が入力側の理由で禁じている状態）。
直すなら分岐を `pointerType` へ移すことになる。

ページ送りとズームの判定のうち、**帯・スワイプ・倍率の純粋な計算は
`src/front/lib/touchNavigation.ts`**（`resolveTapZone` / `resolveSwipe` / `pinchZoom`）が持つ。
**閾値は `PdfViewer.tsx` 側**にあり（`TAP_SLOP_PX` = 12px / `TAP_MAX_MS` = 500ms /
`DOUBLE_TAP_MS` = 320ms / `DOUBLE_TAP_ZOOM` = 2 倍 / `ENLARGED_ABOVE` = 1.05 倍）、
`PdfViewer` が両者を配線する。

**送ってよいかは `pointerdown` の時点で決める**（押した瞬間に `turnable()` を控える。
`turnable()` は「ポップオーバーが出ていない」かつ「選択が畳まれている」を見る）。
ポップオーバーを閉じるのはその外側を押すことで、閉じる処理は `mousedown` で先に走る。
`pointerup` で見ると何も出ていないように見え、読者が戻ろうとしただけのページが送られる。
**2 回目以降のクリック（`event.detail > 1`）も送らない**——単語をダブルクリックで選ぶ操作の
1 打目にあたるため。**拡大中（`ENLARGED_ABOVE` 超）はタップもスワイプも送らない**——
そのときの端は、ページを離れる操作ではなくページの中を動く操作。

広い画面にだけ出る**ペイン境界のハンドルは、当たり判定 44px・見た目の線は細いまま**
（`AppPage.tsx`。中の `span` が線）。`touch-action: none` が要る——無いと指のドラッグが最初の
move より前にスクロールへ吸われる。**44 は `HANDLE_WIDTH` 1 箇所だけが持つ**（`AppPage.tsx`。
親指が届く最小の寸法から採った値）。ハンドル自身の幅と、両ペインが `calc(…% - HANDLE_WIDTH / 2)`
で譲る量の両方がここを読む。譲らないと 3 つの合計がウィンドウを超え、flex が誰も勘定して
いない量だけペインを縮める。

**`chatSheetAtom`（`src/front/atoms/chatAtom.ts`。`closed` / `half`＝画面の 46% /
`full`＝82%）は URL に載せない。** `?panel=` は「広い画面でパネルを畳んだか」を指すもので、
`useReadingLocation` はそれだけを書きシートには触れない。狭い画面でも `?panel=` は書かれ
続けるが、切り替えるトグルが広い画面にしか出ないので効かない。

**シートを開く口は 2 つ**——`PageToolbar` のチャットボタンと、`AppPage` の `openChat`
（ページ上のハイライトのタップ・一覧・URL の `?selection=` 復元がすべてここを通る。
つまり `?selection=` 付きのリンクは狭い画面でもシートを `half` で開く）。half と full の
切り替えと閉じるのは `ChatSheet` 自身の `onChange`、読み手は `AppPage` だけ。

シートの作りで外してはいけない点が 3 つある。**開閉は `translateY` ではなく高さ**で行う
（`ChatSheet.tsx`。押し下げる方式だと half のとき入力欄が画面外に出る）。**シートは `main` の
中に置き、ツールバーの上で止める**（`AppPage.tsx`。読み進めることが本と回答を同時に出す
理由なので、開いていてもページ送りが残る。`PageToolbar` は `position: fixed` ではなく
`h-dvh` の flex 列で `main` の下に並ぶ兄弟）。**リーダーのシェルは `overflow-clip`**
（`AppPage.tsx`。画面外へ逃がしたシートがスクロール領域を作り、入力欄のフォーカスで
リーダーごとずれる）。

**`outlineOpenAtom` の初期値はアプリ起動時の画面幅で決まる**（`src/front/atoms/pdfAtom.ts` の
モジュール評価時に 1 度だけ）。広ければ開、狭ければ閉。本ごとに測り直しはせず、リサイズにも
追従しない。書き手は `PageToolbar` の目次ボタン・キーボードショートカット・暗幕のタップ・
目次から飛んだとき（狭い画面のみ）・広い画面のトグル。

見た目の原型は `docs/mockups/mobile.html`（依存ゼロの単一 HTML）。**正は実装**で、
モックは操作感を詰めるために作った参考物。テストの書き方は下記「jsdom に無いものは
`src/test/setup.ts` が埋める」の `setViewportWidth` を使う。

#### リーダーの URL は `useReadingLocation` が単独で書く

リロードと共有リンクで同じ状態に戻るよう、リーダーの状態は 3 つのクエリパラメータに
載っている。**書き手は `src/front/hooks/useReadingLocation.ts` 1 つだけ**で、これを
分けてはいけない——`setSearchParams` は同一 commit 内でマージされないので、書き手が 2 つ
あるとハイライトを選んだとき（`page` と `selection` が同時に動く）に片方が黙って消える。

| パラメータ  | 値                             | 反映先 atom           | 省略時の扱い                                       |
| ----------- | ------------------------------ | --------------------- | -------------------------------------------------- |
| `page`      | 1 以上の整数（例: `5`）        | `currentPageAtom`     | 1。既定値でも `?page=1` と書き出す                 |
| `panel`     | `open` / `closed`              | `chatPanelOpenAtom`   | `open`。既定値でも `?panel=open` と書き出す        |
| `selection` | ハイライトの ID（例: `01KZ…`） | `activeSelectionAtom` | チャットを開いていない（ハイライト一覧）ことを表す |

`page` / `panel` は既定値も明示するが、`selection` の「無い」は省略で表す（null を綴る
自然な形が無いため）。Chrome の「ハイライトへのリンクをコピー」が書く `#:~:text=`
フラグメント（`src/front/lib/textFragment.ts` が解析する）は `?page=` より優先する——
送り手がたまたま開いていたページより、名指しされた引用文の方が読者の目的に近いため。

`selection` の復元だけは**本（`useBook` の SWR）の到着を待つ**。ハイライトは本から読むため。
待っている間は URL の値を温存し（`pendingSelectionId`）、その間のページ送りで空の atom から
`?selection=` を消してしまわないようにしている。本から消えたハイライトを指す URL は一覧を
表示し、パラメータ自体を落とす。

**復元では現在ページを動かさない**（URL の `page` が正）。一覧から選んだときだけその
ハイライトのページへ移るので、`setCurrentPage` は `AppPage` の `handleSelectionClick` に
あり、復元と共用する `openChat` には入れない。**ここを `openChat` に戻すと、途中まで
読んで再訪したときにハイライトのページへ引き戻される。**

**チャットだけは SWR に載っていない**。`chatMessagesAtom` が持ち、履歴の読み込みは
`AppPage` の `openChat` が `resultFetcher` を直接呼ぶ。理由は、同じ状態を SSE の
ストリームがトークンごとに書き換えるため（`useChatStream`）——キャッシュに載せると
再検証が流れてきた回答を上書きしうる。**「データ取得はすべて SWR」ではない**。
イベントハンドラ起点の 1 回きりの取得（履歴・選択の作成・アップロード）は SWR を通さず
`resultFetcher` で書く（受け皿になる SWR が無いので、失敗は値で返さないと消える）。

SWR の使い方で押さえるところ:

- **fetcher は必ず `src/front/lib/fetcher.ts` の `fetcher` を通す**（上記
  「外部入力のバリデーション（zod）」）。`useSWR(key, () => fetch(...).then(r => r.json()))`
  のように生 `fetch` を渡すとスキーマ検証を素通りし、`ApiError` / `INVALID_RESPONSE`
  の防護が消える。SWR の `error` state が受け止めるので、ここは throw する `fetcher` の
  ままでよく、`resultFetcher` に替えない。現在の SWR 呼び出しは全て `fetcher` 経由。
  **JSON ではない 2 つ——PDF バイナリ（`usePdfDocument`）とチャットの SSE
  （`useChatStream`）——だけが生の `fetch` を直接使う**。どちらも SWR ではなく、拒否の
  読み取りは `fetcher.ts` の `readRefusal` を通して同じ文言に揃える
- **ルートの `SWRConfig`**（`src/front/main.tsx`）で `revalidateOnFocus` を切っている。
  ローカル単一ユーザーのアプリでデータは自分の操作でしか変わらず、focus 復帰の再検証は
  Playwright のフォーカス往復で E2E を非決定にするだけ
- **本のキーは `src/front/hooks/useBook.ts` の `bookKey(pdfId)`（= `/api/pdf/:pdfId`）1 本**。
  リーダー（`AppPage`）・ビューア・チャットパネルが同じキーを共有するので本の読み取りは
  1 回で済み、ハイライトの追加も全員に同時に映る。ハイライト一覧は
  `useHighlights` がこのエントリの `selections` から導出する（色のパレット補完込み）ので、
  **専用の atom を作らないこと**——SWR のキャッシュ自体が共有のグローバル state で、
  atom と二重管理すると必ずずれる
- **本は props、ハイライトは購読**という線引きは意図的。本の見出し（id / fileName /
  pageCount）は開いている間変わらないので props で足りる。ハイライトは `PdfViewer` が
  足して `ChatArea` が一覧する——兄弟どうしが同じ更新を見る必要があるので、
  `BookReader` へ持ち上げず同じキーの購読で共有する
- **アップロード時のキャッシュ先充填**: `FileSelector` が `POST /api/pdf/open` の結果を
  `mutate(bookKey(id), ..., { revalidate: false })` で先に書く。遷移先の
  `AppPage` がキャッシュヒットで即座に開くため。先充填の `selections` は空・
  `hasThumbnail` は推定値なので、**マウント時の再検証を止めないこと**——
  既にハイライトのある本を開き直したとき、一覧が空のまま固定される
- **リーダーの state は本ごとに作り直す**: `AppPage` が `pdfId` を key にした jotai
  `Provider` を張る。開いているチャット・選択・ページはどれも 1 冊に属するので、
  個別に reset する代わりに store ごと捨てる。本自体は store の外（SWR）にあるので残る。
  **本をまたいで残したい設定は store に置けない**——`atomWithStorage` +
  `{ getOnInit: true }` で localStorage に持たせる（`settingsAtom.ts` の
  `keybindingModeAtom` / `useWebSearchAtom` がその形）。本ごとに別の値を
  残すもの（ビューアの倍率）はキーに pdfId を入れ、`zoomAtomFor(pdfId)` が
  `chatbook:zoom:<pdfId>` の atom を Map で使い回す。**atom は毎レンダー
  作り直せない**（別のオブジェクトは別の state になる）。jotai の
  `atomFamily` を使わないのは非推奨で本を開くたびに警告を出すため
- **テストの差し替え口は 2 つある**。取得そのものを差し替えるなら DI 引数——
  `useBook(pdfId, loadBook)` / `useHighlights(pdfId, loadBook)` /
  `usePdfDocument(book, fetchFn)` / `useChatStream(fetchFn, now)` /
  `useAskAboutSelection(addHighlight, saveSelection)` /
  `ShelfPage({ loadBooks, deleteBook, extract })` / `FileSelector({ extract })` /
  `PdfViewer({ measureSelection, saveSelection })` がその口。`measureSelection` は
  ポップオーバーを開く唯一の入口で、**実 DOM 選択と pdf.js が描いたページを両方要求する
  経路（質問・保存失敗の表示・二重送信の防止）を jsdom で動かすための seam**。
  キャッシュの中身を用意したいなら `src/test/swrTestCache.tsx` の `SwrTestCache` で包む
  （SWR の既定キャッシュはモジュールレベルの singleton なので、包まないとテストが互いの
  キャッシュを見て実行順に依存する。`seed` を渡すとそのキーをサーバの代わりに使う）。
  例外は**書き込まれたキャッシュの中身を検証したいとき**で、`Map` への参照が要るため
  `FileSelector.test.tsx` は自前の `Map` を `SWRConfig` へ直接渡している

キーバインド（Vim / Emacs）は `src/front/lib/keybindings.ts` の `resolveAction` に
DOM 非依存の純粋関数として実装。`gg` や `C-c t` の2ストロークは `pending` プレフィックスで表現し、
タイマーを持たせない（挙動を決定的にしてテストできるようにするため）。

## テスト

ランナーが3つあり、それぞれ守備範囲が違う:

| ランナー              | 設定                       | 対象                                                                                |
| --------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| vitest (jsdom)        | `vite.config.ts`           | `src/**` の `*.test.ts(x)`（`src/front/**` と、workerd を要さない `src/server/**`） |
| vitest (workers pool) | `vitest.workers.config.ts` | `test/worker/**` の API（`SELF.fetch` / D1 / R2 を使うもの）                        |
| Playwright            | `e2e/playwright.config.ts` | ブラウザ実操作                                                                      |

jsdom テストと Workers pool テストは同一プロセスで共存できないため設定が分かれている
（`vite.config.ts` は `process.env.VITEST` のとき `cloudflare()` を無効化する）。

**jsdom 側は `include` を書かず `exclude` だけで拾っている**（`node_modules` / `dist` /
`test/worker/**` / `e2e/**` / `.claude/**` を除外）。そのため実装とコロケーションした
`src/server/services/*.test.ts` も自動的に jsdom で走る。バインディングを触らない純粋な
サーバロジック（`chatService` の引用パース、`deepseekService` の SSE パースを注入 fetch で
叩くもの）はこちらで書き、workerd の実物が要るものだけ `test/worker/**` に置く。
**`include` を足して絞ると、これらが無言で走らなくなる**ので注意。

### jsdom に無いものは `src/test/setup.ts` が埋める

jsdom はレイアウトを持たないので、幅にまつわる API がどれも無い。`setup.ts` が
`scrollIntoView` / `DOMMatrix` に加えて `ResizeObserver`（何も報せないスタブ）と
`matchMedia`（`src/test/viewport.ts` の差し替え可能なスタブ）を置く。あわせて
`asyncUtilTimeout` を 5000ms にしている——選択の確定を 250ms 待つ経路があり、既定の
1000ms だと並列実行の負荷で毎回違うテストが落ちるため。

**`matchMedia` の既定は 1280px（デスクトップ）**にしてある。狭いレイアウトを前提にしない
既存のテストを 1 行も書き換えずに済ませるため。狭い幅で試すときは
`src/test/viewport.ts` の `setViewportWidth(PHONE_WIDTH)`（`PHONE_WIDTH` は 390px で、
Playwright の `mobile` プロジェクトと同じ幅）を呼ぶ。マウント後に幅を変えるなら `act` の中で。
幅は `setup.ts` の `afterEach` で毎回戻るので、テストの実行順に依存しない。

**タッチ対応をどこでテストするかは 5 段に分かれる**:

| 何を                                                    | どこで                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ジェスチャの判定そのもの（帯・スワイプ・倍率）          | 純関数の単体テスト `src/front/lib/touchNavigation.test.ts`                                                              |
| 選択がいつ確定するか（押下・離す・通知の連続）          | jsdom + 合成 pointer イベント `src/front/hooks/useSettledSelection.test.tsx`                                            |
| 幅で変わる分岐（何が出る・出ない、どこへ繋がる）        | jsdom + `setViewportWidth(PHONE_WIDTH)`（`AppPage.test.tsx` / `PdfViewer.test.tsx`）                                    |
| 入力の種類で変わる分岐（`pointerType` / `detail`）      | E2E のみ（`e2e/chatbook.spec.ts` のマウスの端クリックと、質問ボックスを閉じるクリック）。jsdom には要素の寸法が無いため |
| 実際のタップとレイアウト                                | `e2e/mobile.spec.ts`（project `mobile`）                                                                                |
| 幅が広いまま指で触る組み合わせ                          | `e2e/tablet.spec.ts`（project `tablet`）                                                                                |
| 長押し選択・OS の選択メニュー・ソフトキーボード・ピンチ | 実機（ヘッドレスでは届かない。→ `docs/PDF_TEXT_SELECTION.md` §8）                                                       |

**`tablet` が独立して要るのは、幅ではなく入力で分けたことがほかのどこでも検証できないから**。
`mobile` は幅が狭いので幅で分けても通り、`desktop` はマウスしか使わないので指の経路を通らない。
その交差点（広い画面 × 指）だけが、幅で分けた実装をタブレットで壊す。**ただし E2E は CI にも
`pre-push` にも載っていない**（CI は `vp test` / worker のテスト / `vp check` / `vp build` だけ、
`pre-push` は `vp check` + `vp build` だけ）。入力で分ける約束を壊していないかは、
`pnpm run test:e2e --project=tablet` を手で走らせるまで誰も気付かない。

**jsdom で確かめられないもの**は E2E に置く。ページを描けないので、目次のドロワーのように
「描かれたページがあって初めて出るもの」はここでは検証できない（`PdfViewer` の
オーバーレイはポップオーバーか pdf.js のドキュメントが無いと DOM に入らず、
ポップオーバー経由だと外側 mousedown で先に閉じてしまう）。

### `.claude/**` を除外している理由

Claude Code はエージェント用の worktree を `.claude/worktrees/` に作る。これはこのリポジトリの
まるごとのチェックアウトなので、除外しないとメインクローンの `vp check` と `pnpm test` が
**別ブランチのファイルを拾う**。実際に起きるのは次の 2 つ:

- 作業中の未整形ファイルで `vp check` が落ちる（メインクローンのソースは健全なのに）
- worktree 側の `e2e/**` と `test/worker/**` が jsdom の実行に混ざり、
  `Playwright Test did not expect test() to be called here` や
  `Failed to resolve import "cloudflare:test"` で落ちる

`vite.config.ts` の `AGENT_WORKTREES` を `fmt.ignorePatterns` / `lint.ignorePatterns` /
`test.exclude` の 3 箇所に渡している。**各 worktree の中で実行する `vp check` は自分の
チェックアウトしか見ない**ので影響を受けず、CI もクリーンな checkout なので元から無関係。

### E2E の前提

- **プロジェクトが 3 つある**。読者の操作を決めるのは 2 つ——ウィンドウ幅がレイアウトを、
  ポインタの種類が入力の経路を決める。どちらも 1 回の実行に混ぜられないので、意味のある
  組み合わせごとに実行を分けている。`desktop` は既定幅（1280×720 px）をマウスで触って
  `e2e/chatbook.spec.ts`、`mobile` は 390×844 px・`deviceScaleFactor: 3`・`isMobile` / `hasTouch`（Playwright の `tap()` が使える）で `e2e/mobile.spec.ts`、
  `tablet` は 1024×768 px・`hasTouch` のみ（`isMobile` は付けない）で `e2e/tablet.spec.ts`。
  1 つだけ走らせるなら `pnpm run test:e2e --project=tablet`。新しいテストは、狭い画面の話なら
  `mobile`、指で触る話なら `tablet`、それ以外は `desktop` に置く。
  **`tablet` が見るのは 2 ペインのまま指で触ったとき**——選択・端のタップ・ハンドルのドラッグ・
  hover が無い端末での削除ボタン。幅で分けた実装はここだけで壊れる（上記「タッチ対応を
  どこでテストするか」）。**ただし指の長押し選択そのものは合成できない**ので、選択のテストは
  ポインタを送らず `Range` API で作り、`selectionchange` で拾われることまでを見る。
  **ハンドルを指でドラッグするには CDP の `Input.dispatchTouchEvent` が要る**
  （`setPointerCapture` はブラウザが実際に追跡しているポインタを要求するので、手で組み立てた
  `pointerdown` では捕捉が成立しない）
- **`workers` は 1**。3 つの spec は同じ D1 / R2 と同じ本（fixture が同じファイルなので
  同じ `pdfId`）を共有し、それぞれ開始時にその本のハイライトを全削除する。並行させると
  片方が、もう片方の検証している最中のハイライトを消す
  **`devices["iPhone 14"]` は使わない**——WebKit のインストールが要るうえ、iOS 固有の挙動
  （長押し選択と OS の選択メニューの競合、ソフトキーボードとシートの重なり）はどのみち
  ヘッドレスでは確かめられない。そこは実機で見る。**ピンチも E2E では検証しない**
  （Playwright は指を 2 本送れない）。判定は `src/front/lib/touchNavigation.test.ts` が持つ
- **サーバーは Playwright が自動起動する**（`e2e/playwright.config.ts` の `webServer`）。
  下記の E2E 専用ストアを `rm -rf` してから、`wrangler d1 migrations apply`（`--persist-to` で
  そのストアを指す）と `vp dev --port <port> --strictPort` を順に実行するので、
  マイグレーション未適用の worktree でもそのまま走る。ここだけ `pnpm run db:migrate:local` を
  使わないのは、永続先を下記の E2E 専用ディレクトリへ向けるため。`reuseExistingServer: false`
  なので起動済みサーバーには相乗りせず、必ずこのチェックアウトのコードでテストする
- **ポートは worktree のパスから決定的に導出する**（5175〜5674 の範囲。`E2E_PORT` で上書き可）。
  5173 固定だと別クローンの `vp dev` に誤接続したまま「成功」しうるため。`--strictPort` により
  導出ポートが埋まっていれば黙って別ポートへ逃げず即座に失敗する
- **E2E は dev サーバーとは別の D1 / R2 を使う**。Playwright が
  `E2E_PERSIST_PATH=.wrangler/e2e-state` を渡し、`vite.config.ts` がそれを
  `cloudflare({ persistState: { path } })` に載せる（未設定なら既定の `.wrangler/state`）。
  **分けている理由は、テストがアップロードした本が読書中の本棚に現れないようにするため**。
  wrangler の `--persist-to` も plugin の `persistState` も渡したパスの下に `v3` を作るので、
  マイグレーションと Worker が同じストアを指せる
- **E2E のストアは実行のたびに作り直す**ので、前回の残骸に依存したテストは書けない。
  裏返すと、落ちた run のストアは次の run の冒頭までは残っている。中身を見たいときは
  `E2E_PERSIST_PATH=.wrangler/e2e-state vp dev` で同じストアを本棚から開く
- **同一 run 内のハイライトは残る**。ハイライトはテキストレイヤーの上に乗るため、先行テストの
  残骸があると後続の選択テストを壊す。各 spec が持つ `openTestBook`（`chatbook.spec.ts` /
  `tablet.spec.ts` / `mobile.spec.ts` に別々の実装がある。共有していない）が開始前に
  selection を全削除する
- **API が閉じているので、どのテストもまずログインする**。各 spec の `logIn` が
  `.dev.vars` のローカル用の資格情報で `POST /api/auth/login` を叩き、Cookie を
  ブラウザコンテキストに置く（Playwright は `page.request` と画面で Cookie を共有する）。
  `openTestBook` はその中で呼ぶが、**それを通らないテストは自分で `logIn` を呼ぶ**
- **テスト用 PDF はコードから生成し、生成物をコミットしてある**（`e2e/fixtures/test-book.pdf`）。
  ページ数・目次のネストとページ・図版ページ・各ページの本文は
  `e2e/fixtures/testBookManifest.ts` にあり（`PAGE_COUNT` は現在 12）、spec もそこを読むので
  数値を直接書かない。**manifest か `generateTestBook.ts` を変えたら
  `node e2e/fixtures/generateTestBook.ts` で作り直し、PDF もコミットする**
  （`.ts` を直接実行するので Node 24 が要る）。編集の前に manifest のコメントを読むこと——
  章より先に節のページを置くと生成が落ちる、表紙に空白を入れると span が増えて選択テストの
  前提が崩れる、といった制約がそこにある。フォントは `e2e/fixtures/.cache/` へ自動ダウンロード
  （gitignore 済み）。同じ pdfkit・同じフォントなら出力はバイト単位で再現する
- **1 本だけ実書籍を要求するテストがある**（`e2e/chatbook.spec.ts` の
  `a book with CID-keyed fonts renders without asking for a CMap`）。生成 fixture は使う
  グリフをすべて埋め込むので **`cMapUrl` が無くても白紙にならず**、出版された PDF の
  CID-keyed フォントだけがあの経路を通る。読む本は `PUBLISHED_BOOK` 定数が指す
  `~/Documents/資料/本/Web開発者のための［入門］Cloudflare-Workers-…_00.pdf`（209 ページ）で、
  無い環境では**このテストだけ**がスキップされる。**pdf.js のアセット周りに触ったら、
  実書籍のある環境で必ず走らせること**——skip のまま全 green でも白紙回帰は検出できない
- **ドラッグしたのに何も選ばれないテストに当たったら、ヘッドレス Chromium の横位置を疑う**。
  ページの `getBoundingClientRect().left` の小数部が .734375 になる位置に来ると、ボタンを
  押したままの移動に選択を伸ばさず新しいキャレットを置き直し、ドラッグが何も選ばなくなる。
  切り分けは 3 手——ページの `left` を測って小数部を見る、
  `pnpm run test:e2e --project=desktop -g "<名前>" --headed` で同じ幅を再現して通るなら実装では
  ない、ウィンドウ幅を 1px ずらす。`main` でも同じ位置なら再現するので、ビューアの作りとは
  無関係なブラウザ側の癖。**踏んだテストだけ幅を固定する**（`e2e/chatbook.spec.ts` の
  "overshooting a line…" が既定の 1280px から 1px ずらして 1281px を指定しているのがそれ。
  ほかの実ドラッグのテストは既定幅か project の `viewport` のままでよい）
- UI の回帰テストを足したら、**実装を壊した状態で落ちること**を必ず確認する。
  ここは「動いていないのに通る」テストが生まれやすい。例: 計測用 canvas はサイズが 0 になる
  瞬間があるため box では検出できず `display` を見る必要があった。fixture の表紙に色を敷くのも
  同じ罠で、文字が 1 つも描けなくても「白紙ではない」判定が通ってしまう（だから表紙は白地に
  文字だけで描いている）

## 実装方針

- TDD（RED→GREEN→REFACTOR）
- ロジックは DOM に依存しない純粋関数へ切り出して単体テストする
  （`keybindings.ts` / `sseParser.ts` / `isSubmitKey.ts` がその例）
- 日本語入力を壊さないこと。Enter の送信判定は `isSubmitKey` を使い、IME 変換中
  (`isComposing` / `keyCode === 229`) は送信しない
- `worker-configuration.d.ts` は commit 済みの生成物。bindings か `main` を変えたときだけ
  `vp exec wrangler types` で再生成して commit する
- `wrangler.jsonc` の `assets.directory` は必ず `./dist/client`。トップレベル `./dist/` にすると
  Worker のビルド成果物（`.dev.vars` を含む）まで静的配信されてしまう
