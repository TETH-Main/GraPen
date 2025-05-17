import { signedFixedString } from "../../util/NumberUtil.js";

/**
 * 2次B-スプライン曲線近似クラス
 * 手書き点列データを滑らかな2次B-スプライン曲線で近似します
 */
export class BSplineApproximator {
    /**
     * @param {Array} points - 点列データ [[x1, y1], ...]
     * @param {Object} options - 近似オプション
     */
    constructor(points, options = {}) {
        this.options = {
            degree: 2,
            minKnots: 2,
            maxKnots: 15,
            ...options
        };
        this.originalPoints = points;
        this._normalizePoints();
        this.reset(this.options.maxKnots);
    }

    /**
     * 点列を[0,1]区間に正規化し、viewport情報も保持
     */
    _normalizePoints() {
        const xs = this.originalPoints.map(p => p[0]);
        const ys = this.originalPoints.map(p => p[1]);
        this.minX = Math.min(...xs);
        this.maxX = Math.max(...xs);
        this.minY = Math.min(...ys);
        this.maxY = Math.max(...ys);
        this.points = this.originalPoints.map(([x, y]) => [
            (x - this.minX) / (this.maxX - this.minX || 1),
            (y - this.minY) / (this.maxY - this.minY || 1)
        ]);
    }

    /**
     * 正規化座標→元座標系へ変換
     */
    denormalize([tx, ty]) {
        return [
            this.minX + tx * (this.maxX - this.minX),
            this.minY + ty * (this.maxY - this.minY)
        ];
    }

    /**
     * 近似処理の初期化
     */
    reset(numKnots = 15) {
        this.n = this.points.length;
        this.knots_num = Math.max(this.options.minKnots, Math.min(this.options.maxKnots, numKnots));
        this.preKnots = [];
        this._initPreKnots();
        this.setinitKnots();
        this.setNewKnots(this.knots_num);
        this.knots_m = this.knots.length;
        this._setGraphRange();
        this.setAb();
        this.solveAb();
        this.getCoefficient();
        this.getSecondDeri();
    }

    /**
     * ノット列の初期化
     * @param {number} k - ノット数
     */
    adjustKnotCount(k) {
        // 有効範囲内に制限
        this.knots_num = Math.max(this.options.minKnots, Math.min(this.options.maxKnots, k));

        // ノット列の再初期化
        this.preKnots = [];
        this._initPreKnots();
        this.setinitKnots();
        this.setNewKnots(this.knots_num);
        this.knots_m = this.knots.length;

        // グラフ範囲の再設定
        this._setGraphRange();

        // 近似計算の再実行
        this.setAb();
        this.solveAb();
        this.getCoefficient();
        this.getSecondDeri();

        return this;
    }

    /**
     * preKnotsの初期化
     * 始点より小さいxのノット2点、終点より大きいxのノット2点を追加
     */
    _initPreKnots() {
        // 曲率変曲点を優先して節点配置
        const n = this.knots_num;
        // const inflections = this._computeInflectionPoints(this.points);
        // const knots = this._distributeKnotsByInflection(inflections, n);
        const knots = this._findDivisionPoints(this.points, n);

        this.preKnots = [];
        // 通常ノット
        for (let i = 0; i < knots.length; i++) {
            this.preKnots.push({
                knot: knots[i],
                priority: -1,
                diff: -9999
            });
        }
        // 始点より小さいノット2点
        this.preKnots.unshift(
            { knot: -0.1, priority: -1, diff: -9999 },
            { knot: -0.05, priority: -1, diff: -9999 }
        );
        // 終点より大きいノット2点
        this.preKnots.push(
            { knot: 1.05, priority: -1, diff: -9999 },
            { knot: 1.1, priority: -1, diff: -9999 }
        );
    }

    /**
     * 曲率の変曲点（符号反転点）を求める
     * @param {Array} points - 正規化済み点列
     * @returns {Array} - 各変曲点のパラメータ値（0～1）
     */
    _computeInflectionPoints(points) {
        const n = points.length;
        if (n < 3) return [];
        const curvature = [];
        // 曲率計算
        for (let i = 1; i < n - 1; i++) {
            const [x0, y0] = points[i - 1];
            const [x1, y1] = points[i];
            const [x2, y2] = points[i + 1];
            const dx1 = x1 - x0, dy1 = y1 - y0;
            const dx2 = x2 - x1, dy2 = y2 - y1;
            const cross = dx1 * dy2 - dy1 * dx2;
            const norm1 = Math.hypot(dx1, dy1);
            const norm2 = Math.hypot(dx2, dy2);
            const denom = Math.pow(norm1 * norm2, 1.5) || 1e-8;
            curvature[i] = cross / denom;
        }
        // 変曲点（符号反転点）検出
        const inflections = [];
        for (let i = 2; i < n - 2; i++) {
            if (curvature[i - 1] * curvature[i] < 0) {
                // 線形補間でより正確な位置を推定
                const t = (i - 1 + Math.abs(curvature[i - 1]) / (Math.abs(curvature[i - 1]) + Math.abs(curvature[i]))) / (n - 1);
                if (t > 0 && t < 1) inflections.push(t);
            }
        }
        return inflections;
    }

    /**
     * 変曲点を優先しつつ、均等性も考慮してノットを配置
     * @param {Array} inflections - 変曲点のパラメータ値
     * @param {number} n - 節点数
     * @returns {Array} - ノット列（0～1）
     */
    _distributeKnotsByInflection(inflections, n) {
        // 始点・終点は必ず含める
        const knots = [0, 1];
        // 変曲点を一旦すべて追加
        for (const t of inflections) {
            if (t > 0 && t < 1) knots.push(t);
        }
        // 必要数に満たない場合は均等配置で補う
        while (knots.length < n) {
            // 既存ノット間の最大間隔を探し、その中点に追加
            let maxGap = 0, insertIdx = 1, insertT = 0;
            knots.sort((a, b) => a - b);
            for (let i = 1; i < knots.length; i++) {
                const gap = knots[i] - knots[i - 1];
                if (gap > maxGap) {
                    maxGap = gap;
                    insertIdx = i;
                    insertT = (knots[i] + knots[i - 1]) / 2;
                }
            }
            knots.splice(insertIdx, 0, insertT);
        }
        // 多すぎる場合は間隔が狭いものを間引く
        while (knots.length > n) {
            knots.sort((a, b) => a - b);
            let minGap = Infinity, removeIdx = -1;
            for (let i = 1; i < knots.length - 1; i++) { // 始点・終点は除外
                const gap = knots[i + 1] - knots[i - 1];
                if (gap < minGap) {
                    minGap = gap;
                    removeIdx = i;
                }
            }
            if (removeIdx > 0 && removeIdx < knots.length - 1) {
                knots.splice(removeIdx, 1);
            } else {
                break;
            }
        }
        knots.sort((a, b) => a - b);
        return knots;
    }

    /**
     * 分割点を見つける関数（0-1の範囲で返す）
     */
    _findDivisionPoints(points, knotsNum = 10) {
        if (points.length <= 2) {
            return [0, 1]; // 開始と終了を表す0と1を返す
        }

        const rawDivisionPoints = [0]; // 始点は必ず含める
        const minSegmentLength = points.length * 0.1; // 最小セグメント長を相対値に
        const curvatureThreshold = 0.3;

        // 曲率を計算
        const curvatures = this._calculateCurvatures(points);
        let lastDivisionIdx = 0;

        for (let i = 2; i < points.length - 2; i++) {
            if (i - lastDivisionIdx < minSegmentLength) {
                continue;
            }

            const isInflectionPoint =
                (curvatures[i - 1] * curvatures[i + 1] < 0) ||
                (Math.abs(curvatures[i]) < 0.001 && curvatures[i - 1] * curvatures[i + 1] <= 0);

            const curvatureChange = Math.abs(curvatures[i + 1] - curvatures[i - 1]);
            const isSignificantChange = curvatureChange > curvatureThreshold;

            if (isInflectionPoint || isSignificantChange) {
                rawDivisionPoints.push(i);
                lastDivisionIdx = i;
            }
        }

        // 終点を追加
        if (rawDivisionPoints[rawDivisionPoints.length - 1] !== points.length - 1) {
            rawDivisionPoints.push(points.length - 1);
        }

        // 長いセグメントの分割（相対長で判断）
        const maxSegmentLength = points.length * 0.2;
        const finalDivisionPoints = [0];

        for (let i = 1; i < rawDivisionPoints.length; i++) {
            const start = rawDivisionPoints[i - 1];
            const end = rawDivisionPoints[i];
            const segmentLength = end - start;

            if (segmentLength > maxSegmentLength) {
                const divisions = Math.ceil(segmentLength / maxSegmentLength);
                const step = segmentLength / divisions;

                for (let j = 1; j < divisions; j++) {
                    const idx = Math.floor(start + j * step);
                    finalDivisionPoints.push(idx);
                }
            }

            finalDivisionPoints.push(end);
        }

        const currentKnots = [...finalDivisionPoints];
        // 分割点の数を調整（0-1の正規化前）
        while (currentKnots.length < knotsNum) {
            if (currentKnots.length === 0) {
                return []; // 空の配列の場合はそのまま返す
            }

            // 最も広いセグメントを見つける
            let maxDiff = -1;
            let maxIndex = -1;
            for (let i = 0; i < currentKnots.length - 1; i++) {
                const diff = currentKnots[i + 1] - currentKnots[i];
                if (diff > maxDiff) {
                    maxDiff = diff;
                    maxIndex = i;
                }
            }

            // 中点を計算して挿入
            if (maxIndex !== -1) {
                const midPoint = (currentKnots[maxIndex] + currentKnots[maxIndex + 1]) / 2;
                currentKnots.splice(maxIndex + 1, 0, midPoint);
            } else {
                break; // これ以上分割できるセグメントがない場合（要素が1つしかない場合など）
            }
        }

        while (currentKnots.length > knotsNum) {
            if (currentKnots.length <= 1) {
                return currentKnots; // 要素が1つ以下になったらそのまま返す
            }

            // 最も狭いセグメントを見つける
            let minDiff = Infinity;
            let minIndex = -1;
            for (let i = 0; i < currentKnots.length - 1; i++) {
                const diff = currentKnots[i + 1] - currentKnots[i];
                if (diff < minDiff) {
                    minDiff = diff;
                    minIndex = i;
                }
            }

            // 細かい部分を削除（minIndexまたはminIndex + 1を削除する戦略が必要）
            // ここではminIndex + 1を削除してみます（後の要素を残す）
            if (minIndex !== -1) {
                currentKnots.splice(minIndex + 1, 1);
            } else {
                break; // これ以上削除できるセグメントがない場合（要素が1つしかない場合など）
            }
        }

        // インデックスを0-1の範囲に正規化
        return currentKnots.map(idx => idx / (points.length - 1));
    }

    /**
     * 曲率を計算する関数
     * 各点での曲率を近似的に計算します
     */
    _calculateCurvatures(points) {
        const curvatures = new Array(points.length).fill(0);

        // 端点を除く各点での曲率を計算
        for (let i = 1; i < points.length - 1; i++) {
            // 前後の点とのベクトルを計算
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            // ベクトルの向きを計算
            const v1 = { x: curr[0] - prev[0], y: curr[1] - prev[1] };
            const v2 = { x: next[0] - curr[0], y: next[1] - curr[1] };

            // ベクトルの長さ
            const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

            if (len1 > 0 && len2 > 0) {
                // 単位ベクトル化
                const uv1 = { x: v1.x / len1, y: v1.y / len1 };
                const uv2 = { x: v2.x / len2, y: v2.y / len2 };

                // 内積と外積を計算
                const dotProduct = uv1.x * uv2.x + uv1.y * uv2.y;
                const crossProduct = uv1.x * uv2.y - uv1.y * uv2.x;

                // 曲率を計算（近似的に）
                // 正の値は時計回り、負の値は反時計回りの曲がりを示す
                curvatures[i] = crossProduct;
            }
        }

        return curvatures;
    }


    /**
     * ノット列の初期化
     */
    setinitKnots() {
        // preKnotsを元に初期ノット列を作成
        this.preKnots = this.preKnots.map(e => ({
            knot: e.knot,
            priority: -1,
            diff: -9999
        }));
    }

    /**
     * ノット削除優先度に応じたノット列の抽出
     */
    setNewKnots(k) {
        // 優先度順にk個選択（外側6点ずつは必ず含める）
        const outerKnots = this.preKnots.filter(e => e.knot <= 0 || e.knot >= 1);
        const innerKnots = this.preKnots.filter(e => e.knot > 0 && e.knot < 1)
            .sort((a, b) => a.priority - b.priority)
            .slice(0, k);
        this.knots = [...outerKnots, ...innerKnots]
            .sort((a, b) => a.knot - b.knot)
            .map(e => e.knot);
    }

    /**
     * 描画範囲の設定
     */
    _setGraphRange() {
        this.graph = {
            min: this.knots[2],
            max: this.knots[this.knots.length - 3]
        };
    }

    /**
     * De Boor-Coxの再帰式で基底関数を計算
     * @param {number} j - ノットインデックス
     * @param {number} k - 次数
     * @param {number} t - パラメータ値
     * @returns {number}
     */
    getBasis(j, k, t) {
        if (t < this.graph.min || this.graph.max < t) return 0;
        if (j < 0 || this.knots_m - k - 2 < j) return 0;
        if (k === 0) {
            return (this.knots[j] <= t && t < this.knots[j + 1]) ? 1 : 0;
        }
        const denom1 = this.knots[j + k] - this.knots[j];
        const denom2 = this.knots[j + k + 1] - this.knots[j + 1];
        let term1 = 0, term2 = 0;
        if (denom1 !== 0) term1 = ((t - this.knots[j]) / denom1) * this.getBasis(j, k - 1, t);
        if (denom2 !== 0) term2 = ((this.knots[j + k + 1] - t) / denom2) * this.getBasis(j + 1, k - 1, t);
        return term1 + term2;
    }

    /**
     * 基底関数同士や関数fとの内積を数値積分で計算し、係数行列Abを構築
     */
    setAb() {
        const d = (this.graph.max - this.graph.min) / 1000;
        this.Ab = [];
        for (let i = 0; i < this.knots_m - 3; i++) {
            this.Ab[i] = [0, 0, 0, 0, 0, 0];
            for (let j = 0; j < 5; j++) {
                const m = this.knots[Math.max(j - 2, 0) + i];
                const M = this.knots[Math.min(j, 2) + 1 + i];
                for (let t = m; t <= M; t += d) {
                    this.Ab[i][j] += this.getBasis(i, 2, t) * this.getBasis(i + j - 2, 2, t);
                }
            }
            for (let t = this.knots[i]; t <= this.knots[i + 3]; t += d) {
                this.Ab[i][5] += this.getBasis(i, 2, t) * this.getf(t);
            }
            this.Ab[i] = this.Ab[i].map(e => e * d);
        }
    }

    /**
     * 点列から補間でy値を取得
     */
    getf(x) {
        if (x >= 1) return this.points[this.points.length - 1][1];
        const idx = this.points.findIndex(p => p[0] > x);
        if (idx <= 0) return this.points[0][1];
        const [x0, y0] = this.points[idx - 1];
        const [x1, y1] = this.points[idx];
        const t = (x - x0) / (x1 - x0);
        return y0 * (1 - t) + y1 * t;
    }


    /**
     * ガウス消去法で正規方程式を解き、スプラインの係数を得る
     * 1. もらったpointsを正しいものに変換
     *  (想定は二値を受け取らない まずはこれを無視して実装)
     * 2. 処理によって間隔は1でとれない。点と点の間を補間する配列を生成
     * 3. A 節点の間隔は一定なので全て計算する必要は無い
     *    ┏                                                           ┓
     * A= ┃  <p_0, p_0>   <p_0, p_1>   <p_0, p_2>  ... <p_0, p_K-1>   ┃
     *    ┃  <p_1, p_0>   <p_1, p_1>   <p_1, p_2>  ... <p_1, p_K-1>   ┃
     *    ┃     ...          ...          ...      ...       ...      ┃
     *    ┃ <p_K-1, p_0> <p_K-1, p_1> <p_K-1, p_2> ... <p_K-1, p_K-1> ┃
     *    ┗                                                           ┛
     * ただし描画範囲のみを計算する
     * 　　 .～～ ...  ～～. ←曲線
     *  ・━・━・━ ... ・━・━・━・
     *  └──┘ｺｺ　　　　　　 └──┘
     *　  節点：・　　セグメント：━
     * 
     *    ┏ 0 1 2 3 4           ┓
     * A= ┃ \ \ \ 0 0 0 ... 0 0 ┃ 対角とその両側2つの成分が0より大きい
     *    ┃ \ \ \ \ 0 0 ... 0 0 ┃ それもペンを下ろす(始点)　ペンを上げる(終点)
     *    ┃ \ \ \ \ \ 0 ... 0 0 ┃ を取得しなければ節点の間隔は一定なので
     *    ┃ 0 \ \ \ \ \ ... 0 0 ┃ A_m m, A_m m+1 = A_m m-1, A_m m+2 = A_m m-2
     *    ┃ ... ... ... ... ... ┃ m = [0... 1] はすべて一致している
     *    ┃ 0 0 0 0 0 0 ... \ \ ┃ K=(終点.x-始点.x)/10
     *    ┗                     ┛
     *    
     * 4. x を求める <f, \phi_k> = knots[k] ~ knots[k+3]の範囲で
     *    f(t)\phi_k(t) の定積分を求める
     * 
     * 5. 拡大係数行列を解く
     * 6. c_kを返す
     */
    solveAb() {
        const k = this.knots_m - 3;
        for (let i = 0; i < k - 2; i++) {
            this.Ab[i][3] /= this.Ab[i][2];
            this.Ab[i][4] /= this.Ab[i][2];
            this.Ab[i][5] /= this.Ab[i][2];
            this.Ab[i][2] = 1;

            this.Ab[i + 1][2] -= this.Ab[i][3] * this.Ab[i + 1][1];
            this.Ab[i + 1][3] -= this.Ab[i][4] * this.Ab[i + 1][1];
            this.Ab[i + 1][5] -= this.Ab[i][5] * this.Ab[i + 1][1];
            this.Ab[i + 1][1] = 0;

            this.Ab[i + 2][1] -= this.Ab[i][3] * this.Ab[i + 2][0];
            this.Ab[i + 2][2] -= this.Ab[i][4] * this.Ab[i + 2][0];
            this.Ab[i + 2][5] -= this.Ab[i][5] * this.Ab[i + 2][0];
            this.Ab[i + 2][0] = 0;
        }

        this.Ab[k - 2][3] /= this.Ab[k - 2][2];
        this.Ab[k - 2][5] /= this.Ab[k - 2][2];
        this.Ab[k - 2][2] = 1;

        this.Ab[k - 1][2] -= this.Ab[k - 2][3] * this.Ab[k - 1][1];
        this.Ab[k - 1][5] -= this.Ab[k - 2][5] * this.Ab[k - 1][1];
        this.Ab[k - 1][1] = 0;

        this.Ab[k - 1][5] /= this.Ab[k - 1][2];
        this.Ab[k - 1][2] = 1;

        for (let i = k - 2; i > 0; i--) {
            this.Ab[i][5] -= this.Ab[i + 1][5] * this.Ab[i][3];
            this.Ab[i][3] = 0;
            this.Ab[i - 1][5] -= this.Ab[i + 1][5] * this.Ab[i - 1][4];
            this.Ab[i - 1][4] = 0;
        }
        this.Ab[0][5] -= this.Ab[1][5] * this.Ab[0][3];
        this.Ab[0][3] = 0;

        this.coef = this.Ab.map(e => e[5]);
    }

    /**
     * 各区間の二次多項式係数をPoYに格納
     */
    getCoefficient() {
        this.PoY = [];
        for (let j = 0; j < this.knots_m - 5; j++) {
            this.PoY[j] = [0, 0, 0];
            for (let i = 0; i < 3; i++) {
                const b = this.getPolynomial(j + i, 2, this.knots[j + 2]);
                const by = b.map(a => a * this.coef[j + i]);
                for (let k = 0; k <= 2; k++) this.PoY[j][k] += by[k] || 0;
            }
        }
    }

    /**
     * 基底関数の多項式係数を再帰的に計算
     * @param {number} j - ノットインデックス
     * @param {number} k - 次数
     * @param {number} t - 区間のノット値
     * @returns {Array}
     */
    getPolynomial(j, k, t) {
        if (t < this.graph.min || this.graph.max < t) return [0];
        if (j < 0 || this.knots_m - k - 2 < j) return [0];
        if (k === 0) {
            if (this.knots[j] <= t && t < this.knots[j + 1]) return [1];
            else return [0];
        } else {
            const d = Array(k + 1).fill(0);
            const f1 = this.getPolynomial(j, k - 1, t);
            const f2 = this.getPolynomial(j + 1, k - 1, t);
            if (this.knots[j + k] !== this.knots[j]) {
                for (let i = 0; i < k; i++) {
                    d[i + 1] += f1[i] / (this.knots[j + k] - this.knots[j]);
                    d[i] += -this.knots[j] * f1[i] / (this.knots[j + k] - this.knots[j]);
                }
            }
            if (this.knots[j + k + 1] !== this.knots[j + 1]) {
                for (let i = 0; i < k; i++) {
                    d[i + 1] += -f2[i] / (this.knots[j + k + 1] - this.knots[j + 1]);
                    d[i] += this.knots[j + k + 1] * f2[i] / (this.knots[j + k + 1] - this.knots[j + 1]);
                }
            }
            return d;
        }
    }

    /**
     * 各区間の二階微分値の差分からノット削除優先度を決定し、preKnotsに格納
     */
    getSecondDeri() {
        const sd = this.PoY.map(e => e[2]);
        for (let i = 0; i < sd.length - 1; i++) {
            this.preKnots[i + 3].diff = Math.abs(sd[i] - sd[i + 1]);
        }
        // 差でソート、節点削除優先度を決定
        this.preKnots.sort((a, b) => b.diff - a.diff);
        for (let i = 0; i < sd.length - 1; i++) {
            this.preKnots[i].priority = i;
        }
        // knotでソート(もどす)
        this.preKnots.sort((a, b) => a.knot - b.knot);
    }

    /**
     * 各区間の二次多項式を頂点形式（y=a(x-p)^2+q）で返す
     * @returns {Array} - [[a, p, q], ...]
     */
    getVertexForm(digits = 6) {
        return this.PoY.map(e => {
            const a = this._signDigits(e[2], digits);
            const p = this._signDigits(e[1] / (2 * e[2]), digits);
            const q = this._signDigits((-(e[1] * e[1] - 4 * e[2] * e[0]) / (4 * e[2])), digits);
            return [a, p, q];
        });
    }

    /**
     * 各区間の二次多項式を一般形（y=ax^2+bx+c）で返す
     * @returns {Array} - [[c, b, a], ...]
     */
    getGeneralPath() {
        return this.PoY;
    }

    /**
     * 指定値がどのノット区間に属するかインデックスを返す
     * @param {number} param
     * @returns {number}
     */
    getIndexOfKnots(param) {
        return this.knots.filter(e => e <= param).length - 1;
    }

    /**
     * 指定桁数で丸める
     */
    _signDigits(val, d) {
        if (!isFinite(val)) return 0;
        const pow = Math.pow(10, d);
        return Math.round(val * pow) / pow;
    }

    /**
     * 近似結果を元座標系で返す
     * @returns {Object}
     */
    getApproximationResult() {
        // 各区間の2次多項式係数（元座標系）
        const segments = [];
        for (let i = 0; i < this.PoY.length; i++) {
            const t0 = this.knots[i + 2], t1 = this.knots[i + 3];
            const x0 = this.minX + t0 * (this.maxX - this.minX);
            const x1 = this.minX + t1 * (this.maxX - this.minX);
            const [c, b, a] = this.PoY[i];
            const dx = this.maxX - this.minX;
            const dy = this.maxY - this.minY;

            const a2 = a / (dx * dx) * dy;
            const b1 = b / dx * dy;
            const b2 = -2 * this.minX * a2 + b1;
            const c2 = this.minX * this.minX * a2 - b1 * this.minX + c * dy + this.minY;

            // ベジェ制御点
            // https://www.desmos.com/calculator/emngtymdcm
            // (y - minY) / (maxY - minY) = a2 * x^2 + b2 * x + c2 with x = (x - minX) / (maxX - minX) の変形
            const xm = (x0 + x1) / 2;
            const y0 = a2 * x0 * x0 + b2 * x0 + c2;
            const y1 = a2 * x1 * x1 + b2 * x1 + c2;

            // f(x) = ax^2 + bx + c (x0 < x < x1) の制御点
            const P1y = a2 * x0 * x1 + b2 * xm + c2;

            const P1x = xm;
            segments.push({
                start: [x0, y0],
                control: [P1x, P1y],
                end: [x1, y1],
                coef: { a: a2, b: b2, c: c2 }
            });
        }

        const preKnots = this.preKnots

        // ノット列（元座標系）
        const originalKnots = this.knots.map(t => [
            this.minX + t * (this.maxX - this.minX),
            this.minY + this.getf(t) * (this.maxY - this.minY)
        ]);

        // 表示するノット列（元座標系）
        const knots = [];
        if (segments.length > 0) {
            // 最初の要素から最後の要素の直前までの start を取得
            const startKnots = segments.map(({ start }) => start);
            knots.push(...startKnots);
            // 最後の要素の end を追加
            knots.push(segments[segments.length - 1].end);
        }

        // latex
        const latexEquations = segments.map(seg => {
            const { a, b, c } = seg.coef;

            // y = ax^2 + bx + c の形に変換
            // let eq = `y=${fmt(a)}x^2${fmt(b)}x${fmt(c)}`;

            // y = a(x - p)^2 + q の形に変換
            const p = b / (2 * a);
            const q = c - (a * p * p);
            let eq = `y=${signedFixedString(a, 3)}(x${signedFixedString(p, 3)})^2${signedFixedString(q, 3)}`;
            eq = eq.replace('=+', '=');
            return {
                type: 'quadratic',
                formula: eq,
                domain: {
                    start: seg.start[0].toFixed(2),
                    end: seg.end[0].toFixed(2)
                }
            };
        });
        // ベジェ
        const bezierSegments = segments.map(seg => ({
            start: seg.start,
            control: seg.control,
            end: seg.end
        }));
        // 係数
        const splineCoefficients = segments.map(s => s.coef);
        return {
            knots,
            preKnots,
            originalKnots,
            bezierSegments,
            splineCoefficients,
            latexEquations
        };
    }

    /**
     * カスタムノット列を設定して近似を実行
     * @param {Array} customKnots - カスタムノット列（0-1の範囲で正規化済みの値）
     * @returns {this}
     */
    setCustomKnots(customKnots) {
        if (!Array.isArray(customKnots) || customKnots.length < this.options.minKnots) {
            throw new Error('Invalid custom knots array');
        }

        // 正規化されているか確認
        if (customKnots.some(k => k < 0 || k > 1)) {
            throw new Error('Knots must be normalized (between 0 and 1)');
        }

        // ソートして昇順に
        customKnots.sort((a, b) => a - b);

        // preKnotsを初期化
        this.preKnots = [];

        // 始点より小さいノット2点
        this.preKnots.push(
            { knot: -0.1, priority: -1, diff: -9999 },
            { knot: -0.05, priority: -1, diff: -9999 }
        );

        // カスタムノットを追加
        for (const knot of customKnots) {
            this.preKnots.push({
                knot: knot,
                priority: -1,
                diff: -9999
            });
        }

        // 終点より大きいノット2点
        this.preKnots.push(
            { knot: 1.05, priority: -1, diff: -9999 },
            { knot: 1.1, priority: -1, diff: -9999 }
        );

        // ノット列を設定
        this.knots = this.preKnots.map(e => e.knot);
        this.knots_m = this.knots.length;
        this.knots_num = customKnots.length;

        // グラフ範囲の再設定
        this._setGraphRange();

        // 近似計算の再実行
        this.setAb();
        this.solveAb();
        this.getCoefficient();
        this.getSecondDeri();

        return this;
    }
}
