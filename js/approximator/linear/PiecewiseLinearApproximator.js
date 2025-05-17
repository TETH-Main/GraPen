import { LinearFunctionApproximator } from './LinearFunctionApproximator.js';
import { signedFixedString } from "../../util/NumberUtil.js";

/**
 * 手書きの曲線をつなぎ合わせた直線（折れ線）で近似する
 */
export class PiecewiseLinearApproximator {
    /**
     * @param {Object} options - 判定オプション
     */
    constructor(options = {}) {
        this.options = {
            linearityThreshold: 0.95, // 全体としての線形性の閾値
            segmentLinearityThreshold: 0.93, // 各セグメントの線形性の閾値
            percentTolerance: 0.1, // 5%
            verticalSlopeThreshold: 10, // この値より大きい傾きは垂直と見なす
            horizontalSlopeThreshold: 0.1, // この値より小さい傾きは水平と見なす
            ...options
        };
        this.linearApproximator = new LinearFunctionApproximator({
            linearityThreshold: this.options.segmentLinearityThreshold,
            percentTolerance: this.options.percentTolerance
        });
        this.logPrefix = "[PiecewiseLinearApproximator]";
    }

    /**
     * 点列データから折れ線近似を試みる
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

        // まず、単一の直線で表現できるか試す
        // const singleLineResult = this.linearApproximator.approximate(points);
        // if (singleLineResult.success) {
        //     return singleLineResult;
        // }

        // 折れ線近似のために点列を簡略化（Douglas-Peucker アルゴリズム）
        const simplifiedPoints = this.simplifyPoints(points, this.options.linearityThreshold);

        if (simplifiedPoints.length < 2) {
            return {
                success: false,
                message: "折れ線近似に失敗しました",
                originalPoints: points,
                latexEquations: []
            };
        } else if (simplifiedPoints.length === 2) {
            return {
                success: false,
                message: "直線近似はできません",
                originalPoints: points,
                latexEquations: []
            }
        }

        // 簡略化した点列からセグメントを作成
        const segments = [];
        const linearityScores = [];
        const latexEquations = [];

        // 各セグメントを処理（まず全てのセグメント情報を収集）
        for (let i = 0; i < simplifiedPoints.length - 1; i++) {
            const segmentPoints = this.getPointsInRange(points, simplifiedPoints[i], simplifiedPoints[i + 1]);
            const segmentResult = this.processSegment(segmentPoints);

            segments.push(segmentResult);
            linearityScores.push(segmentResult.linearity || 0);

            // LaTeX方程式を追加
            if (segmentResult.latexEquation) {
                latexEquations.push(segmentResult.latexEquation);
            }
        }

        // ノードを調整（vertical, constantセグメントの接続点を修正）
        // 最初のノードは最初のセグメントのadjustedStartPointまたはstartPointを使う
        const firstSegment = segments[0];
        const knots = [
            firstSegment.adjustedStartPoint ? firstSegment.adjustedStartPoint : firstSegment.startPoint
        ];
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];

            // 現在のセグメントのタイプに基づいて接続点を調整
            if (currentSegment.type === "vertical") {
                // verticalの場合は次のセグメントの関数で計算
                const adjustedEndPoint = this.adjustVerticalSegmentEnd(
                    currentSegment.adjustedStartPoint || currentSegment.startPoint,
                    nextSegment
                );
                currentSegment.adjustedEndPoint = adjustedEndPoint;
                knots.push(adjustedEndPoint);
            }
            else if (currentSegment.type === "constant") {
                // constantの場合も次のセグメントの関数で計算
                const adjustedEndPoint = this.adjustConstantSegmentEnd(
                    currentSegment.adjustedStartPoint || currentSegment.startPoint,
                    nextSegment
                );
                currentSegment.adjustedEndPoint = adjustedEndPoint;
                knots.push(adjustedEndPoint);
            }
            else {
                // 通常の線形セグメントの場合は調整せずにそのまま
                knots.push(currentSegment.adjustedEndPoint || currentSegment.endPoint);
            }
        }

        // 最後のセグメントの終点を追加
        if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1];
            let lastKnot = lastSegment.adjustedEndPoint || lastSegment.endPoint;

            // 始点と終点が近い場合は一致させる
            const firstKnot = knots[0];
            const dist = Math.hypot(lastKnot[0] - firstKnot[0], lastKnot[1] - firstKnot[1]);
            const threshold = 1e-6; // 距離がこの値以下なら一致とみなす
            if (dist < threshold) {
                lastKnot = [...firstKnot];
            }
            knots.push(lastKnot);
        }

        // SVGパスを更新
        let svgPath = `M ${knots[0][0]},${knots[0][1]}`;
        for (let i = 1; i < knots.length; i++) {
            svgPath += ` L ${knots[i][0]},${knots[i][1]}`;
        }

        // 平均線形性スコアを計算
        const averageLinearity = linearityScores.reduce((sum, score) => sum + score, 0) / linearityScores.length;

        return {
            success: averageLinearity >= this.options.segmentLinearityThreshold,
            type: "piecewiseLinear",
            originalPoints: points,
            simplifiedPoints,
            segments,
            knots,
            svgPath,
            latexEquations,
            averageLinearity
        };
    }

    /**
     * Douglas-Peucker アルゴリズムで点列を簡略化
     * @param {Array} points - 点列
     * @param {number} epsilon - 許容誤差
     * @returns {Array} 簡略化された点列
     */
    simplifyPoints(points, epsilon) {
        if (points.length <= 2) {
            return [...points];
        }

        let maxDistance = 0;
        let index = 0;
        const [start, end] = [points[0], points[points.length - 1]];

        // 始点と終点を結ぶ線から最も離れている点を見つける
        for (let i = 1; i < points.length - 1; i++) {
            const distance = this.perpendicularDistance(points[i], start, end);
            if (distance > maxDistance) {
                maxDistance = distance;
                index = i;
            }
        }

        // 最大距離が閾値より大きい場合は、その点で分割して再帰的に処理
        if (maxDistance > epsilon) {
            const firstPart = this.simplifyPoints(points.slice(0, index + 1), epsilon);
            const secondPart = this.simplifyPoints(points.slice(index), epsilon);

            // 重複を避けるために secondPart の最初の要素を除去
            return [...firstPart, ...secondPart.slice(1)];
        }

        // 閾値以下なら始点と終点だけ返す
        return [start, end];
    }

    /**
     * 点から線分までの垂直距離を計算
     * @param {Array} point - 点 [x, y]
     * @param {Array} lineStart - 線分の始点 [x, y]
     * @param {Array} lineEnd - 線分の終点 [x, y]
     * @returns {number} 垂直距離
     */
    perpendicularDistance(point, lineStart, lineEnd) {
        const [x, y] = point;
        const [x1, y1] = lineStart;
        const [x2, y2] = lineEnd;

        const dx = x2 - x1;
        const dy = y2 - y1;

        // 線分の長さの二乗
        const lineLengthSquared = dx * dx + dy * dy;

        if (lineLengthSquared === 0) {
            // 始点と終点が同じ場合、点との距離を返す
            return Math.hypot(x - x1, y - y1);
        }

        // 線分上の最も近い点を特定するためのパラメータ t
        const t = ((x - x1) * dx + (y - y1) * dy) / lineLengthSquared;

        if (t < 0) {
            // 始点が最も近い
            return Math.hypot(x - x1, y - y1);
        } else if (t > 1) {
            // 終点が最も近い
            return Math.hypot(x - x2, y - y2);
        } else {
            // 線分上の点が最も近い
            const projectionX = x1 + t * dx;
            const projectionY = y1 + t * dy;
            return Math.hypot(x - projectionX, y - projectionY);
        }
    }

    /**
     * 2点間の元の点列から点を抽出
     * @param {Array} allPoints - 全ての点
     * @param {Array} start - 開始点
     * @param {Array} end - 終了点
     * @returns {Array} 範囲内の点
     */
    getPointsInRange(allPoints, start, end) {
        const startIndex = allPoints.findIndex(p => p[0] === start[0] && p[1] === start[1]);
        const endIndex = allPoints.findIndex(p => p[0] === end[0] && p[1] === end[1]);

        if (startIndex === -1 || endIndex === -1) {
            // 完全一致する点が見つからない場合は、近似的に範囲を決定
            const points = [];
            const startX = start[0];
            const endX = end[0];

            for (const point of allPoints) {
                const [x, y] = point;
                if ((x >= startX && x <= endX) || (x <= startX && x >= endX)) {
                    points.push(point);
                }
            }

            return points;
        }

        return allPoints.slice(
            Math.min(startIndex, endIndex),
            Math.max(startIndex, endIndex) + 1
        );
    }

    /**
     * 個々のセグメントを処理し、種類を判断
     * @param {Array} points - セグメント内の点
     * @returns {Object} セグメント情報
     */
    processSegment(points) {
        if (points.length < 2) {
            return {
                success: false,
                message: "セグメント内の点が不足しています"
            };
        }

        const startPoint = points[0];
        const endPoint = points[points.length - 1];
        let adjustedStartPoint = [...startPoint];
        let adjustedEndPoint = [...endPoint];

        // 線形近似を試みる
        const linearResult = this.linearApproximator.approximate(points);
        const linearity = this.calculateLinearity(points, startPoint, endPoint);

        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
        const xTol = Math.max(Math.abs(xMean * this.options.percentTolerance), 1e-10);
        const yTol = Math.max(Math.abs(yMean * this.options.percentTolerance), 1e-10);

        // xとyの変化を計算
        const dx = endPoint[0] - startPoint[0];
        const dy = endPoint[1] - startPoint[1];

        // 傾きを計算（垂直線の場合は無限大になるので注意）
        const slope = dx !== 0 ? dy / dx : Infinity;
        const intercept = dx !== 0 ? startPoint[1] - slope * startPoint[0] : null;

        let type = "linear";
        let latexEquation = null;

        // 垂直線の判定（xがほぼ一定か、傾きが閾値より大きい）
        const allXEqual = xs.every(x => Math.abs(x - xs[0]) < xTol);
        if (allXEqual || Math.abs(slope) > this.options.verticalSlopeThreshold) {
            type = "vertical";
            const xAvg = xMean.toFixed(3);
            const yStart = Math.min(...ys).toFixed(3);
            const yEnd = Math.max(...ys).toFixed(3);

            // x座標を平均に調整
            adjustedStartPoint[0] = parseFloat(xAvg);
            adjustedEndPoint[0] = parseFloat(xAvg);

            latexEquation = {
                type: "vertical",
                formula: `x = ${xAvg}`,
                domain: { start: yStart, end: yEnd }
            };
        }
        // 水平線の判定（yがほぼ一定か、傾きが閾値より小さい）
        else if (ys.every(y => Math.abs(y - ys[0]) < yTol) || Math.abs(slope) < this.options.horizontalSlopeThreshold) {
            type = "constant";
            const yAvg = yMean.toFixed(3);
            const xStart = Math.min(...xs).toFixed(3);
            const xEnd = Math.max(...xs).toFixed(3);

            // y座標を平均に調整
            adjustedStartPoint[1] = parseFloat(yAvg);
            adjustedEndPoint[1] = parseFloat(yAvg);

            latexEquation = {
                type: "constant",
                formula: `y = ${yAvg}`,
                domain: { start: xStart, end: xEnd }
            };
        }
        // 一般の直線
        else {
            const slopeFormatted = slope.toFixed(3);
            const interceptFormatted = Math.abs(intercept).toFixed(3);
            // y = mx + b の形に変換
            // `y = ${slopeFormatted}x ${intercept >= 0 ? '+ ' : '- '}${interceptFormatted}`,

            // y = m(x - x1) + y1 の形に変換
            const formula = `y = ${slopeFormatted}(x ${signedFixedString(-startPoint[0], 3)}) ${signedFixedString(startPoint[1], 3)}`;

            const xStart = Math.min(startPoint[0], endPoint[0]).toFixed(3);
            const xEnd = Math.max(startPoint[0], endPoint[0]).toFixed(3);

            latexEquation = {
                type: "linear",
                formula: formula,
                domain: { start: xStart, end: xEnd }
            };
        }

        return {
            success: true,
            type,
            startPoint,
            endPoint,
            adjustedStartPoint,
            adjustedEndPoint,
            linearity,
            latexEquation
        };
    }

    /**
     * 点列の線形性を計算
     * @param {Array} points - 点列
     * @param {Array} start - 開始点
     * @param {Array} end - 終了点
     * @returns {number} 線形性スコア (0-1)
     */
    calculateLinearity(points, start, end) {
        if (points.length < 3) return 1.0; // 2点のみの場合は完全に線形

        const [x1, y1] = start;
        const [x2, y2] = end;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);

        if (length === 0) return 0;

        let maxDist = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const [x0, y0] = points[i];
            const dist = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / length;
            if (dist > maxDist) maxDist = dist;
        }

        return 1 - (maxDist / length);
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

        // LinearFunctionApproximator の設定も更新
        this.linearApproximator.setOptions({
            linearityThreshold: this.options.segmentLinearityThreshold,
            percentTolerance: this.options.percentTolerance
        });
    }

    /**
     * 垂直線セグメントの終点を調整
     * 終点のx座標を開始点のx座標に保ち、y座標は次のセグメントの関数で計算
     * @param {Array} startPoint - 開始点 [x, y]
     * @param {Object} nextSegment - 次のセグメント情報
     * @returns {Array} 調整された終点 [x, y]
     */
    adjustVerticalSegmentEnd(startPoint, nextSegment) {
        const x = startPoint[0];
        let y;

        // 次のセグメントの種類に基づいて終点のy座標を計算
        if (nextSegment.type === "linear") {
            // 次のセグメントが線形: y = ax + b
            const latexEq = nextSegment.latexEquation;
            if (latexEq && latexEq.formula) {
                // 式からaとbを抽出
                const formula = latexEq.formula;
                const matches = formula.match(/y\s*=\s*([-+]?\d*\.?\d*)[xX]\s*([-+]\s*\d*\.?\d*)?/);

                if (matches && matches.length >= 2) {
                    const a = parseFloat(matches[1] || "1");
                    // bの抽出（符号を考慮）
                    let b = 0;
                    if (matches[2]) {
                        if (matches[2].includes('+')) {
                            b = parseFloat(matches[2].replace(/[+\s]/g, ''));
                        } else if (matches[2].includes('-')) {
                            b = -parseFloat(matches[2].replace(/[-\s]/g, ''));
                        }
                    }

                    // y = ax + b
                    y = a * x + b;
                } else {
                    // 式の解析に失敗した場合は次のセグメントの開始点のy座標を使用
                    y = nextSegment.startPoint[1];
                }
            } else {
                y = nextSegment.startPoint[1];
            }
        } else if (nextSegment.type === "constant") {
            // 次のセグメントが定数: y = b
            const latexEq = nextSegment.latexEquation;
            if (latexEq && latexEq.formula) {
                const matches = latexEq.formula.match(/y\s*=\s*([-+]?\d*\.?\d*)/);
                if (matches && matches.length >= 2) {
                    y = parseFloat(matches[1]);
                } else {
                    y = nextSegment.startPoint[1];
                }
            } else {
                y = nextSegment.startPoint[1];
            }
        } else if (nextSegment.type === "vertical") {
            // 次のセグメントも垂直線の場合、現在の終点をそのまま使用
            y = nextSegment.startPoint[1];
        } else {
            // その他の場合は次のセグメントの開始点のy座標を使用
            y = nextSegment.startPoint[1];
        }

        return [x, y];
    }

    /**
     * 水平線セグメントの終点を調整
     * 終点のy座標を開始点のy座標に保ち、x座標は次のセグメントの関数で計算
     * @param {Array} startPoint - 開始点 [x, y]
     * @param {Object} nextSegment - 次のセグメント情報
     * @returns {Array} 調整された終点 [x, y]
     */
    adjustConstantSegmentEnd(startPoint, nextSegment) {
        const y = startPoint[1];
        let x;

        // 次のセグメントの種類に基づいて終点のx座標を計算
        if (nextSegment.type === "linear") {
            // 次のセグメントが線形: y = ax + b
            const latexEq = nextSegment.latexEquation;
            if (latexEq && latexEq.formula) {
                // 式からaとbを抽出
                const formula = latexEq.formula;
                const matches = formula.match(/y\s*=\s*([-+]?\d*\.?\d*)[xX]\s*([-+]\s*\d*\.?\d*)?/);

                if (matches && matches.length >= 2) {
                    const a = parseFloat(matches[1] || "1");
                    // bの抽出（符号を考慮）
                    let b = 0;
                    if (matches[2]) {
                        if (matches[2].includes('+')) {
                            b = parseFloat(matches[2].replace(/[+\s]/g, ''));
                        } else if (matches[2].includes('-')) {
                            b = -parseFloat(matches[2].replace(/[-\s]/g, ''));
                        }
                    }

                    // y = ax + b を変形して x = (y - b) / a
                    if (Math.abs(a) > 1e-10) {
                        x = (y - b) / a;
                    } else {
                        // 傾きがゼロに近い場合は次のセグメントの開始点のx座標を使用
                        x = nextSegment.startPoint[0];
                    }
                } else {
                    x = nextSegment.startPoint[0];
                }
            } else {
                x = nextSegment.startPoint[0];
            }
        } else if (nextSegment.type === "vertical") {
            // 次のセグメントが垂直線: x = a
            const latexEq = nextSegment.latexEquation;
            if (latexEq && latexEq.formula) {
                const matches = latexEq.formula.match(/x\s*=\s*([-+]?\d*\.?\d*)/);
                if (matches && matches.length >= 2) {
                    x = parseFloat(matches[1]);
                } else {
                    x = nextSegment.startPoint[0];
                }
            } else {
                x = nextSegment.startPoint[0];
            }
        } else if (nextSegment.type === "constant") {
            // 次のセグメントも水平線の場合、現在の終点をそのまま使用
            x = nextSegment.startPoint[0];
        } else {
            // その他の場合は次のセグメントの開始点のx座標を使用
            x = nextSegment.startPoint[0];
        }

        return [x, y];
    }
}
