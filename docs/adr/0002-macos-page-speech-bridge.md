# ADR 0002: 表示中のPDFページはmacOS Speak selectionで読み上げる

- Status: Accepted
- Date: 2026-08-16

## Context

ブラウザ標準の `SpeechSynthesis` と `AVSpeechSynthesizer` は、PDFの選択範囲を読むには使えるが、
macOSの「Speak selection」で使われるSiri / Neural音声と同じ音声経路ではない。chatbookはMac上で
ローカル開発する運用があり、表示中のページ全体をSpeak selectionと同じ音声で再生したい。

## Decision

表示中のページの本文を画面外の専用テキスト領域の選択範囲にし、ローカルHTTPブリッジを通して
Swift製のヘルパーへ開始・停止を渡す。PDFの可視テキストレイヤーや質問用の選択UIは変更しない。
ヘルパーはアクセシビリティ用のCGEventとして `Option + Esc` を現在フォーカスされているブラウザへ送る。
macOSのSpeak selectionが選択範囲を読み上げるため、
macOS側で選んだSiri / Neural音声と発音設定がそのまま適用される。ブリッジに接続できない場合や
テキストレイヤーが未描画の場合は、画面上のページ再生だけブラウザの `SpeechSynthesis` にフォールバックする。

ブリッジは `127.0.0.1` にのみbindし、既定ではローカル開発画面のOriginだけを
許可する。デプロイ済みWorkerからMac音声へ接続する構成にはしない。

## Consequences

- 現在ページの「このページを読む」操作を追加できる。
- ページを移動すると、前のページの音声は停止する。
- Speak selectionの完了イベントはアプリから取得できないため、再生中は停止操作だけを提供する。
- APIキーや外部音声サービスの費用は不要になる。
- Mac上で別途 `pnpm run speech:bridge` を起動する必要がある。
- ブリッジを起動したターミナルにmacOSのアクセシビリティ権限が必要になる。
- 音声はMac側で再生されるため、ブラウザを別端末から操作する用途には使えない。
- Mac以外では既存のブラウザ音声へフォールバックする。

## Evidence

- [AVSpeechSynthesizer](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)
