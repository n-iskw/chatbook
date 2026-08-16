# 接続先とモデルを差し替える

- 種別: 手順書
- 対象: 回答を書く LLM の接続先（プロバイダ）・モデル・Web 検索の可否の設定と、その乗り換え
- 想定読者: 自分のインスタンスを既定の DeepSeek 以外へ向けたい人
- 最終更新: 2026-08-15

デプロイそのものの手順は [README の「デプロイ」](../README.md#デプロイ) にある。

## 何で決まるか

回答を書くのは、**接続先（プロバイダ）とモデル**の組み合わせ。4 つの環境変数で決まり、
**接続先とモデルを設定しなければ DeepSeek** になる。

| 変数                       | 値の例                      | 空 / 未設定のとき                                          |
| -------------------------- | --------------------------- | ---------------------------------------------------------- |
| `LLM_API_KEY`              | `sk-…`                      | チャットが 500（`CONFIG_ERROR`）で返る                     |
| `LLM_BASE_URL`             | `https://api.openai.com/v1` | `https://api.deepseek.com`                                 |
| `LLM_MODEL`                | `gpt-5.2`                   | `deepseek-v4-flash`                                        |
| `LLM_WEB_SEARCH_SUPPORTED` | `false`                     | 対応しているものとして扱う（`"false"` / `"0"` だけが否定） |

（既定値の正は `src/server/services/llmService.ts` の `resolveLlmConfig`。この表はその写し。）

**すべて文字列。**とくに `LLM_WEB_SEARCH_SUPPORTED` は文字列 `"false"` / `"0"` との
完全一致でしか否定として読まないので、`wrangler.jsonc` に JSON の真偽値（`false`）で書くと
「対応あり」に落ちる。

`LLM_BASE_URL` は **`/chat/completions` や `/responses` を後ろに繋ぐ 1 つ手前まで**を書く
（`/v1` が要るかはプロバイダの流儀次第。OpenAI は要り、DeepSeek は要らない）。
**末尾にスラッシュを付けないこと**——通常のチャットは SDK が吸収するが、Web 検索は
文字列を繋ぐだけなので `…/v1//responses` になって Web 検索だけが壊れる。

差し替え先に求める条件は 2 つ。**OpenAI 互換の `/chat/completions` を持つこと**と、
**`stream_options: { include_usage: true }` を受け付けること**（毎回送るので、未知の
パラメータを拒む実装では通らない）。プロバイダごとの差を吸収する層は持っていない。

## どこに書くか

秘密は `LLM_API_KEY` だけ。残り 3 つは `wrangler.jsonc` の `vars` に書く:

```jsonc
"vars": {
  "LLM_BASE_URL": "https://api.openai.com/v1",
  "LLM_MODEL": "gpt-5.2",
  "LLM_WEB_SEARCH_SUPPORTED": "false"
}
```

**`wrangler.jsonc` は git に入る。`LLM_API_KEY` をここに書かないこと**（キーは
必ず `pnpm exec wrangler secret put`）。また **`vars` を足したら `worker-configuration.d.ts` が
書き換わる**（生成元は `wrangler.jsonc` の `vars` と `.dev.vars` のキー。
→ [README の「ローカル開発」](../README.md#ローカル開発)）。
自分の fork では再生成された型を一緒にコミットすること。

ローカルで試すときは `.dev.vars` に書く（`vars` より優先される）。空のままなら
既定値に落ちるので、値を入れるまでは DeepSeek のまま。

## Web 検索を持たないプロバイダ

Web 検索は Responses API（`/responses` + `web_search` ツール）を使う。これを持たない
プロバイダでは `LLM_WEB_SEARCH_SUPPORTED` を `"false"` にする。設定メニューから
Web 検索のトグルが消え、サーバも常に `/chat/completions` で尋ねるようになる。

**対応しているか分からなければ `"false"` にしておくのが安全。**間違いの代償が非対称で、
不要に `"false"` にしても回答は出るが、非対応なのに対応ありのままにすると Web 検索を
有効にした質問がすべて失敗する。あとから外せる。

## Mac 上の Codex を使う

Codex は API URL を持つ通常の外部プロバイダではないため、Cloudflare Worker から直接は
呼び出せない。ローカル開発では、リポジトリの `scripts/codex-bridge.mjs` が Mac 上の
Codex App Server を read-only で起動し、OpenAI 互換のエンドポイントとして見せる。

1. Codex CLI をインストールし、Mac 上でログインする。
2. 別ターミナルでブリッジを起動する。

   ```bash
   export CODEX_BRIDGE_TOKEN="$(openssl rand -hex 32)"
   pnpm run codex:bridge
   ```

3. `.dev.vars` の LLM 設定を次のようにする。`LLM_API_KEY` はブリッジ起動時のトークンと
   同じ値にする。

   ```dotenv
   LLM_API_KEY=<CODEX_BRIDGE_TOKEN と同じ値>
   LLM_BASE_URL=http://127.0.0.1:8788/v1
   LLM_MODEL=codex
   LLM_WEB_SEARCH_SUPPORTED=false
   ```

4. `pnpm exec vp dev` で chatbook を起動する。

ブリッジは `127.0.0.1` にのみ bind し、AIの質問は同時に1件ずつ処理する。Codexの
ファイル編集・ネットワークアクセス・Web検索はこの経路では許可しない。iPadから読む場合も、
ブラウザはMac上のchatbookへアクセスし、chatbook WorkerがMac上のブリッジへ接続する。
ブリッジ自体をLANへ公開する必要はない。

## 乗り換えの手順

Worker が既にあるので、`secret put` を先にできる（初回デプロイが「デプロイ →
`secret put`」なのは、Worker がまだ無いと対話プロンプトが出るためで、そこと逆になる）。

```bash
# 1. wrangler.jsonc の vars に接続先とモデルを書く（上記「どこに書くか」）
# 2. 新しいプロバイダのキーを入れる
pnpm exec wrangler secret put LLM_API_KEY
# 3. vars を反映する
pnpm run deploy
# 4. 古いキーを片付ける
pnpm exec wrangler secret delete DEEPSEEK_API_KEY   # 旧バージョンから移ってきた場合のみ
```

**2 と 3 の間の数十秒は、新しいキーで古い接続先を叩くのでチャットが失敗する。**

## うまくいったかの確認と、失敗の切り分け

**本を 1 冊開いて 1 問投げるのが唯一の確認方法。**接続先とモデル名は
`GET /api/config` にも出さない（画面が必要とするのは Web 検索の可否だけ）ので、
デプロイ時の 401 に相当する外形チェックはない。回答がストリームで流れてくれば成功。
`"false"` にしたなら、設定メニューから Web 検索のトグルが消えていることも証拠になる
（**開いたままのタブでは変わらない。リロードしてから見ること**）。

失敗したときの切り分けは 3 通り。

| 見え方                                | 原因                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| 500（`CONFIG_ERROR`）                 | `LLM_API_KEY` が空。ほかは全部届いている                        |
| チャットパネルにエラー（HTTP は 200） | キー違い / 接続先の打ち間違い / モデル名違い / Web 検索の非対応 |
| 401                                   | ログインが切れている。設定とは無関係                            |

2 行目はサーバまでは届いていて、上流が断ったか届かなかったケース。中身は
`pnpm exec wrangler tail` でサーバのログから読める。

## 元に戻す

`secret put` だけでは戻らない。`wrangler.jsonc` の `vars` から 3 つを消して
`pnpm run deploy` し、DeepSeek のキーで `pnpm exec wrangler secret put LLM_API_KEY` を
入れ直す。

## 旧バージョンから移ってくる場合

キーの名前が `DEEPSEEK_API_KEY` から `LLM_API_KEY` に変わった。**接続先とモデルは
既定値のままで今までどおり DeepSeek に向くが、キーだけは入れ直しが要る**
（入れないままだとチャットが 500 で止まる）。本番は上記「乗り換えの手順」の 2 → 3 → 4、
ローカルは `.dev.vars` の `DEEPSEEK_API_KEY=` を `LLM_API_KEY=` に書き換える。
