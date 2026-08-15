# ADR 0001: Codex は Mac 上のローカルブリッジ経由で接続する

- Status: Accepted
- Date: 2026-08-16

## Context

chatbook は Cloudflare Workers 上で動く PDF リーダーで、LLM への接続は
OpenAI 互換の `/chat/completions` を前提にしている。一方、Codex は利用者の
Mac にログイン済みのローカル実行環境であり、Worker から Mac のプロセスや認証状態を
直接参照することはできない。

## Decision

ローカル開発時だけ Node.js の `scripts/codex-bridge.mjs` を起動し、Codex App Server
を read-only / approvalPolicy=never で呼び出す。ブリッジは `127.0.0.1` に bind し、
共有トークンで保護した OpenAI 互換 `/v1/chat/completions` を公開する。chatbook 側は
既存の `LLM_BASE_URL` と `LLM_API_KEY` だけを使って接続し、デプロイ済みWorkerから
ローカルCodexへ接続する構成は採用しない。

## Consequences

- PDF本文・会話履歴はMac上のローカルブリッジからCodexへ渡る。
- 既存のチャット保存、引用解析、ストリーミングUIを変更せずにCodexを利用できる。
- Codex CLIのログイン状態とインストールがMac側に必要になる。
- ファイル編集とネットワークアクセス、Web検索はこの初期実装では無効にする。
- ブリッジはリクエストを直列化する。複数質問の同時処理は後続の課題とする。

## Evidence

- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Codex SDK](https://developers.openai.com/codex/sdk/)
- [Codex CLI](https://developers.openai.com/codex/cli/)
