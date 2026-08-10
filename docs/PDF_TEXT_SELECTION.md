# PDF のテキスト選択とハイライト

- 種別: 実装ガイド
- 対象: pdf.js でレンダリングした PDF を、Web ページのテキストのように選択し、選択箇所をハイライトとして永続化する機能
- 想定読者: この機能を別のアプリで一から実装する人
- 最終更新: 2026-08-10

pdf.js の公式 viewer をそのまま使わず、`TextLayer` などの低レベル API を組み合わせて自作する場合の落とし穴をまとめる。大きく 3 系統ある。

- **選択位置がずれる・暴走する** (§2〜§5) — 見た目には現れないため、動いていると誤解したまま実装が完了しがち
- **描画品質と選択表示の一貫性** (§6〜§7) — 目には見えるが、原因が pdf.js の内部仕様にあって特定しにくい
- **指では成立しない前提** (§8) — マウス向けに書いたコードは、そのままでは触っても何も起きない

本文中のファイルパスはこのリポジトリでの配置例。別のアプリでは対応する場所に読み替える。

## 結論 — 実装チェックリスト

上から順に実装する。§2 の CSS が入っていないと span の位置自体が正しくないため、§3 以降は検証できない。

1. **pdf.js 公式の textLayer CSS を全部持ってくる** (→ §2)
2. **`endOfContent` を自前で生成し、選択に追従させる** (→ §3)
3. **`Range.getClientRects()` をそのまま描かない**。行ごとにまとめ、ガードの矩形を除く (→ §4)
4. **ハイライトはページ番号と計測時のページ幅をセットで保存する** (→ §5)
5. **canvas は `devicePixelRatio` 倍で描く** (→ §6)
6. **ページ送りのチラつき対策は canvas だけに適用する** (→ §6)
7. **入力欄にフォーカスすると選択は解除される**。矩形をスナップショットして描き続ける (→ §7)
8. **タッチでは `mouseup` を選択の合図に使えない**。`selectionchange` が止まった時点を待つ (→ §8)

## 1. 3 層構造

PDF の 1 ページは重なった 3 つのレイヤーで表現する。

```
┌─ ハイライト層 (z-10) ── 色つきの矩形。保存済みハイライトと選択中のマーク
├─ textLayer ──────────── 透明な <span> の集まり。ここを選択している
└─ canvas ─────────────── pdf.js が描いたページの絵。文字は画像
```

canvas に見えている文字はピクセルであってテキストではないので選択できない。そこで pdf.js は、PDF から抽出したテキストを透明な `<span>` として canvas の上に敷く。ユーザーが「本文をドラッグしている」と感じる操作は、実際にはこの見えない span を選択している。

DOM 構造は次の形にする。`.textLayer` は `position: absolute; inset: 0` なので、**ラッパーに `position: relative` が必要**。これを忘れるとレイヤーが別の祖先を基準に配置され、丸ごとずれる。

```html
<!-- ページのラッパー。position: relative が必須 -->
<div style="position: relative; width: fit-content">
  <!-- pdf.js がページを描画する -->
  <canvas></canvas>
  <!-- pdf.js が透明な span を並べる -->
  <div class="textLayer"></div>
  <!-- 自前のハイライト -->
  <div class="highlight-overlay"></div>
</div>
```

実装は `src/front/components/PdfViewer/PdfPage.tsx`、ハイライト層は `HighlightOverlay.tsx`。

ハイライト層は `pointer-events: none` にし、ハイライト自身だけ `pointer-events: auto` に戻す。層全体がポインタを受け取ると、その下の textLayer に届かず**選択が一切できなくなる**。

## 2. textLayer の CSS は公式のものを使う

`pdfjs-dist/web/pdf_viewer.css` の `.textLayer` 関連定義を**すべて**持ってくる。位置指定だけを真似た自前の CSS では動かない。

pdf.js は各文字列を PDF のフォントメトリクスで測り、結果を**カスタムプロパティとして書き込むだけ**で、それを実際のサイズや変形に変換するのは CSS 側の責務になっている。

| プロパティ                            | 書き込み先     | 意味                                                                        | CSS 側での用途                                                                       |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `--font-height`                       | span           | 文字の高さ (px、例: `15.60px`)                                              | `font-size` の算出                                                                   |
| `--scale-x`                           | span           | ブラウザのフォント幅を PDF の字幅に合わせる倍率 (無次元、例: 1.005 / 1.094) | `transform: scaleX()`                                                                |
| `--rotate`                            | span           | 文字の回転角 (deg、例: `0deg` / `90deg`)                                    | `transform: rotate()`                                                                |
| `--min-font-size`                     | textLayer      | 最小フォントサイズの補正係数 (無次元、通常 1)                               | `--text-scale-factor` と `--min-font-size-inv` の算出                                |
| `--scale-round-x` / `--scale-round-y` | (CSS 側で定義) | コンテナ寸法を丸める単位 (px、公式は `1px`)                                 | `TextLayer` がコンテナの `width` / `height` を `round(down, …)` で上書きする際に参照 |

アプリ側は、描画に使った **CSS スケール** (§6 の `devicePixelRatio` を掛ける前の値) を `--scale-factor` として textLayer 要素に設定する。CSS がそこから `--total-scale-factor` を導出する。`--user-unit` は PDF の UserUnit に対応する値で、通常は 1 固定。

必要な定義は `src/index.css` にある。カスタムプロパティの契約に関わる部分は次の 3 ブロックで、**そのまま写す**。`.textLayer` の `position` / `inset` / `overflow` など見た目に関わる宣言は用途に合わせて調整してよい。

```css
.textLayer {
  --user-unit: 1;
  --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}

/* これが無いと span が絶対配置されず、canvas の上に乗らない */
.textLayer span,
.textLayer br {
  position: absolute;
  white-space: pre;
  color: transparent;
  transform-origin: 0 0;
}

.textLayer > :not(.markedContent),
.textLayer .markedContent span:not(.markedContent) {
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
```

**欠けたときに何が起きるか**: span がブラウザ既定のフォントで並ぶため、canvas の文字より一律に狭くなる。左端は一致するので一見正しく見えるが、行末に向かってズレが蓄積し、**ドラッグしても見た目より短い範囲しか選択できない**。実測では 12 文字の span で右端が 33px 足りなかった。

あわせて、pdf.js が文字幅の計測用に `<body>` へ追加する非表示 canvas を隠す指定も要る。無いと既定の 300×150 のままレイアウトに参加し、ページ下部に余白が出る。

```css
.hiddenCanvasElement {
  display: none;
}
```

### 確認方法

span を赤枠で囲み、canvas の文字と一致するか目視する。

```js
document.querySelectorAll(".textLayer span").forEach((s) => (s.style.outline = "1px solid red"));
```

数値でも確認できる。

```js
const span = document.querySelector(".textLayer span");
getComputedStyle(span).transform; // "none" なら scaleX 補正が効いていない
getComputedStyle(span).fontSize; // 16px 等の既定値なら CSS が欠けている
```

## 3. 選択の暴走を止める (`endOfContent`)

**pdf.js は span を PDF の描画順に並べる**。読み順とは限らない。本文と図が混在するページでは、図中のラベルが 2 つの段落の間に挟まることがある。実測したページでは、DOM 順が視覚的に逆行する箇所が 104 span 中 13 個あった。

選択は DOM 上の範囲なので、**行末より外側でドラッグを終えると、DOM 順で後続にある span まで一気に選択される**。実測では 2 行のつもりが 30 span、ハイライトがページ下端まで伸びた。

pdf.js 公式は `endOfContent` という要素を選択の端の隣へ動かし、行き過ぎ分をそこで受け止める。これを担うのは公式の `TextLayerBuilder` であり、**`TextLayer` だけを使う場合は自前で用意する**。`textLayer.render()` の完了後に生成して textLayer へ `append` する。

```ts
const endOfContent = document.createElement("div");
endOfContent.className = "endOfContent";
textLayerDiv.append(endOfContent);
```

CSS とスクリプトの**両方**が必要。

```css
.textLayer .endOfContent {
  position: absolute;
  inset: 100% 0 0; /* 通常は本文の下に隠れている */
  display: block;
  z-index: -1;
  cursor: default;
  user-select: none;
}

.textLayer.selecting .endOfContent {
  top: 0; /* ドラッグ中はページ全面を覆う */
}
```

スクリプト側 (`src/front/lib/textLayerSelectionGuard.ts`) の要点は 4 つ。

1. `pointerdown` で textLayer に `selecting` クラスを付ける
2. `selectionchange` で、**いま動いている側の端**の隣に `endOfContent` を移動する
3. 移動時に `endOfContent` へ textLayer と同じ `width` / `height` と `user-select: text` をインラインで与える。これがガードを選択可能にし、§4 で除く必要のある矩形を生む原因でもある
4. `pointerup` / `blur` で末尾へ戻し、寸法指定と `selecting` を外す

「動いている側の端」は、前回の Range と境界を比較して判定する。

```ts
const movingStart =
  previousRange !== null &&
  (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
    range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0);

let anchor = movingStart ? range.startContainer : range.endContainer;
if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;

// offset 0 で終わる Range は、実際には直前の要素で終わっている
if (!movingStart && range.endOffset === 0) {
  do {
    while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
    anchor = anchor?.previousSibling ?? null;
  } while (anchor && !anchor.childNodes.length);
}
```

**挿入位置の判定を間違えやすい**。`Element.closest()` は自分自身にもマッチするため、素直に書くと選択の端が textLayer 自身になったとき (空白領域へのドラッグ) に条件が成立し、`endOfContent` が textLayer の**親**へ移動してしまう。

```ts
// NG: anchor 自身から探すと、anchor === textLayer のとき通ってしまう
if (anchor.closest(".textLayer") === textLayer) { ... }

// OK: 親から探す。端がレイヤー自身なら一致しないので移動しない
const parent = anchor.parentElement;
if (parent?.closest(".textLayer") === textLayer) {
  parent.insertBefore(endOfContent, movingStart ? anchor : anchor.nextSibling);
}
```

外に出ると `.textLayer .endOfContent` が効かなくなり `position: static` の全幅ブロックに変わる。選択範囲の矩形数が 5〜52 から 245 に跳ね上がり、ガード自体も機能しなくなる。

**この不具合はドラッグ後に調べても分からない**。`pointerup` で末尾に戻るため、マウスを放した時点では正常に見える。検証は必ず `mouse.up` の前に行う。

## 4. 選択矩形の扱い

`Range.getClientRects()` の戻り値をそのまま描いてはいけない。1 つの選択に対して次の 4 種類が混在する。

| 混ざるもの                     | 実測値 (ビューア幅 864px 時)              | 対処                             |
| ------------------------------ | ----------------------------------------- | -------------------------------- |
| 行を分割した複数の矩形         | 1 行が 6 個に分かれ、間に 30〜40px の隙間 | 同じ行のものを 1 つにまとめる    |
| 幅 0 のキャレット矩形          | 幅 0px・高さ 19px                         | 幅か高さが 0 のものを捨てる      |
| ほぼ同一の重複                 | 位置と幅が同じで高さだけ 0.4px 違う       | 行のマージで吸収される           |
| ガード (`endOfContent`) の矩形 | ページ全体 (864×1226px)                   | ガードの矩形と一致するものを除く |

隙間ができるのは、pdf.js が語句ごとに span を作り、**語句の間の空白が矩形に含まれない**ため。そのまま描くとハイライトが虫食いになる。ブラウザ標準の選択表示は行単位で塗るので、行ごとにまとめれば見え方が揃う。

ガードの矩形は、選択のたびに `.endOfContent` の `getBoundingClientRect()` を実測して比較対象に渡す。**完全一致で比べない**。選択矩形とガードの矩形は別々の計測に由来してサブピクセルずれるため、各辺 ±1px の許容を持たせる。`===` で比較すると除去に失敗し、稀にページ全面のハイライトが残る。

実装は `src/front/lib/selectionRects.ts`。

| 関数                 | 役割                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tidySelectionRects` | 幅か高さが 0 の矩形を捨て、同じ行のものを 1 つにまとめる。同じ行かどうかは上端の差が行の高さの半分未満かで判定 |
| `dropGuardRect`      | ガードの矩形を ±1px の許容付きで除く                                                                           |
| `selectionOnPage`    | 上の 2 つを束ね、ビューポート基準の矩形を**ページ要素基準**に変換して §5 の保存形式を返す                      |

## 5. ハイライトの永続化

保存は選択の確定時 (このアプリではポップオーバーから質問を送信したとき) に行い、読み戻しはページを開いたときに一括で取得してハイライト層へ渡す。

矩形は**ページ要素を原点とする座標**で保存する。スクロールコンテナ基準にすると、スクロールした分だけずれる。あわせて次の 2 つを保存する。

- **ページ番号** — 再表示時にどのページのハイライトかを判別できない
- **計測したときのページ幅** — ビューアの幅が変われば描画幅も変わるため、表示時に `現在のページ幅 ÷ 保存時のページ幅` で拡大縮小する必要がある。これがないとパネルをリサイズした瞬間に既存のハイライトが全部ずれる

```ts
// このアプリでは selections.position_data (D1) に JSON で保存する
{
  pageNumber: 15,
  rects: [{ x: 60, y: 120, width: 380, height: 18 }],
  pageWidth: 492.39,   // CSS px
}
```

ページ幅を保存していない旧データを引き継ぐ場合は、当時の固定倍率で計測されたものとみなす。「スケール 1 のときのページ幅 × 固定倍率」を保存時のページ幅として扱う (このリポジトリでは `HighlightOverlay.tsx` の `LEGACY_SCALE = 1.5`)。最初からページ幅を保存する新規実装では不要。

### 確認方法

ハイライトを作った後にビューアのパネル幅を変え、ハイライトが本文の同じ語に張り付いたままであることを確認する。

## 6. 描画品質

**解像度**: canvas のバッファを CSS ピクセルで作ると、Retina 環境では表示時に引き伸ばされて文字がぼやける。`devicePixelRatio` 倍のバッファに描き、CSS で元のサイズに戻す。viewport は 2 つ作り、役割を分ける。

```ts
const scale = containerWidth / page.getViewport({ scale: 1 }).width;
const viewport = page.getViewport({ scale }); // CSS ピクセル
const pixelRatio = window.devicePixelRatio || 1;
const deviceViewport = page.getViewport({ scale: scale * pixelRatio }); // 実解像度

await page.render({ canvas, viewport: deviceViewport }).promise;

canvas.width = deviceViewport.width; // バッファは実解像度
canvas.height = deviceViewport.height;
canvas.style.width = `${viewport.width}px`; // 表示は CSS ピクセル
canvas.style.height = `${viewport.height}px`;
```

`TextLayer` に渡す viewport は **CSS スケールの方** (`viewport`)。pdf.js が内部で `OutputScale.pixelRatio` (実質 `devicePixelRatio`) を掛ける。

**チラつき**: ページを送るたびに canvas が一瞬白くなるのは、`canvas.width` への代入が canvas をクリアし、描画完了までその状態が続くため。オフスクリーンの canvas に描いてから `drawImage` で転送すれば、前のページが表示されたまま切り替わる。

この対策を **textLayer に適用する必要はない**。textLayer は透明なので、組み立て中に空でも見た目には現れない。

## 7. 選択中の見た目

質問ポップオーバーなどが**入力欄にフォーカスすると、ブラウザは選択を解除する**。選択したハイライトが消え、どこを選んだのか分からなくなる。フォーカスを外さないと入力できないので、これは避けられない。

対策は選択範囲を自前で描くことだが、`selectionchange` の購読だけでは解けない。フォーカスが移った瞬間に選択が空になり、自前のハイライトも一緒に消えるため。**2 段構え**にする。

1. **ドラッグ中** — `selectionchange` を購読し、そのつど矩形を計算して描く (このアプリでは `PdfViewer.tsx` の `liveSelection` state)。高頻度に発火するので `requestAnimationFrame` でスロットルする
2. **選択の確定時** — 矩形をスナップショットして保持し、以降はそれを描く (同 `popoverState` 側の矩形)。選択が解除されても残る

どちらもハイライト層へは同じ経路で渡す (`HighlightOverlay` の `pending` prop)。

あわせてブラウザ標準の選択表示を消し、**見えるものを自前の描画だけに一本化する**。

```css
.textLayer ::selection {
  background: transparent;
  color: transparent;
}
```

一本化するもう 1 つの理由: pdf.js は span を PDF の字幅に合わせて横に伸ばすため、隣り合う span が数ピクセル重なる (実測で 104 span 中 22 箇所、最大 9.4px)。ブラウザ標準の選択色は半透明なので、**重なった部分だけ色が濃い縦帯になる**。

`::selection` を消す対象は span だけでは足りない。textLayer には `<br>` と `endOfContent` もあり、選択がそれらに跨ると既定の濃い青がそこだけ残る。要素を問わず消す。

### 確認方法

- 選択したままポップオーバーの入力欄にフォーカスし、ハイライトが残ること
- 隣接する span の重なり部分に、色の濃い縦帯が出ないこと

## 8. タッチで選ぶとき

マウス向けに書いた選択の受け口は、指ではそのまま動かない。壊れるのは 3 点。

**選択の確定を `mouseup` で待てない。** 長押しで始まる選択に `mouseup` は来ないか、来ても選択が確定する前に来る。代わりに `document` の `selectionchange` を購読し、**止まった時点**を確定とみなす (`PdfViewer.tsx`、この実装では 250ms)。止まるのを待つのは、OS の選択ハンドルを動かしている間ずっと通知が来るため。マウスでは `mouseup` が「読者が終えた瞬間」をそのまま表すので、広い画面はそちらのままでよい。

**入力欄を選択の直後に出せない。** 入力欄はキーボードを連れてくるうえ、指の下と OS 標準の選択メニュー (コピー / 調べる) に重なる。先に「AIに質問」という提示バーだけを画面下端の一定の場所に出し、押されて初めて入力欄を出す (提示バーは `SelectionActionBar.tsx`、入力欄は同じ `SelectionPopover` を下端に置いたもの。両者は排他)。提示バーには選んだ文を引用して見せる——スマホの選択は一語ずれやすく、ハイライトを保存する前に気付ける場所がここしかない。

**入力欄が出ている間は `selectionchange` を見てはいけない。** 入力欄にフォーカスすると選択が畳まれ、その通知に反応すると開いたばかりの入力欄を閉じる。§7 のスナップショットと同じ問題が、購読側にも現れる。提示バーが引用して見せるのは、その §7 でスナップショットした選択そのもの。

タップでページを送る機能を足すなら、**透明な帯を重ねてはいけない**。帯はその下の textLayer への選択を奪う (§1 の pointer-events 契約と同じ話)。ポインタイベントの座標から左右の帯を判定する。加えて、**選択が出ている間・拡大している間・押せるものの上ではページを送らない**。とくに選択中の送りは、保存前のハイライトごと消す。

スワイプでもページを送るなら、距離・直進度・所要時間の 3 条件で拾う (この実装では 64px 以上・横が縦の 1.6 倍以上・700ms 以内)。ページは下へスクロールして読むもので、スクロールする親指は横にも流れるため、条件を緩めると読んでいる最中にページが飛ぶ。

ピンチをアプリ側で取るなら `touch-action` の設計が要る。既定を `manipulation` にしてブラウザ自身のダブルタップ拡大を止め、2 本指が触れている間だけ `none` にする。Safari はピンチを touch ではなく `gesturestart` / `gesturechange` で倍率つきに丸めて報せるので、両方を購読する。

**保存の経路はマウスと同じ** (→ §5)。提示バーから開いた入力欄も、浮遊ポップオーバーと同じ送信ハンドラを通るので、ハイライトの保存と質問の送信の順序は変わらない。

### 確認方法

- 実機で本文を長押しし、OS の選択メニューと自前の提示が同時に出ても操作を取り合わないこと
- 入力欄にフォーカスしたあと、提示が消えずハイライトも残ること
- 選択したまま画面端をタップして、ページが動かないこと

## テストの勘所

この領域は「動いていないのに通るテスト」が生まれやすい。

- **視覚のズレは単体テストで検出できない**。矩形の整理 (`tidySelectionRects` / `dropGuardRect`) やガードの挿入位置判定 (`guardInsertionPoint`、いずれも §3〜§4 の実装ファイル) のように、**純粋関数へ切り出せる部分は切り出して単体テストする**。実測値をそのままテストデータに使うと仕様が具体的になる
- **E2E は実ドラッグでしか意味がない**。`Range` API で選択を作ってもブラウザの選択挙動 (§3 の暴走) は再現されない。Playwright の `mouse.down` / `mouse.move` / `mouse.up` を使う
- **ガードの検証は `mouse.up` の前に行う** (§3)
- **タッチの検証は届く範囲を見極める** (§8)。ウィンドウ幅とタップ・スワイプは Playwright のモバイルプロジェクトで確かめられるが、**ピンチは指を 2 本送れないので送れない**——倍率の計算は純粋関数へ切り出して単体テストする。長押し選択そのもの、OS の選択メニューとの競合、ソフトキーボードとの重なりはヘッドレスでは再現しないので、実機で見る
- 追加したテストは**実装を壊した状態で落ちること**を必ず確認する。この領域の回帰は目で見るまで気付けないため、テストが空振りしていても分からない

実機での確認は、DevTools から次の値を測ると早い。

| 測る値                                                            | 正常                      | 異常                                                     |
| ----------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `getComputedStyle(span).transform`                                | `matrix(…)`               | `none` (§2 の CSS 欠落)                                  |
| `document.querySelector(".endOfContent").parentElement.className` | `textLayer` を含む        | `textLayer` を含まない任意の class (§3 でガードが逃げた) |
| `range.getClientRects().length`                                   | 選択量に比例 (数個〜数十) | 急に 3 桁 (ガードを巻き込んだ)                           |
| ハイライトの最大高さ                                              | 1 行分 (約 19px)          | ページ高に近い (§4 のガード矩形が残った)                 |

## 用語

| 用語            | 定義                                              | 生成者                               | 消費者                                                |
| --------------- | ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| textLayer       | canvas 上に敷く透明な span 群。選択の実体         | `PdfPage.tsx` (`pdfjsLib.TextLayer`) | ブラウザの選択機構                                    |
| `endOfContent`  | 選択の行き過ぎを受け止めるガード要素              | `PdfPage.tsx`                        | `textLayerSelectionGuard.ts` が移動、CSS が寸法を制御 |
| ハイライト層    | 選択中・保存済みの矩形を描く層                    | `HighlightOverlay.tsx`               | 画面                                                  |
| `liveSelection` | ドラッグ中の未保存の矩形                          | `PdfViewer.tsx` の state             | `HighlightOverlay` に `pending` prop で渡す           |
| `pageWidth`     | 矩形を計測したときのページ幅                      | 保存時に `selectionOnPage` が計測    | `HighlightOverlay` の拡大縮小                         |
| 提示バー        | 触って選んだ箇所に対する「AIに質問」の申し出 (§8) | `SelectionActionBar.tsx`             | 押されると入力欄 (`SelectionPopover`) が開く          |

## 依拠する外部事実

いずれも 2026-08-08 に実機とソースで確認。

- 検証したのは `pdfjs-dist` 5.7.284 (`package.json` の指定は `^5.4.30`)。CSS カスタムプロパティ名はバージョン間で変わる (`--scale-factor` 単独で完結していた時期がある)。アップグレード時は `node_modules/pdfjs-dist/web/pdf_viewer.css` の `.textLayer` 定義と、`build/pdf.mjs` の `TextLayer` が `setProperty` で書き込む値を突き合わせること
- `TextLayer` は `viewport.scale * OutputScale.pixelRatio` を内部スケールとして使う。`OutputScale.pixelRatio` は `globalThis.devicePixelRatio || 1`
- 文字幅の計測は、`<body>` に追加される非表示 canvas (`.hiddenCanvasElement`) の `measureText` で行う。span のレイアウトも `getComputedStyle` も読まないため、**組み立て中のコンテナが DOM に接続されているかどうかは pdf.js 側の要件ではない**。接続済みのコンテナに組むのは、直後に `getClientRects()` で選択矩形を測るアプリ側の都合
- `endOfContent` の生成と移動は公式の `TextLayerBuilder` (`pdfjs-dist/web/pdf_viewer.mjs`) が担う。`TextLayer` だけを使う場合は自前で実装する必要がある
- 本文中の実測値は、A5 判・209 ページの日本語技術書の 15 ページ目で計測したもの。ビューアの幅によってページの描画寸法が変わるため、幅・高さの値は計測時のビューア幅 (864px 前後) に対応する。値そのものより桁と傾向を参照すること

§8 の前提は 2026-08-10 に確認。

- 長押しで始まる選択に `mouseup` は来ない。選択の確定は `document` の `selectionchange` が止まったことで判断する。この実装の待ち時間は 250ms
- Safari はピンチを `touchmove` の 2 点間距離ではなく `gesturestart` / `gesturechange` で報せ、倍率を `scale` として渡す。Chromium は前者しか出さないため両方の購読が要る
- `touch-action: manipulation` はブラウザ自身のダブルタップ拡大を止めるが、ピンチとスクロールは残す。ピンチをアプリで取る間だけ `none` にする必要がある
- Playwright は指を 1 本しか送れない (`page.touchscreen.tap`)。ピンチを E2E で再現する手立ては無い
