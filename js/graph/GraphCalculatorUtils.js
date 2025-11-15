/**
 * 数値の有効性を確認
 * @param {any} value - チェックする値
 * @returns {boolean} 有効な数値かどうか
 */
export function isValidNumber(value) {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * 数値を見やすい形式でフォーマット
 * @param {number} num - フォーマットする数値
 * @returns {string} フォーマットされた文字列
 */
// 数字を上付き文字に変換する
function toSuperscript(num) {
    const superscripts = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '-': '⁻'
    };
    return num.toString().split('').map(char => superscripts[char] || char).join('');
}

export function formatNumber(num) {
    // 0に近い非常に小さな値を丸める
    if (Math.abs(num) < 1e-10) {
        return "0";
    }

    const absNum = Math.abs(num);

    // 10^5以上の大きな数値
    if (absNum >= 1e5) {
        const exp = Math.floor(Math.log10(absNum));
        const base = num / Math.pow(10, exp);
        // 基数を1桁の小数点以下まで丸める
        const roundedBase = Math.round(base * 10) / 10;
        return `${roundedBase}×10${toSuperscript(exp)}`;
    }

    // 10^-4以下の小さな数値
    if (absNum > 0 && absNum <= 1e-4) {
        const exp = Math.floor(Math.log10(absNum));
        const base = num / Math.pow(10, exp);
        // 基数を1桁の小数点以下まで丸める
        const roundedBase = Math.round(base * 10) / 10;
        return `${roundedBase}×10${toSuperscript(exp)}`;
    }

    // 整数に近い場合は整数として表示
    if (Math.abs(num - Math.round(num)) < 1e-10) {
        return Math.round(num).toString();
    }

    // その他の数値は小数点以下4桁まで表示（末尾の0は削除）
    return num.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * ドメイン範囲に基づく適切なグリッド間隔を計算
 * @param {number} range - ドメイン範囲
 * @returns {number} グリッド間隔
 */
export function calculateGridSpacing(range) {
    if (!isValidNumber(range) || range <= 0) {
        return 1; // 無効な入力の場合のデフォルト値
    }

    const log10 = Math.floor(Math.log10(range));
    const normalizedRange = range / Math.pow(10, log10);

    let spacing;
    if (normalizedRange < 2) {
        spacing = 0.2 * Math.pow(10, log10);
    } else if (normalizedRange < 5) {
        spacing = 0.5 * Math.pow(10, log10);
    } else {
        spacing = Math.pow(10, log10);
    }

    return spacing;
}

/**
 * イージング関数（easeOutCubic）
 * @param {number} t - 0～1の進行度
 * @returns {number} イージングされた値
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * 角度をラジアンに変換
 * @param {number} degrees - 角度
 * @returns {number} ラジアン
 */
export function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

/**
 * ラジアンを角度に変換
 * @param {number} radians - ラジアン
 * @returns {number} 角度
 */
export function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}

/**
 * グラフ計算機のユーティリティクラス
 * グラフ計算機の機能をラップしたヘルパーメソッドを提供
 */
export class GraphCalculatorUtils {
    /**
     * コンストラクタ
     * @param {GraphCalculator} calculator グラフ計算機のインスタンス
     */
    constructor(calculator) {
        this.calculator = calculator;
    }

    /**
     * ビューをリセットする
     */
    resetView() {
        if (this.calculator) {
            this.calculator.resetToHome();
        }
    }

    /**
     * ズーム状態を取得する
     * @returns {Object} 現在のズーム状態 (k, x, y)
     */
    getCurrentZoomStatus() {
        if (!this.calculator) return { k: 1, x: 0, y: 0 };
        return this.calculator.getZoomStatus();
    }

    /**
     * キャンバスの状態を取得する
     * @returns {Object} 現在のキャンバス状態 (x0, x1, y0, y1)
     */
    getCurrentCanvasStatus() {
        if (!this.calculator) return { x0: -10, x1: 10, y0: -10, y1: 10 };
        return this.calculator.getDomain();
    }

    /**
     * キャンバスのリサイズ後に更新する
     * @param {Object} status 新しいキャンバス状態
     * @param {Object} transform 新しい変換状態
     * @param {number} width 新しい幅
     * @param {number} height 新しい高さ
     */
    updateCanvasAfterResize(status, transform, width, height) {
        if (this.calculator) {
            this.calculator.updateDimensionsAndDomain(width, height, status, transform);
        }
    }
}