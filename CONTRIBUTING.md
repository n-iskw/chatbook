# Contributing

作者 1 人が自分のために作っている読書用アプリなので、**機能追加の提案は採否が読めません**。
手を動かす前に Issue で相談してください。バグ報告と、その修正の Pull Request は歓迎します。

脆弱性は Issue ではなく [SECURITY.md](SECURITY.md) の手順で報告してください。

## 開発環境

セットアップとテストの回し方は [README](README.md#ローカル開発) にあります。`.dev.vars` を
用意しないと API がすべて 401 になり、画面も E2E も動きません。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm run db:migrate:local
pnpm exec vp dev
```

## 変更を出す前に

```bash
pnpm exec vp check     # フォーマット + lint + 型チェック（--fix で自動修正）
pnpm test              # フロント単体（jsdom）
pnpm run test:worker   # Worker 単体
```

この 3 つは CI でも走ります。**E2E（`pnpm run test:e2e`）は CI に載っていない**ので、
ビューアの描画・選択・ページ送りに触ったときは手元で走らせてください
（`desktop` / `tablet` / `mobile` の 3 プロジェクトがあり、幅とポインタの種類で
通る経路が変わります）。

## 設計の背景を読む

判断とその理由は [`CLAUDE.md`](CLAUDE.md) に、テキスト選択とハイライトの実装は
[`docs/PDF_TEXT_SELECTION.md`](docs/PDF_TEXT_SELECTION.md) にあります。
**pdf.js の座標変換や DOM の契約は見た目では気付きにくい**ので、その辺りに触るなら
先に読んでください。

## コミット

- [Conventional Commits](https://www.conventionalcommits.org/) 形式（`fix:` / `feat:` /
  `docs:` など）で、1 コミット 1 関心事にしてください
- 振る舞いを変える変更とリファクタリングは分けてください
- テストは実装と同じディレクトリに置きます（`__tests__/` へは隔離しません）
