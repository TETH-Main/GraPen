import { BSplineApproximator } from './BSplineApproximator.js';

/**
 * グラフ座標系で2次Bスプライン近似を行い、ベジェ制御点・係数・LaTeX式を返す
 */
export class QuadraticBSplineCurveApproximator {
    /**
     * @param {Object} options - 近似オプション
     */
    constructor(options = {}) {
        this.options = {
            minKnots: 2,
            maxKnots: 10,
            minKnotDistance: 0.05, // 最小ノード間隔（ドメイン幅に対する比率）
            ...options
        };
        this.logPrefix = "[QuadraticBSplineCurveApproximator]";

        this.result = null;
    }

    /**
     * 点列データから近似曲線を生成
     * @param {Array} inputPoints - グラフ座標系の点列 [[x, y], ...]
     * @param {Object} domain - ドメイン座標系 {xMin, xMax, yMin, yMax}
     * @param {Object} options - 近似オプション
     * @returns {Object} - 近似結果
     */
    approximate(inputPoints, domain, options) {
        if (!inputPoints || !Array.isArray(inputPoints) || inputPoints.length < this.options.minKnots) {
            return {
                success: false,
                message: "点の数が不足しています",
                originalPoints: inputPoints || [],
                latexEquations: []
            };
        }

        let points = inputPoints;
        const isMonotonic = this.checkMonotonicity(points, domain);

        if (!isMonotonic) {
            return {
                success: false,
                message: "点列が単調ではありません",
                originalPoints: points,
                latexEquations: []
            };
        } else if (isMonotonic === 'reversed') { // 単調減少
            console.log("単調減少の点列を反転します");
            points = [...points].reverse();
        }

        // 点の前処理：近すぎる点を除去
        const optimizedPoints = this.optimizeKnotPlacement(points, domain);

        // 最適化後の点数が不足している場合はエラー
        if (optimizedPoints.length < this.options.minKnots) {
            return {
                success: false,
                message: "最適化後の点の数が不足しています",
                originalPoints: points,
                latexEquations: []
            };
        }

        try {
            // 近似本体
            const approx = new BSplineApproximator(points, options);

            // 元座標系での近似結果を取得
            const result = approx.getApproximationResult(true);

            this.result = {
                success: true,
                type: "quadratic",
                originalPoints: points, // 元の点列
                processedPoints: optimizedPoints, // 処理後の点列
                knots: result.knots,
                preKnots: result.preKnots,
                originalKnots: result.originalKnots,
                bezierSegments: result.bezierSegments,
                svgPath: this.generateSvgPath(result.bezierSegments),
                splineCoefficients: result.splineCoefficients,
                latexEquations: result.latexEquations,
            };

            // approx.preKnotsのpriorityが0未満のものを取得
            const outerKnots = result.preKnots.filter(knot => knot.priority < 0);

            // 実際に使用された節点数を取得（maxKnots変更時のズレを防ぐ）
            const approxKnotsNum = Number.isInteger(approx?.knots_num) ? approx.knots_num : approx.options.initKnots;
            const requestedKnotsNum = Number.isInteger(options?.knotsNum) ? options.knotsNum : approxKnotsNum;
            const knotsNum = Math.max(
                this.options.minKnots,
                Math.min(requestedKnotsNum, approxKnotsNum)
            );

            // 節点数nに対し、優先度情報は 0 ~ n-3 で付与されている
            // 両端は制御点なので優先度は付与しないため、n-2個の優先度を決定する
            const priorityKnots = [];

            const initialCandidate = result.preKnots.find(knot => knot && knot.priority === knotsNum - 3);
            if (initialCandidate) priorityKnots.push(initialCandidate);

            // 指定されたknots数から1ずつ減らしていき優先度を決定
            for (let i = knotsNum - 1; i >= 3; i--) {
                const candidates = approx.GetPriority(i);
                if (!Array.isArray(candidates)) continue;
                const match = candidates.find(knot => knot && knot.priority === i - 3);
                if (match) priorityKnots.push(match);
            }

            priorityKnots.push(...outerKnots);
            this.result.preKnots = priorityKnots
                .flat()
                .filter(Boolean)
                .sort((a, b) => a.knot - b.knot);

            return this.result;
        } catch (e) {
            console.error(this.logPrefix, "近似処理でエラーが発生しました:", e);
            return {
                success: false,
                message: e.message,
                originalPoints: points,
                latexEquations: []
            };
        }
    }

    /**
     * カスタムノットを使用して点列データから近似曲線を生成
     * @param {Array} inputPoints - グラフ座標系の点列 [[x, y], ...]
     * @param {Array} customKnots - カスタムノット列（x座標値）
     * @param {Object} domain - ドメイン座標系 {xMin, xMax, yMin, yMax}
     * @param {Object} options - 近似オプション
     * @returns {Object} - 近似結果
     */
    approximateWithCustomKnots(inputPoints, customKnots, domain, options = {}) {
        if (!inputPoints || !Array.isArray(inputPoints) || inputPoints.length < this.options.minKnots) {
            return {
                success: false,
                message: "点の数が不足しています",
                originalPoints: inputPoints || [],
                latexEquations: []
            };
        }

        if (!customKnots || !Array.isArray(customKnots) || customKnots.length < this.options.minKnots) {
            return {
                success: false,
                message: "ノット数が不足しています",
                originalPoints: inputPoints,
                latexEquations: []
            };
        }

        let points = inputPoints;
        const isMonotonic = this.checkMonotonicity(points, domain);

        if (!isMonotonic) {
            return {
                success: false,
                message: "点列が単調ではありません",
                originalPoints: points,
                latexEquations: []
            };
        } else if (isMonotonic === 'reversed') {
            console.log("単調減少の点列を反転します");
            points = [...points].reverse();
        }

        try {

            // 近似本体のインスタンス作成
            const approx = new BSplineApproximator(points, options);

            // カスタムノットを設定
            approx.setCustomKnots(customKnots);

            // 元座標系での近似結果を取得
            const result = approx.getApproximationResult();

            this.result = {
                success: true,
                type: "quadratic",
                originalPoints: points,
                customKnots: customKnots,
                knots: result.knots,
                preKnots: result.preKnots,
                originalKnots: result.originalKnots,
                bezierSegments: result.bezierSegments,
                svgPath: this.generateSvgPath(result.bezierSegments),
                splineCoefficients: result.splineCoefficients,
                latexEquations: result.latexEquations,
            };

            return this.result;

        } catch (e) {
            console.error(this.logPrefix, "近似処理でエラーが発生しました:", e);
            return {
                success: false,
                message: e.message,
                originalPoints: points,
                latexEquations: []
            };
        }
    }

    /**
     * 
     * @param {Object} data // 制御点データ
     * @returns 
     */
    generateSvgPath(data) {
        if (!data || data.length === 0) {
            return "";
        }

        const pathCommands = [];

        // // 最初の点の移動コマンド (M) を追加
        // const firstPoint = data[0].start;
        // pathCommands.push(`M ${firstPoint[0]} ${firstPoint[1]}`);

        // // 二次ベジェ曲線コマンド (Q) を順に追加
        // for (const segment of data) {
        //     const controlPoint = segment.control;
        //     const endPoint = segment.end;
        //     pathCommands.push(`Q ${controlPoint[0]} ${controlPoint[1]} ${endPoint[0]} ${endPoint[1]}`);
        // }

        // 二次ベジェ曲線コマンド (Q) を順に追加
        for (const segment of data) {
            const firstPoint = segment.start;
            const controlPoint = segment.control;
            const endPoint = segment.end;
            pathCommands.push(`M ${firstPoint[0]} ${firstPoint[1]} Q ${controlPoint[0]} ${controlPoint[1]} ${endPoint[0]} ${endPoint[1]}`);
        }

        return pathCommands.join(" ");
    }

    /**
     * 点列の単調性をチェック（x座標についてほぼ単調増加・減少かどうか）
     * @param {Array} points - ドメイン座標系の点列 [[x1,y1], [x2,y2], ...]
     * @param {Object} domain - {xMin, xMax, yMin, yMax}
     * @param {number} [toleranceRatio=1e-3] - x軸全体幅に対する許容比（例: 0.001 = 0.1%）
     * @returns {true|'reversed'|false} 単調増加:true、単調減少:'reversed'、その他:false
     */
    checkMonotonicity(points, domain, toleranceRatio = 1e-3) {
        if (!Array.isArray(points)) {
            console.error('Input must be an array of points.');
            return false;
        }

        if (points.length <= 1) return true;

        const { xMin, xMax } = domain || {};
        if (typeof xMin !== 'number' || typeof xMax !== 'number' || xMax <= xMin) {
            console.error('Invalid x domain:', domain);
            return false;
        }

        const xRange = xMax - xMin;
        const tolerance = xRange * toleranceRatio;

        for (const point of points) {
            if (!Array.isArray(point) || point.length !== 2 ||
                typeof point[0] !== 'number' || typeof point[1] !== 'number') {
                console.warn('Invalid point format:', point);
                return false;
            }
        }

        // 初期判定：最初に傾向をつかむ
        let positiveCount = 0;
        let negativeCount = 0;

        for (let i = 1; i < points.length; i++) {
            const diff = points[i][0] - points[i - 1][0];

            if (diff > tolerance) {
                positiveCount++;
            } else if (diff < -tolerance) {
                negativeCount++;
            }
            // 小さいdiff（-tolerance <= diff <= tolerance）は無視
        }

        if (positiveCount > 0 && negativeCount === 0) {
            return true;          // 単調増加
        } else if (negativeCount > 0 && positiveCount === 0) {
            return 'reversed';    // 単調減少
        } else {
            return false;         // どちらでもない（ガタガタ）
        }
    }

    /**
     * 節点配置を最適化する
     * @param {Array} points - 点列 [[x, y], ...]
     * @param {Object} domain - ドメイン {xMin, xMax, yMin, yMax}
     * @returns {Array} - 最適化された点列
     */
    optimizeKnotPlacement(points, domain) {
        if (points.length <= this.options.minKnots) {
            return points; // 点が少なすぎる場合はそのまま返す
        }

        const { xMin, xMax } = domain;
        const domainWidth = xMax - xMin;
        const minDistance = domainWidth * this.options.minKnotDistance;

        // 最適な点数を決定（最大数を超えないように）
        const optimalKnotCount = Math.min(
            points.length,
            Math.max(this.options.minKnots, Math.min(this.options.maxKnots, Math.floor(points.length * 0.8)))
        );

        // 点間の距離が近すぎるものを除去
        const filteredPoints = [];
        let lastAddedPoint = null;

        for (const point of points) {
            if (!lastAddedPoint ||
                Math.abs(point[0] - lastAddedPoint[0]) >= minDistance ||
                filteredPoints.length < this.options.minKnots) {
                filteredPoints.push(point);
                lastAddedPoint = point;
            }
        }

        // もしフィルタ後の点が多すぎる場合は、均等に間引く
        if (filteredPoints.length > optimalKnotCount) {
            const step = filteredPoints.length / optimalKnotCount;
            const resultPoints = [];

            // 最初と最後の点は必ず含める
            resultPoints.push(filteredPoints[0]);

            // 中間点を均等に選択
            for (let i = 1; i < optimalKnotCount - 1; i++) {
                const index = Math.min(Math.floor(i * step), filteredPoints.length - 2);
                resultPoints.push(filteredPoints[index]);
            }

            // 最後の点を追加
            resultPoints.push(filteredPoints[filteredPoints.length - 1]);

            return resultPoints;
        }

        return filteredPoints;
    }

}
