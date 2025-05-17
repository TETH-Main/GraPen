import GraphCalculator from './GraphCalculator.js';

/**
 * GraphCalculatorを初期化する
 * @returns {GraphCalculator|null} 初期化されたGraphCalculatorのインスタンス、または失敗時はnull
 */
export function initGraphCalculator() {
    // グラフコンテナの取得
    const container = document.getElementById('graph-container');
    if (!container) {
        console.error('グラフコンテナが見つかりません');
        return null;
    }

    // コンテイナーの横と縦のサイズを取得
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    // アスペクト比を計算
    const aspectRatio = containerHeight / containerWidth;

    // GraphCalculatorのインスタンスを作成
    const calculator = new GraphCalculator(container, {
        domain: {
            xMin: -10,
            xMax: 10,
            yMin: -10 * aspectRatio,
            yMax: 10 * aspectRatio
        },
        zoom: {
            speed: 0.5
        },
        animation: {
            duration: 500
        },
        responsive: true
    });
    
    // サンプル曲線を追加
    // addSampleCurve(calculator);
    // addSampleCurve2(calculator); // SVGパス文字列版のサンプル

    return calculator;
}

/**
 * サンプル曲線を追加する
 * @param {GraphCalculator} calculator - グラフ計算機インスタンス
 */
function addSampleCurve(calculator) {
    // 正弦波の点を生成
    const sinePoints = [];
    for (let x = -8; x <= 8; x += 0.5) {
        const y = 3 * Math.sin(x);
        sinePoints.push([x, y]);
    }
    
    // 正弦波の曲線を追加
    calculator.addCurve(sinePoints, {
        color: 'red',
        width: 3,
        id: 'sample-sine'
    });
}

/**
 * SVGパス文字列を使用したサンプル曲線を追加する
 * @param {GraphCalculator} calculator - グラフ計算機インスタンス
 */
function addSampleCurve2(calculator) {
    // SVGパス文字列を直接定義
    // 例: 正弦波の形を模した曲線（ベジェ曲線で描画）
    // 以下のパスは、ドメイン座標で(-8,0)から(8,0)の範囲で波を描く
    const svgPath = "M -8,0 " +
                   "C -7,2 -6,-2 -5,0 " +
                   "C -4,2 -3,-2 -2,0 " +
                   "C -1,2 0,-2 1,0 " +
                   "C 2,2 3,-2 4,0 " +
                   "C 5,2 6,-2 7,0 " +
                   "L 8,0";
    
    // 曲線を追加
    calculator.addCurve(svgPath, {
        color: 'blue',
        width: 3,
        id: 'sample-svg-path'
    });
    
    // 円弧を使った別のサンプル
    const circlePath = "M 0,3 A 3,3 0 1,1 0,-3 A 3,3 0 1,1 0,3";
    
    calculator.addCurve(circlePath, {
        color: 'purple',
        width: 2,
        id: 'sample-circle-path'
    });
    
    // 矩形のパス
    const rectPath = "M -5,-4 H 5 V 4 H -5 Z";
    
    calculator.addCurve(rectPath, {
        color: 'green',
        width: 2,
        id: 'sample-rect-path'
    });
}
