import { EquationBuilder } from "../../util/EquationBuilder.js";
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
            snap: false,
            quantizeControlAxis: false,
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
    approximate(points, domain = null) {
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
        const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
        const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
        const slope = dx !== 0 ? dy / dx : Infinity;
        const quantizeAxis = this.shouldQuantizeAxis();
        const xStep = quantizeAxis ? this.determineQuantStep(points, 'x', domain) : null;
        const yStep = quantizeAxis ? this.determineQuantStep(points, 'y', domain) : null;
        const quantizeValue = (value, step) => {
            if (!quantizeAxis || !Number.isFinite(step) || step <= 0 || !Number.isFinite(value)) {
                return value;
            }
            return Math.round(value / step) * step;
        };
        const quantizedStart = [
            quantizeValue(startPoint[0], xStep),
            quantizeValue(startPoint[1], yStep)
        ];
        const quantizedEnd = [
            quantizeValue(endPoint[0], xStep),
            quantizeValue(endPoint[1], yStep)
        ];
        const formatPoint = (point) => [
            this.formatAxisValue(point[0]),
            this.formatAxisValue(point[1])
        ];

        if (Math.abs(slope) > this.options.verticalSlopeThreshold) {
            const xRounded = this.formatAxisValue(quantizeValue(xMean, xStep));
            const startYRounded = this.formatAxisValue(quantizedStart[1]);
            const endYRounded = this.formatAxisValue(quantizedEnd[1]);
            const yMin = Math.min(startYRounded, endYRounded);
            const yMax = Math.max(startYRounded, endYRounded);
            const yRange = [yMin, yMax];
            const knots = [
                [xRounded, startYRounded],
                [xRounded, endYRounded]
            ];
            const modifiedSvgPath = `M ${xRounded},${startYRounded} L ${xRounded},${endYRounded}`;
            const equation = EquationBuilder.vertical({
                x: xRounded,
                yRange,
                meta: { linearity }
            });
            return {
                success: true,
                type: "vertical",
                originalPoints: points,
                knots,
                svgPath: modifiedSvgPath,
                latexEquations: [equation]
            };
        }
        else if (Math.abs(slope) < this.options.horizontalSlopeThreshold) {
            const yRounded = this.formatAxisValue(quantizeValue(yMean, yStep));
            const startXRounded = this.formatAxisValue(quantizedStart[0]);
            const endXRounded = this.formatAxisValue(quantizedEnd[0]);
            const xMin = Math.min(startXRounded, endXRounded);
            const xMax = Math.max(startXRounded, endXRounded);
            const xRange = [xMin, xMax];
            const equation = EquationBuilder.horizontal({
                y: yRounded,
                xRange,
                meta: { linearity }
            });
            const knots = [
                [startXRounded, yRounded],
                [endXRounded, yRounded]
            ];
            const modifiedSvgPath = `M ${startXRounded},${yRounded} L ${endXRounded},${yRounded}`;
            return {
                success: true,
                type: "constant",
                originalPoints: points,
                knots,
                svgPath: modifiedSvgPath,
                latexEquations: [equation]
            };
        }

        const formattedStart = formatPoint(quantizedStart);
        const formattedEnd = formatPoint(quantizedEnd);
        const svgPath = `M ${formattedStart[0]},${formattedStart[1]} L ${formattedEnd[0]},${formattedEnd[1]}`;
        const equation = EquationBuilder.linearThroughPoints(formattedStart, formattedEnd, {
            decimals: 3,
            meta: { linearity }
        });
        const resultType = equation?.type || "linear";

        return {
            success: true,
            type: resultType,
            originalPoints: points,
            knots: [formattedStart, formattedEnd],
            svgPath,
            latexEquations: [equation]
        };
    }

    shouldQuantizeAxis() {
        return !!(this.options.snap && this.options.quantizeControlAxis);
    }

    determineQuantStep(points, axis, domain) {
        const domainSpan = this._getDomainSpan(domain, axis);
        if (Number.isFinite(domainSpan) && domainSpan > 0) {
            return this._powerOfTenStep(domainSpan);
        }

        if (!Array.isArray(points) || !points.length) return 0;
        const values = points
            .map(point => (axis === 'y' ? point[1] : point[0]))
            .filter(Number.isFinite);
        if (!values.length) return 0;

        const diff = Math.max(...values) - Math.min(...values);
        if (Number.isFinite(diff) && diff > 0) {
            return this._powerOfTenStep(diff);
        }

        const magnitude = Math.max(...values.map(value => Math.abs(value)));
        if (!Number.isFinite(magnitude) || magnitude === 0) {
            return 0;
        }

        return this._powerOfTenStep(magnitude);
    }

    quantizeAxisValue(value, points, axis, domain) {
        if (!this.shouldQuantizeAxis()) {
            return value;
        }
        if (!Number.isFinite(value)) return value;
        const step = this.determineQuantStep(points, axis, domain);
        if (!step || !Number.isFinite(step)) return value;
        return Math.round(value / step) * step;
    }

    _getDomainSpan(domain, axis) {
        if (!domain || typeof domain !== 'object') return null;
        const minKey = axis === 'y' ? 'yMin' : 'xMin';
        const maxKey = axis === 'y' ? 'yMax' : 'xMax';
        const min = domain[minKey];
        const max = domain[maxKey];

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return null;
        }

        const span = max - min;
        return Number.isFinite(span) && span > 0 ? span : null;
    }

    _powerOfTenStep(span) {
        if (!Number.isFinite(span) || span <= 0) return 0;
        const exponent = Math.floor(Math.log10(span)) - 1;
        const clampedExponent = Math.max(Math.min(exponent, 2), -2);
        const step = Math.pow(10, clampedExponent);
        return step > 0 ? step : 0;
    }

    formatAxisValue(value) {
        return Number.isFinite(value) ? Number(value.toFixed(3)) : value;
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