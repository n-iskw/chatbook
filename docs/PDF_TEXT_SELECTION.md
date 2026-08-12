# PDF のテキスト選択とハイライト

- 種別: 実装ガイド
- 対象: pdf.js でレンダリングした PDF を、Web ページのテキストのように選択し、選択箇所をハイライトとして永続化する機能
- 想定読者: この機能を別のアプリで一から実装する人
- 最終更新: 2026-08-13

pdf.js の公式 viewer をそのまま使わず、`TextLayer` などの低レベル API を組み合わせて自作する場合の落とし穴をまとめる。大きく 3 系統ある。

- **選択位置がずれる・暴走する** (§2〜§5) — 見た目には現れないため、動いていると誤解したまま実装が完了しがち
- **描画品質と選択表示の一貫性** (§6〜§7) — 目には見えるが、原因が pdf.js の内部仕様や自前の確定判定にあって特定しにくい。§7 の後半は出た直後を見ないと分からない類でもある
- **指では成立しない前提** (§8) — マウス向けに書いたコードは、そのままでは触っても何も起きない。画面幅で指かどうかを推し量ると、幅の広いタブレットが丸ごと取り残される

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
8. **ページから離れた範囲は `rangeWithinPage` が畳んで返す**。切り詰めると始点と終点がページの両端に寄り、ページ全体になる (→ §4・§7)
9. **レイアウトは画面幅で、入力はイベントで分ける**。幅から指かどうかを推し量らない (→ §8)
10. **選択の合図に `mouseup` を使わない**。幅に関わらず `selectionchange` が止まった時点を待つ (→ §8)

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
| `rangeWithinPage`    | 測る前に範囲をそのページのテキストの内側へ切る。交差しない範囲は畳んで返す (下記)                              |

`rangeWithinPage` だけは `selectionOnPage` の内側ではなく**その手前**で呼ぶ。呼ぶ場所は 2 つあり、**確定の計測とドラッグ中の描画の両方**が通す (このアプリでは `PdfViewer.tsx` の `measureSelectionOnPage` と `liveSelection` を作る effect)。確定側だけで切ると、見開きでドラッグしている最中のマークが隣のページへはみ出したまま描かれる。

**切る処理が要るのは、ページを 2 枚以上並べる実装**——このアプリでいう見開き (幅の余ったペインに現在ページと次ページを横に並べる表示) で、ドラッグが隣のページへ渡ったとき。矩形は 1 ページのピクセルで保存されるので、隣のページの分は行き場がない——切らずに測るとページの外まで伸びた矩形がそのまま保存される。**どのページに切るかを決めるのは呼び出し側**で (同じく `PdfViewer.tsx` の `selectedPageElement`)、現在ページから決めつけず**読者が押し下げた側** (`selection.anchorNode`) から DOM を辿る。関数は渡されたページに切るだけで、ページを選びはしない。範囲は常に文書順なので、右から左へのドラッグでは始点が別のページにある。

**切るのは範囲の一部がそのページに残っているときだけ**。交差の判定を入れずに切ると、離れてしまった範囲は始点をページの先頭・終点をページの末尾に寄せられ、**ページ全体**になる。これは理屈上の話ではなく、マウスが選んだ直後に開く質問ポップオーバーが選択を奪ったときに通る道で、§7 に顛末がある。**1 ページしか並べない実装でも、この「離れた範囲は畳む」だけは要る**——ポップオーバーは並べる枚数と関係なく選択を奪うため。

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

どちらもハイライト層へは同じ経路で渡す (`HighlightOverlay` の `pending` prop)。**両方あるときは確定のスナップショットが勝つ** (`PdfViewer.tsx` の `pendingOn` がその分岐)——ドラッグ中の矩形は入力欄がフォーカスを取った時点で消える (選択が畳まれ、1 の計算が「選択なし」に落ちる) ので、マークが残ることの実質的な根拠はこの優先順位にある。

**入力欄へ移った選択も「選択が変わった」と報される**。確定を `selectionchange` が止まった時点で判断している以上 (§8)、その通知でも待ち時間は振り出しに戻り、**入力欄が開いた 250ms 後にもう一度、確定として計測が走る**。このときブラウザの選択はもうページの上に無い。購読を止める手立ては提示バーを経た経路にしか無く (§8)、マウスがその場で開く浮遊ポップオーバーではこの 2 回目が必ず走る。

そのままでは、確定の計測が 2 回目に上書きされる。ページに残っていない選択を §4 の `rangeWithinPage` に渡すと、始点をページの先頭に、終点をページの末尾に寄せて**ページ全体**を作る。それが確定した選択として保存され、ページ全面がハイライトされる。読者には「質問ポップオーバーが出た直後に選択が全ページへ広がった」と見える。

`rangeWithinPage` は、**範囲がそのページのテキストと交差しないなら畳んで返す** (`range.intersectsNode(textLayer)`)。畳まれた範囲は、そこに passage は無いものとして扱われる——`src/front/lib/pdfTextMatcher.ts` の `getSelectionFromTextLayer` が畳まれた範囲に何も見出さず、確定の計測 `measureSelectionOnPage` がその結果をそのまま返す。**残る一段は受け取る側**で、確定の合図を受けるコールバックが**何も測れなかったときは早く戻り、スナップショットに触れない** (`PdfViewer.tsx` の `if (!measured) return`)。**空の矩形の集まりを返して上書きしてはいけない**——今度はページ全体に広がる代わりにマークが消え、読者はどこを選んだのか分からなくなる。

**この退行は入力欄が出た直後を見ないと分からない**。ポップオーバーが出たことを確かめた時点ではまだ 1 回目の結果が描かれており、広がるのはその 250ms 後。E2E は**入力欄が出てから待ってもう一度測る** (`e2e/chatbook.spec.ts` の「the marked passage stays put once the question box has taken the focus」)。

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
- **入力欄が出てから 1 秒待ち**、ハイライトが選んだ行のままで、ページ全体に広がっていないこと (待つのは確定の判定が 2 度来ても済む長さ。この実装の 250ms なら 1 秒で足りる)
- 隣接する span の重なり部分に、色の濃い縦帯が出ないこと

## 8. タッチで選ぶとき

マウス向けに書いた選択の受け口は、指ではそのまま動かない。壊れるのは 4 点。

**画面幅で分けてはいけない。** 指かマウスかを画面幅から推し量ると、タブレット (幅は広い・指しかない) がマウス向けの経路に落ち、本文を選ぶことすらできなくなる。ノート PC の画面に触ることも、タブレットにマウスを挿すこともあるので、端末単位の判定も同じく取りこぼす。**レイアウト (何を画面に出すか) は幅で、入力 (どう触れるか) はイベントそのもので分ける**——`touchstart` はマウスでは発火せず、`PointerEvent.pointerType` は指とマウスを 1 件ごとに見分ける。この実装で幅を見るのはレイアウトの分岐 (`useIsNarrow` と目次の初期状態) だけで、ジェスチャの配線は幅を見ない。

**確定を検出する仕組みだけでなく、確定したあと何を出すかも入力で分ける。** 幅で分けると、幅の広いタブレットで指が選んだ直後に入力欄が開いてフォーカスを取り、選択が畳まれてハンドルごと消える——読者が範囲を広げようとしていた最中に、広げる手立てを奪う。**その passage を何で選んだか**を確定の合図と一緒に受け取り (`useSettledSelection` が `pointerdown` の `pointerType` を控えて渡す)、指なら提示バー、マウスなら入力欄に振り分ける。控えるのは押し下げの時点でなければならない——長押しを platform が自分の選択に取り上げると `pointercancel` で終わり、そのあとハンドルを動かしても何も報せてこない。

**選択の確定を `mouseup` で待てない。** 長押しで始まる選択に `mouseup` は来ないか、来ても選択が確定する前に来る。代わりに `document` の `selectionchange` を購読し、**止まった時点**を確定とみなす (`useSettledSelection.ts` の `SELECTION_SETTLE_MS`、この実装では 250ms)。止まるのを待つのは、OS の選択ハンドルを動かしている間ずっと通知が来るため。**`mouseup` の経路を残して併存させない**——マウスで離したとき同じ選択を 2 度測ることになり、2 度目が矩形のスナップショット (§7) を差し替える。マウスの反応が 250ms 遅くなる代わりに、経路を 1 本にする。

この「落ち着いた選択」の待ち方には決まりが 3 つある。**押されている間は測らない**——待ち時間が尽きた時点でまだ押されていたら、測らずにタイマーを張り直す。したがって確定するのは離した瞬間ではなく、**離してからさらに 250ms 後**。**押下は `window` で `pointerdown` / `pointerup` / `pointercancel` の 3 つを capture フェーズで追う**。選択ハンドルのドラッグは要素の外 (OS の UI) で起きるのでコンテナで購読すると見失い、`pointercancel` を落とすとブラウザにジェスチャを奪われたときに「押されたまま」で固着して二度と確定しない。**iOS はハンドル操作中に pointer イベントを出さないことがある**が、そのときは「押されていない」まま素の 250ms debounce に縮退するだけで壊れない。

**入力欄を選択の直後に出せない。** 入力欄はキーボードを連れてくるうえ、フォーカスを取って選択を畳み、指の下と OS 標準の選択メニュー (コピー / 調べる) にも重なる。先に「AIに質問」という提示バーだけを画面下端の一定の場所に出し、押されて初めて入力欄を出す (提示バーは `SelectionActionBar.tsx`、入力欄は同じ `SelectionPopover` を下端に置いたもの。両者は排他)。**バーはフォーカスを取らない**ので、出たあとも読者はハンドルで範囲を広げ続けられ、バーの引用がそれに追従する。提示バーには選んだ文を引用して見せる——スマホの選択は一語ずれやすく、ハイライトを保存する前に気付ける場所がここしかない。**この順序は幅ではなく指かどうかで決める**ので、幅の広いタブレットも同じ道を通る。

**提示バーから入力欄を開いている間は `selectionchange` を見てはいけない。** 入力欄にフォーカスすると選択が畳まれ、その通知に反応すると開いたばかりの入力欄を閉じる。§7 のスナップショットと同じ問題が、購読側にも現れる。**抑止は購読側の分岐ではなくフックの引数で行う** (`useSettledSelection(…, { enabled: !questionOpen })`)。購読を張ったまま結果を捨てると、捨てた通知の分だけ待ち時間が延びて、閉じたあとの確定が遅れる。提示バーが引用して見せるのは、その §7 でスナップショットした選択そのもの。

**この抑止が効くのは提示バーを経た経路だけ**で、マウスが選んだときにその場で開く浮遊ポップオーバーには効かない。あちらは提示バーを挟まないので入力欄が開いたことを表す状態 (`questionOpen`) が立たず、購読は生きたまま入力欄がフォーカスを取る。そこで確定の計測がもう一度走ることになり、**§7 の畳みが唯一の防波堤になる**。

タップでページを送る機能を足すなら、**透明な帯を重ねてはいけない**。帯はその下の textLayer への選択を奪う (§1 の pointer-events 契約と同じ話)。ポインタイベントの座標から左右の帯を判定する。加えて、**選択が出ている間・拡大している間・押せるものの上ではページを送らない**。とくに選択中の送りは、保存前のハイライトごと消す。

送りをマウスのクリックにも効かせるなら、さらに 2 つ要る。**送ってよいかは `pointerup` ではなく `pointerdown` の時点で決める**——入力欄を閉じる操作はその外側を押すことで、閉じるのは `mousedown` で起きる。`pointerup` で「今なにが出ているか」を見ると、もう何も出ていないように見えてページが送られる。**2 回目以降のクリック (`PointerEvent.detail > 1`) は送らない**。単語をダブルクリックで選ぶ操作の 1 打目にあたるため。中央のダブルタップによる拡大だけは `pointerType !== "mouse"` に絞る——マウスには Ctrl+ホイールがあり、中央のダブルクリックで突然 200% になるのは驚きが大きい。

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
- **タッチの検証は届く範囲を見極める** (§8)。ウィンドウ幅とタップ・スワイプは Playwright の狭いプロジェクトで確かめられるが、**ピンチは指を 2 本送れないので送れない**——倍率の計算は純粋関数へ切り出して単体テストする。長押し選択そのもの、OS の選択メニューとの競合、ソフトキーボードとの重なりはヘッドレスでは再現しないので、実機で見る
- **幅が広いまま指で触る組み合わせを別に走らせる** (§8)。幅ではなく入力で分けたことは、狭いプロジェクトでも広いプロジェクトでも検証できない——前者は幅が狭く、後者はマウスしか使わない。`hasTouch: true` の広いプロジェクトを 1 つ足して、そこで選択・端のタップ・ハンドルのドラッグ・hover の無い端末でしか出ないものを見る。**選択のテストをマウスのドラッグで書いてはいけない**——幅で分けていた頃の `mouseup` 経路が答えてしまい、直したはずの退行を素通りさせるうえ、報せるポインタの種類も違う。長押しは合成できないので、**ページを 1 回タップして「指が触った」ことを立ててから**、OS のジェスチャが行き着く先と同じ `Range` API で選択を作り、ブラウザが出す `selectionchange` に拾わせる。タップはページを送らない中央の帯に落とす。**指でハンドルをドラッグするには CDP の `Input.dispatchTouchEvent` が要る**。`setPointerCapture` はブラウザが実際に追跡しているポインタを要求するので、手で組み立てた `pointerdown` では動かない
- **ヘッドレス Chromium はページの横位置によって選択ドラッグを取りこぼす**。ページの `getBoundingClientRect().left` の小数部が .734375 になる位置に来ると、ボタンを押したままの移動に選択を伸ばさず新しいキャレットを置き、ドラッグが何も選ばない。**症状は「ドラッグしたのに何も選ばれず、選択待ちのアサーションがタイムアウトする」**。当たったかどうかは 3 手で分かる: ページの `left` を測って小数部を見る → 同じ幅を `--headed` で走らせて通るなら実装ではない → ウィンドウ幅を 1px ずらす。ペインの幅が変わればページの横位置も変わるので、**この癖を踏んだテストだけ幅を固定する** (`overshooting a line…` が既定の 1280px から 1px ずらした 1281px を指定しているのがその例。ほかの実ドラッグのテストは既定幅か project の `viewport` のままでよい)
- 追加したテストは**実装を壊した状態で落ちること**を必ず確認する。この領域の回帰は目で見るまで気付けないため、テストが空振りしていても分からない

実機での確認は、DevTools から次の値を測ると早い。

| 測る値                                                            | 正常                      | 異常                                                     |
| ----------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `getComputedStyle(span).transform`                                | `matrix(…)`               | `none` (§2 の CSS 欠落)                                  |
| `document.querySelector(".endOfContent").parentElement.className` | `textLayer` を含む        | `textLayer` を含まない任意の class (§3 でガードが逃げた) |
| `range.getClientRects().length`                                   | 選択量に比例 (数個〜数十) | 急に 3 桁 (ガードを巻き込んだ)                           |
| ハイライトの最大高さ                                              | 1 行分 (約 19px)          | ページ高に近い (§4 のガード矩形が残った)                 |

## 用語

| 用語            | 定義                                              | 生成者                                                           | 消費者                                                                                                                        |
| --------------- | ------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| textLayer       | canvas 上に敷く透明な span 群。選択の実体         | `PdfPage.tsx` (`pdfjsLib.TextLayer`)                             | ブラウザの選択機構                                                                                                            |
| `endOfContent`  | 選択の行き過ぎを受け止めるガード要素              | `PdfPage.tsx`                                                    | `textLayerSelectionGuard.ts` が移動、CSS が寸法を制御                                                                         |
| ハイライト層    | 選択中・保存済みの矩形を描く層                    | `HighlightOverlay.tsx`                                           | 画面                                                                                                                          |
| `liveSelection` | ドラッグ中の未保存の矩形                          | `PdfViewer.tsx` の state                                         | `HighlightOverlay` に `pending` prop で渡す                                                                                   |
| `pageWidth`     | 矩形を計測したときのページ幅                      | 保存時に `selectionOnPage` が計測                                | `HighlightOverlay` の拡大縮小                                                                                                 |
| 提示バー        | 触って選んだ箇所に対する「AIに質問」の申し出 (§8) | `SelectionActionBar.tsx`                                         | 押されると入力欄 (`SelectionPopover`) が開く                                                                                  |
| 落ち着いた選択  | 通知が止まり、ポインタも離れたという合図 (§8)     | `useSettledSelection.ts` の `onSettled` (選択そのものは渡さない) | `PdfViewer.tsx` が `measureSelection` で測って提示バー・入力欄へ、`ChatMessageList.tsx` が `readQuote` で測って引用の申し出へ |

## 依拠する外部事実

いずれも 2026-08-08 に実機とソースで確認。

- 検証したのは `pdfjs-dist` 5.7.284 (`package.json` の指定は `^5.4.30`)。CSS カスタムプロパティ名はバージョン間で変わる (`--scale-factor` 単独で完結していた時期がある)。アップグレード時は `node_modules/pdfjs-dist/web/pdf_viewer.css` の `.textLayer` 定義と、`build/pdf.mjs` の `TextLayer` が `setProperty` で書き込む値を突き合わせること
- `TextLayer` は `viewport.scale * OutputScale.pixelRatio` を内部スケールとして使う。`OutputScale.pixelRatio` は `globalThis.devicePixelRatio || 1`
- 文字幅の計測は、`<body>` に追加される非表示 canvas (`.hiddenCanvasElement`) の `measureText` で行う。span のレイアウトも `getComputedStyle` も読まないため、**組み立て中のコンテナが DOM に接続されているかどうかは pdf.js 側の要件ではない**。接続済みのコンテナに組むのは、直後に `getClientRects()` で選択矩形を測るアプリ側の都合
- `endOfContent` の生成と移動は公式の `TextLayerBuilder` (`pdfjs-dist/web/pdf_viewer.mjs`) が担う。`TextLayer` だけを使う場合は自前で実装する必要がある
- 本文中の実測値は、A5 判・209 ページの日本語技術書の 15 ページ目で計測したもの。ビューアの幅によってページの描画寸法が変わるため、幅・高さの値は計測時のビューア幅 (864px 前後) に対応する。値そのものより桁と傾向を参照すること

§8 の前提は 2026-08-10 に確認。ブラウザ側の事実は Playwright 1.62.1 の同梱 Chromium で見たもの。

- 長押しで始まる選択に `mouseup` は来ない。選択の確定は `document` の `selectionchange` が止まったことで判断する。この実装の待ち時間は 250ms (`SELECTION_SETTLE_MS`)
- `touchstart` はマウスの操作では発火しない。`PointerEvent.pointerType` は `"mouse"` / `"touch"` / `"pen"` を 1 件ごとに報せる。この 2 つが「幅ではなく入力で分ける」の土台
- Safari はピンチを `touchmove` の 2 点間距離ではなく `gesturestart` / `gesturechange` で報せ、倍率を `scale` として渡す。Chromium は前者しか出さないため両方の購読が要る
- `touch-action: manipulation` はブラウザ自身のダブルタップ拡大を止めるが、ピンチとスクロールは残す。ピンチをアプリで取る間だけ `none` にする必要がある
- Playwright は指を 1 本しか送れない (`page.touchscreen.tap`)。ピンチを E2E で再現する手立ては無い
- `page.touchscreen` が送るのはタップだけで、OS の長押し選択ジェスチャは合成できない。指で選ぶ経路の検証は「幅が広いまま `selectionchange` で拾われること」までしか届かない
- `setPointerCapture` はブラウザが追跡中のポインタを要求する。`element.dispatchEvent(new PointerEvent("pointerdown", …))` で組み立てた合成イベントでは捕捉が成立せず、以後の move が届かない。Playwright から実際の指を送るには CDP の `Input.dispatchTouchEvent` を使う
- ヘッドレスで走らせたとき、ページの `getBoundingClientRect().left` の小数部が .734375 になる位置では、ボタンを押したままの `mousemove` に選択が伸びず、移動のたびに畳まれたキャレットが置き直される。同じ位置を `--headed` で強制すると正常に選択できる。`main` でも同じ位置なら再現するので、ビューアの作りとは無関係

§7 の後半 (入力欄が奪った選択) の前提は 2026-08-13 に確認。同じく Playwright 1.62.1 の同梱 Chromium と、実機の Chrome で見たもの。

- 入力欄にフォーカスが移ると選択は畳まれ、**その畳み自体が `selectionchange` として報される**。確定を「通知が止まってから」で判断している以上、これが待ち時間を振り出しに戻す
- 畳まれた選択も `Selection.rangeCount` は 1 のままで、範囲は入力欄の側にある。「選択が無くなった」ことは range の数では分からない
- `Range.intersectsNode` は、範囲がその要素と交差しないとき false を返す。`setStart` / `setEnd` で境界に寄せる前にこれを問える
