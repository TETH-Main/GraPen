````markdown
# 近似（Approximator）パターン — 新しい近似器を追加するためのガイド

このドキュメントは、`js/approximator/` 以下に存在する近似器（approximator）群で使われている共通パターン、契約（contract）、慣習をまとめたもので、新しい近似アルゴリズムを一貫して追加できるようにすることを目的としています。

既存実装（Linear、PiecewiseLinear、Quadratic B-spline）が従う挙動を可能な限り反映した簡潔なレシピです。

---

## 1) 概要 — 目標
- 近似器はグラフ座標系の点列を受け取り、それらをコンパクトな解析モデルまたは区分モデル（直線、分割直線、二次Bスプライン等）で表現します。
- 各近似器は小さく一貫したプログラムAPIを公開し、アプリケーションの他の部分が期待する形式の結果オブジェクトを返します。
- 入力検証は堅牢に行い、失敗時は例外を投げるのではなく `success:false` と短い `message` を返すべきです。

---

## 2) 共通の入力契約（input contract）
- 主な入力は常にグラフ座標系の点配列です（スクリーン座標ではない）:
  - `[[x1, y1], [x2, y2], ...]`（2要素配列の配列）
  - 一部の近似器は `knotPoints` を `{x, y, id}` のようなオブジェクト配列で受け入れます。両方の形式をサポートする実装が多いです。
- オプション引数:
  - `domain` オブジェクト: `{ xMin, xMax, yMin, yMax }` — ドメイン依存処理が必要な場合に使用します。
  - `options` オブジェクト: アルゴリズム固有の設定（最小/最大ノット数、スナップ、閾値、サンプリングレート等）。
- カスタムノットを受け付ける場合は、正規化（0..1）またはドメイン値で表した `customKnots` 配列を追加の引数として取ります。

例:
- `approximate(points)`
- `approximate(points, domain, options)`
- `approximateWithCustomKnots(points, customKnots, domain, options)`

---

## 3) 共通の出力契約（output contract）
近似器は次のようなフィールドを持つオブジェクトを返します（アルゴリズムによっては一部省略あり）。

必須/共通フィールド
- `success`（boolean）— 近似が成功したかどうか。
- `message`（string）— 失敗時の短いメッセージやステータス。
- `originalPoints` — 近似に使った入力点（前処理後のものでも可）。
- `type`（string）— アルゴリズム/型（例: `"linear"`, `"piecewiseLinear"`, `"quadratic"`）。
- `latexEquations`（配列）— UIで表示する式の記述配列。各要素は通常次のような形:
  - `{ type: 'quadratic'|'linear'|'constant'|'vertical'|'piecewiseLinear', formula: <string>, domain: {start, end}, rpn?: <array>, ... }`

近似固有のフィールド（例）
- `knots` — ノット座標（点の配列）や正規化ノット位置の配列。
- `preKnots` — 候補ノットとメタデータ（BSpline慣習）: `{ knot: <number>, priority: <int>, diff: <number> }` の配列。
- `bezierSegments` — 描画用のベジェ区間記述（B-splineでは通常 `{start, control, end}`）。
- `svgPath` — SVG描画に使える path 文字列。
- `splineCoefficients` — セグメントごとの係数（エクスポートや解析用）。
- `processedPoints` または `processed` — 前処理/フィルタ後の点列。

返却例（最小）:
```
{
  success: true,
  type: 'quadratic',
  originalPoints: points,
  knots: [...],
  preKnots: [...],
  bezierSegments: [...],
  svgPath: 'M ... Q ...',
  latexEquations: [{ type: 'quadratic', formula: 'y=2(x-1)^2+3', domain: {start:'0', end:'5'} }]
}
```

---

## 4) エラー/品質評価パターン
既存の近似器は近似の良さを定量化するためにいくつかの方法を使います。

LinearFunctionApproximator
- 直線性（linearity）の尺度は `1 - (maxDist / length)` です。ここで `maxDist` は内部点が始点-終点の弦に対して持つ最大の垂直距離です。
- `linearity < threshold` なら失敗を返す実装が多いです。

PiecewiseLinearApproximator
- Douglas–Peucker 簡略化で候補ノードを取り、各セグメントごとに線形性スコアを計算します。
- セグメントの平均線形性やセグメントごとの閾値で受け入れ判定をします。

Quadratic B-spline (BSplineApproximator)
- 内部処理で点を x / y 共に [0..1] に正規化します。
- 候補ノット（`preKnots`）を準備し、指定したノット数に応じたノット集合を作ります。
- 基底関数の内積で構成される通常方程式（Normal equation）を立てて係数を解きます。
- セグメントごとの二階導関数を計算し、隣接セグメント間の差分を `preKnots.diff` として格納します。
- `preKnots` を `diff` でソートしてノットの重要度を決め、`priority` と `diff` を用いて異なるノット数ごとの選択を行います。

共通のテーマ
- 直線評価は単純な幾何学的誤差（垂直距離）を使う。
- スプライン系は最小二乗や基底の内積、二階導関数差分などの手法を使う。
- 入力が壊れている場合は例外を投げず `success:false` を返す「保守的なフォールバック」を持つ。

---

## 5) Latex と RPN の扱い
- 多くの近似器は UI 表示用に `latexEquations` を生成します。二次式は `y = a(x - p)^2 + q` の形式がよく使われます。
- `js/util/NumberUtil.js` にあるユーティリティが役に立ちます:
  - `toRPN(formula)` — 文字列式を RPN トークン列に変換します。
  - `detectFormulaType(formula)` — 形式の判定。
  - `evaluateFormula` / `evaluateRPN` — RPN トークンを評価します。
- `latexEquations` を作るときに `rpn` フィールドを付与しておくと、後段で再評価や点生成が楽になります。

例:
```
{ type: 'quadratic', formula: 'y = 2(x - 1)^2 + 0.5', domain: { start: '0.00', end: '10.00' }, rpn: [...] }
```

---

## 6) 新しい近似器の推奨API/テンプレート
新しい近似器モジュールは `js/approximator/` 以下に置き、次のテンプレートに従ってください。

- ファイル: `js/approximator/<kind>/<Name>Approximator.js`
- 少なくとも次のメソッドを持つクラスをエクスポートしてください:
  - `constructor(options = {})` — デフォルト設定を与える
  - `approximate(points, domain, options = {})` — メインのエントリ。前述の構造化された結果を返すこと。
  - `setOptions(options)` — オプション更新用（任意）

基本スケルトン（擬似コード）:
```
export class FooApproximator {
  constructor(options = {}) {
    this.options = { /* defaults */ };
  }

  approximate(points, domain = {}, options = {}) {
    if (!Array.isArray(points) || points.length < 2) return { success: false, message: 'Needs >=2 points', originalPoints: points, latexEquations: [] };

    // 1) preprocess (filter near-duplicates, normalize if needed)
    // 2) compute model (least-squares / greedy / heuristic)
    // 3) produce output fields: knots, preKnots, bezierSegments, svgPath, latexEquations

    return {
      success: true,
      type: 'foo',
      originalPoints: points,
      knots, preKnots, bezierSegments, svgPath, latexEquations
    };
  }

  setOptions(opts) { this.options = {...this.options, ...opts}; }
}
```

---

## 7) 新しい近似器を作るときの実装チェックリスト
1. 出力 `type` と最小限の返却フィールドを決める。
2. 点配列 `[[x,y], ...]` を受け取り検証する（グラフ座標を推奨）。
3. 必要なら `domain` に依存した処理をサポートする。
4. `latexEquations` を生成する（将来の評価のため `rpn` を付けるとよい）。
5. 単純な品質指標を作り、条件を満たさない場合は `success:false` を返す。
6. UIで選択可能にする場合は `js/approximator/ApproximatorManager.js` にインポートして公開する。
7. テスト/手動確認を用意する: json の保存/復元のラウンドトリップ、`svgPath` の視覚確認、`latexEquations` の比較など。

---

## 8) 既存クラスへのマッピング例
- `LinearFunctionApproximator` — 入力: 点配列。出力: `type: 'linear'|'vertical'|'constant'`、`knots` = 両端点、`latexEquations` に式。
- `PiecewiseLinearApproximator` — Douglas–Peucker を使い、セグメントごとに `LinearFunctionApproximator` を呼ぶ。
- `QuadraticBSplineCurveApproximator` — `BSplineApproximator` のラッパー：正規化、重い計算、`preKnots` / `knots` / `bezierSegments` / `splineCoefficients` / `latexEquations` / `svgPath` を返す。

---

## 9) `preKnots` の慣習（BSpline）について
- `preKnots` は次の形式の配列です:
```
{ knot: <number> /* 正規化 0..1 または -0.2/1.1 のようなダミー */, priority: <int>, diff: <number> }
```
- `priority` は内部ノットの選択順を示します。外側のダミーノット（<=0 や >=1）は通常 `priority < 0` を持ち常に保持されます。
- `diff` には曲率に基づくヒューリスティック（例: 隣接セグメント二階導関数の差分）を入れることが多いです。

---

## 10) どこにファイルを追加するか
- 新しい近似器ファイルは `js/approximator/<category>/` に置き、`<Name>Approximator.js` で命名します。
- UI で選べるようにするには `js/approximator/ApproximatorManager.js` に取り込みを追加してください。

---

## 11) レビュワー向けクイックチェックリスト
- `approximate()` が入力検証を行い、無効な入力に対して `{success:false}` を返すか？
- `latexEquations` を生成しているか？（保存/読み込みとUIで使われます）
- アルゴリズムが描画用の `svgPath` や描画プリミティブを提供しているか？
- 式を後から評価するなら `rpn` トークンを付けたか？

---

この文書は、新しい近似器を現在のコードベースに合わせて実装するための参照ガイドです。必要なら私がテンプレート実装を `js/approximator/<your-choice>/` にスキャフォールドして `ApproximatorManager.js` に結線することもできます。どの種の近似器を追加したいか教えてください。

````
