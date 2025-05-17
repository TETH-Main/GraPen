# GraphCalculator

GraphCalculatorは、SVGベースのインタラクティブなグラフ計算機コンポーネントです。
ズーム、パン機能を備え、他のWebアプリケーションに簡単に組み込むことができます。

## 特徴

- SVGベースのグラフ描画
- インタラクティブなズーム・パン機能
- ウィンドウサイズの変更に対応
- 様々なカスタマイズオプション
- モジュール化されたコードで簡単に統合可能
- **曲線や点の追加・削除・更新が可能**
- **グリッドや軸の表示/非表示切り替えAPI**
- **PNG/SVG/JSON形式での保存・復元機能**
- **イベントコールバックによる拡張性**

## 使い方

### 基本的な使い方

```html
<!-- HTML -->
<div id="graph-container"></div>

<script type="module">
    import GraphCalculator from './GraphCalculator.js';
    
    // 初期化
    const calculator = new GraphCalculator('graph-container');
    
    // 独自のドメイン設定
    calculator.setDomain({
        xMin: -5,
        xMax: 5,
        yMin: -5,
        yMax: 5
    });
</script>
```

```css
/* CSS */
#graph-container {
    width: 800px;
    height: 600px;
}

/* グリッド線のスタイル - x軸とy軸用 */
.grid-line {
    stroke: #000;
    stroke-width: 2;
}

/* 副目盛りのスタイル - 主要なグリッド線用 */
.sub-grid-line {
    stroke: #a6a6a6;
    stroke-width: 1;
}

/* 微細目盛りのスタイル */
.micro-grid-line {
    stroke: #ccc;
    stroke-width: 0.3;
}

/* 軸メモリのスタイル */
.axis-tick {
    stroke: #000;
    stroke-width: 1.5;
}

/* 軸ラベルのスタイル */
.axis-label {
    font-family: Arial, sans-serif;
    font-size: 12px;
    text-anchor: middle;
    dominant-baseline: middle;
}
```

### 曲線・点の追加・削除・更新

```javascript
import GraphCalculator from './GraphCalculator.js';

const calculator = new GraphCalculator('graph-container');

// 曲線を追加（点の配列）
const curve = calculator.addCurve([[0,0],[1,1],[2,0]], { color: 'blue', width: 2 });

// 曲線を追加（SVGパス文字列）
const svgPath = "M 0,0 Q 1,2 2,0";
const curve2 = calculator.addCurve(svgPath, { color: 'red', width: 3 });

// 曲線の色や太さを更新
calculator.updateCurve(curve.id, { color: 'green', width: 4 });

// 曲線を削除
calculator.removeCurve(curve2.id);

// 曲線上に点を追加
const point = calculator.addPoint(curve.id, 1, 1, { shape: 'circle', size: 12, stroke: 'red', fill: 'yellow' });

// 点の位置や色を更新
calculator.updatePoint(point.id, { x: 1.5, y: 0.5, color: 'orange' });

// 点を削除
calculator.removePoint(point.id);
```

### グリッドや軸の表示切替

```javascript
// X軸・Y軸の表示/非表示
calculator.setXAxisVisibility(false);
calculator.setYAxisVisibility(true);

// 主グリッド・副グリッド・微細グリッドの表示/非表示
calculator.setMainGridVisibility(false);
calculator.setSubGridVisibility(true);
calculator.setMicroGridVisibility(false);

// 目盛りラベル・軸ラベルの表示/非表示
calculator.setTickLabelsVisibility(false);
```

### ズーム・パン制御

```javascript
// ズームイン・ズームアウト
calculator.zoomIn();
calculator.zoomOut();

// ズーム・パン操作の有効/無効
calculator.enableZoom(false);
calculator.enableCanvas(true);

// ドメイン（表示範囲）のリセット
calculator.resetToHome();
```

### 保存・復元

```javascript
import { saveToPNG, saveToSVG, saveToJSON, loadFromJSON, importJSONFile } from './GraphSaveUtils.js';

// PNG画像として保存
saveToPNG(calculator, 'my-graph');

// SVGファイルとして保存
saveToSVG(calculator, 'my-graph');

// JSON形式で保存
saveToJSON(calculator, 'my-graph-data');

// JSONから復元
loadFromJSON(calculator, jsonData);

// ファイル選択ダイアログからJSONを読み込み
importJSONFile((jsonData) => {
    loadFromJSON(calculator, jsonData);
});
```

### イベントリスナーの追加

```javascript
calculator.addEventListener('onDraw', (instance) => {
    console.log('グラフが描画されました');
});
calculator.addEventListener('onZoom', (startDomain, targetDomain, instance) => {
    console.log('ズーム開始', startDomain, targetDomain);
});
```

### 曲線グループの表示/非表示

```javascript
// 曲線グループ（同じIDの曲線群）を非表示にする
calculator.setCurveGroupVisibility('curve-0', false);
```

### 画面座標とドメイン座標の変換

```javascript
const domainPt = calculator.screenToDomain(400, 300);
const screenPt = calculator.domainToScreen(0, 0);
```

### サンプル: サイン波・SVGパス・矩形の追加

```javascript
// サイン波
const sinePoints = [];
for (let x = -8; x <= 8; x += 0.5) {
    sinePoints.push([x, 3 * Math.sin(x)]);
}
calculator.addCurve(sinePoints, { color: 'red', width: 3, id: 'sample-sine' });

// SVGパス（ベジェ曲線）
const svgPath = "M -8,0 C -7,2 -6,-2 -5,0 C -4,2 -3,-2 -2,0 C -1,2 0,-2 1,0 C 2,2 3,-2 4,0 C 5,2 6,-2 7,0 L 8,0";
calculator.addCurve(svgPath, { color: 'blue', width: 3, id: 'sample-svg-path' });

// 矩形
const rectPath = "M -5,-4 H 5 V 4 H -5 Z";
calculator.addCurve(rectPath, { color: 'green', width: 2, id: 'sample-rect-path' });
```

## ディレクトリ構造

```
GraphCalculator/
├── GraphCalculator.js         # メインクラス
├── GraphCalculatorOptions.js  # デフォルトオプション
├── GraphCalculatorUtils.js    # ユーティリティ関数
├── GraphSaveUtils.js          # 保存・復元ユーティリティ
└── README.md                  # ドキュメント
```

## ライセンス

MIT License
