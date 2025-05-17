import { signedFixedString } from "../../util/NumberUtil.js";
/**
 * グラフ座標系で一次関数近似（直線判定）を行い、LaTeX式・制御点などを返す
 */
export class LinearFunctionApproximator {
    /**
     * @param {Object} options - 判定オプション
     */
    constructor(options = {}) {
        this.options = {
            linearityThreshold: 0.95,
            percentTolerance: 0.1, // 1%
            verticalSlopeThreshold: 10, // この値より大きい傾きは垂直と見なす
            horizontalSlopeThreshold: 0.1, // この値より小さい傾きは水平と見なす
            ...options
        };
        this.logPrefix = "[LinearFunctionApproximator]";
        this.result = null;
    }

    /**
     * 点列データから直線近似を試みる
     * @param {Array} points - グラフ座標系の点列 [[x, y], ...]
     * @returns {Object} - 判定・近似結果
     */
    approximate(points) {
        if (!points || !Array.isArray(points) || points.length < 2) {
            return {
                success: false,
                message: "2点以上必要です",
                originalPoints: points || [],
                latexEquations: []
            };
        }

        const startPoint = points[0];
        const endPoint = points[points.length - 1];
        const dx = endPoint[0] - startPoint[0];
        const dy = endPoint[1] - startPoint[1];
        const [x1, y1] = startPoint;
        const [x2, y2] = endPoint;
        const length = Math.hypot(dx, dy);
        if (length === 0) {
            return {
                success: false,
                message: "始点と終点が同一です",
                originalPoints: points,
                latexEquations: []
            };
        }

        // --- 直線性（線形性）を最初に判定 ---
        let maxDist = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const [x0, y0] = points[i];
            const dist = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / length;
            if (dist > maxDist) maxDist = dist;
        }
        const linearity = 1 - (maxDist / length);

        if (linearity < this.options.linearityThreshold) {
            return {
                success: false,
                message: "線形性が閾値を満たしません",
                originalPoints: points,
                latexEquations: []
            };
        }
        // --- ここまで直線性判定 ---

        // 以降は直線性が十分な場合のみ実行
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        const slope = dx !== 0 ? dy / dx : Infinity;
        const knots = [startPoint, endPoint];
        const svgPath = `M ${startPoint[0]},${startPoint[1]} L ${endPoint[0]},${endPoint[1]}`;

        if (Math.abs(slope) > this.options.verticalSlopeThreshold) {
            const yStart = Math.min(...ys).toFixed(3);
            const yEnd = Math.max(...ys).toFixed(3);
            knots[1] = [knots[0][0], knots[1][1]];
            const modifiedSvgPath = `M ${knots[0][0]},${knots[0][1]} L ${knots[1][0]},${knots[1][1]}`;
            return {
                success: true,
                type: "vertical",
                originalPoints: points,
                knots,
                svgPath: modifiedSvgPath,
                latexEquations: [{
                    type: "vertical",
                    formula: `x = ${xs[0].toFixed(3)}`,
                    domain: { start: yStart, end: yEnd }
                }]
            };
        }
        else if (Math.abs(slope) < this.options.horizontalSlopeThreshold) {
            const xStart = Math.min(...xs).toFixed(3);
            const xEnd = Math.max(...xs).toFixed(3);
            knots[1] = [knots[1][0], knots[0][1]];
            const modifiedSvgPath = `M ${knots[0][0]},${knots[0][1]} L ${knots[1][0]},${knots[1][1]}`;
            return {
                success: true,
                type: "constant",
                originalPoints: points,
                knots,
                svgPath: modifiedSvgPath,
                latexEquations: [{
                    type: "constant",
                    formula: `y = ${ys[0].toFixed(3)}`,
                    domain: { start: xStart, end: xEnd }
                }]
            };
        }

        // y = m(x - x1) + y1 の形に変換
        const slope2 = dy / dx;
        const formula = `y = ${slope2.toFixed(3)}(x ${signedFixedString(-x1, 3)}) ${signedFixedString(y1, 3)}`;

        return {
            success: true,
            type: "linear",
            originalPoints: points,
            knots,
            svgPath,
            latexEquations: [{
                type: "linear",
                formula,
                domain: {
                    start: Math.min(x1, x2).toFixed(3),
                    end: Math.max(x1, x2).toFixed(3)
                }
            }]
        };
    }

    /**
     * 設定を更新する
     * @param {Object} options - 更新するオプション
     */
    setOptions(options) {
        this.options = {
            ...this.options,
            ...options
        };
    }
}