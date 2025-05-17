/**
 * グラフ計算機のデフォルト設定
 */
export const DEFAULT_OPTIONS = {
    // 初期ドメイン設定
    domain: {
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10
    },
    
    // ズーム設定
    zoom: {
        speed: 0.24, // ズームスピード（デフォルト値8に設定、実際の操作感に合わせて調整）
        minScale: 0.1, // 最小ズームスケール
        maxScale: 100 // 最大ズームスケール
    },
    
    // アニメーション設定
    animation: {
        enabled: true, // アニメーションを有効化
        duration: 150 // アニメーション時間（ミリ秒）
    },
    
    // 描画設定
    draw: {
        microGrid: true, // 微細グリッドを描画するか
        subGrid: true, // 副グリッドを描画するか
        mainGrid: true, // 主グリッドを描画するか
        axes: true, // 軸を描画するか
        axisTicks: true, // 軸のメモリを描画するか
        axisLabels: true, // 軸のラベルを描画するか
        xAxis: true,     // X軸を描画するか - 新規追加
        yAxis: true      // Y軸を描画するか - 新規追加
    },
    
    // デバッグ設定
    debug: {
        enabled: false, // デバッグ出力を有効化するか
        level: 1 // 1: 情報, 2: エラーのみ, 3: 出力なし
    },
    
    // レスポンシブ設定
    responsive: true, // ウィンドウリサイズ時に自動調整するか
    
    // イベントコールバック
    events: {
        onDraw: null, // 描画時のコールバック
        onZoom: null, // ズーム開始時のコールバック
        onZoomEnd: null, // ズーム終了時のコールバック
        onDragStart: null, // ドラッグ開始時のコールバック
        onDrag: null, // ドラッグ中のコールバック
        onDragEnd: null, // ドラッグ終了時のコールバック
        onResize: null, // リサイズ時のコールバック
        onDoubleClick: null // ダブルクリック時のコールバック
    }
};
