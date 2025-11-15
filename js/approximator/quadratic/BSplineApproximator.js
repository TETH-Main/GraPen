import { roundQuadraticCoeffs } from "../../util/NumberUtil.js";
import { EquationBuilder } from "../../util/EquationBuilder.js";

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
            initKnots: 10, // 初期ノット数
            maxKnots: 10,
            ...options
        };
        this.originalPoints = points;
        this._normalizePoints();
        this.reset(this.options.initKnots);
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
    reset(numKnots = 10) {
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
     * preKnotsの初期化
     * 始点より小さいxのノット2点、終点より大きいxのノット2点を追加
     */
    _initPreKnots() {
        // 曲率変曲点を優先して節点配置
        const n = this.knots_num;
        let selectedKnots = null;

        const knots = this._findDivisionPoints(this.points, n);
        const snapKnots = this.getSnappedKnots(knots);

        if (this.options.snap) {
            selectedKnots = snapKnots;
        } else {
            selectedKnots = knots
        }

        this.preKnots = [];
        // 通常ノット
        for (let i = 0; i < snapKnots.length; i++) {
            this.preKnots.push({
                knot: selectedKnots[i],
                priority: -1,
                diff: -9999
            });
        }
        // 始点より小さいノット2点
        this.preKnots.unshift(
            { knot: -0.2, priority: -1, diff: -9999 },
            { knot: -0.1, priority: -1, diff: -9999 }
        );
        // 終点より大きいノット2点
        this.preKnots.push(
            { knot: 1.1, priority: -1, diff: -9999 },
            { knot: 1.2, priority: -1, diff: -9999 }
        );
    }

    /**
     * 分割点を見つける関数（0-1の範囲で返す）
     * 曲率が低い箇所を優先して分割点(knots)を選ぶ
     * @param {Array} points - [[x, y], ...]
     * @param {number} knotsNum - 分割点数
     * @returns {Array} - 0-1正規化済み分割点配列
     */
    _findDivisionPoints(points, knotsNum = 10) {
        if (!points || points.length < 3) return [0, 1];

        // 1. 平滑化
        const smoothness = 3; // 固定値。必要ならoptions等で調整可
        const windowSize = Math.min(smoothness * 2 + 1, points.length);
        const smoothed = [];
        for (let i = 0; i < points.length; i++) {
            let sumX = 0, sumY = 0, count = 0;
            const halfWindow = Math.floor(windowSize / 2);
            for (let j = Math.max(0, i - halfWindow); j <= Math.min(points.length - 1, i + halfWindow); j++) {
                sumX += points[j][0];
                sumY += points[j][1];
                count++;
            }
            smoothed.push([sumX / count, sumY / count]);
        }

        // 2. 曲率計算
        const curvatures = [];
        for (let i = 1; i < smoothed.length - 1; i++) {
            const p1 = smoothed[i - 1], p2 = smoothed[i], p3 = smoothed[i + 1];
            const dx1 = p2[0] - p1[0], dy1 = p2[1] - p1[1];
            const dx2 = p3[0] - p2[0], dy2 = p3[1] - p2[1];
            const cross = dx1 * dy2 - dy1 * dx2;
            const dot = dx1 * dx2 + dy1 * dy2;
            const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (len1 === 0 || len2 === 0) {
                curvatures.push(0);
                continue;
            }
            const angle = Math.atan2(cross, dot);
            const avgLen = (len1 + len2) / 2;
            curvatures.push(Math.abs(angle) / avgLen);
        }

        // 3. 曲率の平滑化
        const window = 3;
        const smoothedCurvatures = [];
        for (let i = 0; i < curvatures.length; i++) {
            let sum = 0, count = 0;
            const half = Math.floor(window / 2);
            for (let j = Math.max(0, i - half); j <= Math.min(curvatures.length - 1, i + half); j++) {
                sum += curvatures[j];
                count++;
            }
            smoothedCurvatures.push(sum / count);
        }

        // 4. 局所最小値（低曲率点）を検出
        const candidates = [];
        for (let i = 2; i < smoothedCurvatures.length - 2; i++) {
            const curr = smoothedCurvatures[i];
            const prev1 = smoothedCurvatures[i - 1], prev2 = smoothedCurvatures[i - 2];
            const next1 = smoothedCurvatures[i + 1], next2 = smoothedCurvatures[i + 2];
            if (
                curr <= prev1 && curr <= prev2 &&
                curr <= next1 && curr <= next2
            ) {
                candidates.push({ index: i + 1, curvature: curr }); // +1: smoothedCurvaturesは1つ短い
            }
        }

        // 5. 始点・終点は必ず含める
        const divisionIndices = [0, points.length - 1];

        // 6. knotsNumに合わせて分割点を選択
        //   - まず低曲率点から距離を空けて選択
        //   - 足りなければ等間隔で補う
        const minDistance = Math.floor(points.length / (knotsNum * 1.5)); // 距離閾値
        const selected = [];
        for (const cand of candidates.sort((a, b) => a.curvature - b.curvature)) {
            if (selected.length >= knotsNum - 2) break;
            if (selected.every(idx => Math.abs(idx - cand.index) >= minDistance)) {
                selected.push(cand.index);
            }
        }
        // 足りない場合は等間隔で補う
        while (selected.length < knotsNum - 2) {
            const step = (points.length - 1) / (knotsNum - 1);
            for (let i = 1; i < knotsNum - 1 && selected.length < knotsNum - 2; i++) {
                const idx = Math.round(i * step);
                if (
                    idx !== 0 && idx !== points.length - 1 &&
                    !selected.includes(idx)
                ) {
                    selected.push(idx);
                }
            }
        }

        // 7. インデックスでまとめて昇順
        const allIndices = [...divisionIndices, ...selected].sort((a, b) => a - b);

        // 8. 0-1正規化
        return allIndices.map(idx => idx / (points.length - 1));
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

        // --- 外れ値priority処理 ---
        const diffs = this.preKnots.map(e => e.diff);
        const validDiffs = diffs.filter(d => d !== -9999);
        if (validDiffs.length > 0) {
            const mean = validDiffs.reduce((a, b) => a + b, 0) / validDiffs.length;
            const std = Math.sqrt(validDiffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validDiffs.length);

            // 外れ値（平均±1.5σ超）のインデックスを抽出（diffが-9999のものは除外）
            const outlierIndices = [];
            for (let i = 0; i < this.preKnots.length; i++) {
                const d = this.preKnots[i].diff;
                if (d === -9999) continue;
                if (Math.abs(d - mean) > 1.5 * std) {
                    outlierIndices.push(i);
                }
            }

            // diffが-9999以外のノットを抽出
            const normalKnots = [];
            const outlierKnots = [];
            const dummyKnots = [];
            for (let i = 0; i < this.preKnots.length; i++) {
                const knot = this.preKnots[i];
                if (knot.diff === -9999) {
                    dummyKnots.push(knot);
                } else if (outlierIndices.includes(i)) {
                    outlierKnots.push(knot);
                } else {
                    normalKnots.push(knot);
                }
            }

            // diff降順（大きい順）でpriorityを割り当て
            normalKnots.sort((a, b) => b.diff - a.diff);
            outlierKnots.sort((a, b) => b.diff - a.diff);

            let p = 0;
            normalKnots.forEach(knot => {
                knot.priority = p++;
            });
            outlierKnots.forEach(knot => {
                knot.priority = p++;
            });

            // preKnotsをknot順にソートし直す
            this.preKnots = [...dummyKnots, ...normalKnots, ...outlierKnots].sort((a, b) => a.knot - b.knot);
        }
        // --- ここまで ---
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
        if (d == null || d === undefined) return val;
        const pow = Math.pow(10, d);
        return Math.round(val / pow) * pow;
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

            let scaleLevel = this.getScaleLevel();

            let [c0, b0, a0] = this.PoY[i];
            const [a, b, c] = roundQuadraticCoeffs(a0, b0, c0, 2);

            const dx = this.maxX - this.minX;
            const dy = this.maxY - this.minY;

            let a2 = a / (dx * dx) * dy;
            let b1 = b / dx * dy;
            let b2 = -2 * this.minX * a2 + b1;
            let c2 = this.minX * this.minX * a2 - b1 * this.minX + c * dy + this.minY;

            // ベジェ制御点
            // https://www.desmos.com/calculator/emngtymdcm
            // (y - minY) / (maxY - minY) = a2 * x^2 + b2 * x + c2 with x = (x - minX) / (maxX - minX) の変形
            const xm = (x0 + x1) / 2;
            let y0 = a2 * x0 * x0 + b2 * x0 + c2;
            let y1 = a2 * x1 * x1 + b2 * x1 + c2;

            // f(x) = ax^2 + bx + c (x0 < x < x1) の制御点
            let P1y = a2 * x0 * x1 + b2 * xm + c2;

            // Snapが有効時 制御点と係数を変更
            if (this.options.snap) {
                let [aRounded, pRounded, qRounded] = this.getRoundedVertexFromCoeff(a2, b2, c2, scaleLevel);
                // 丸めた二次関数の頂点のx, y座標から制御点のy座標を調整 y = a(x - p)^2 + q
                const P1yAdjustedbyP = y0 + (x0 - pRounded) * (y1 - y0) / (x0 - 2 * pRounded + x1);

                // https://www.desmos.com/calculator/gwpfcrmoxf
                let quadraticYBool = (e) => {
                    return (e - y0) * (e - y1) * (e - (y0 + y1) / 2) > 0 ? true : false;
                }
                const P1yAdjustedbyQp = qRounded + Math.sqrt((y0 - qRounded) * (y1 - qRounded)); // if s > 0 
                const P1yAdjustedbyQm = qRounded - Math.sqrt((y0 - qRounded) * (y1 - qRounded)); // if s < 0
                const P1yAdjustedbyQ = quadraticYBool(P1yAdjustedbyQp) ? P1yAdjustedbyQp : P1yAdjustedbyQm;

                let pShifted, qShifted = 0;
                // 丸めた後の頂点と、丸めた後の制御点を比較して、どちらを使うか決定
                let usePAdjusted = false;
                let useQAdjusted = false;

                const isPAdjustedNaN = isNaN(P1yAdjustedbyP);
                const isQAdjustedNaN = isNaN(P1yAdjustedbyQ);
                if (!isPAdjustedNaN && !isQAdjustedNaN) {
                    if (Math.abs(P1yAdjustedbyP - P1y) < Math.abs(P1yAdjustedbyQ - P1y)) usePAdjusted = true;
                    else useQAdjusted = true;
                }
                else if (!isPAdjustedNaN) usePAdjusted = true;
                else if (!isQAdjustedNaN) useQAdjusted = true;
                else console.error('Both P1yAdjustedbyP and P1yAdjustedbyQ are NaN. Cannot determine P1y.');

                if (usePAdjusted) {
                    P1y = P1yAdjustedbyP;
                    pShifted = pRounded;
                    qShifted = this._signDigits(y0 - (y0 - P1y) * (y0 - P1y) / (y0 - 2 * P1y + y1), scaleLevel - 2);
                    // console.log('Rounded Vertex by X:', aRounded, pShifted, qShifted);
                } else if (useQAdjusted) {
                    P1y = P1yAdjustedbyQ;
                    pShifted = this._signDigits(x0 - (x0 - x1) * (x0 - P1y) / (y0 - 2 * P1y + y1), scaleLevel - 2);
                    qShifted = qRounded;
                    // console.log('Rounded Vertex by Y:', aRounded, pShifted, qShifted);
                }

                // Snapした後の二次関数の頂点があまりにも元の頂点と離れている場合は、元の頂点を使う
                if (Math.abs(pShifted - pRounded) > Math.pow(10, scaleLevel) || Math.abs(qShifted - qRounded) > Math.pow(10, scaleLevel)) {
                    [a2, b2, c2] = this.getRoundedVertexFromCoeff(a2, b2, c2, scaleLevel - 1);
                } else {
                    [a2, b2, c2] = this.getCoeffFromVertex(aRounded, pShifted, qShifted);
                }

                // a, p, qから制御点の座標を更新
                y0 = a2 * x0 * x0 + b2 * x0 + c2; // 始点のy座標を再計算
                y1 = a2 * x1 * x1 + b2 * x1 + c2; // 終点のy座標を再計算
                P1y = a2 * x0 * x1 + b2 * xm + c2; // 制御点のy座標を再計算

                console.log('Rounded Coefficients:', `${a2}x^2 + ${b2}x + ${c2}`);
            }

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
        segments.forEach(seg => {
            knots.push(seg.start);
            knots.push(seg.end);
        });
        // if (segments.length > 0) {
        //     // 最初の要素から最後の要素の直前までの start を取得
        //     const startKnots = segments.map(({ start }) => start);
        //     knots.push(...startKnots);
        //     // 最後の要素の end を追加
        //     knots.push(segments[segments.length - 1].end);
        // }

        // latex
        const latexEquations = segments.map(seg => {
            const coefficients = seg?.coef ?? {};
            const { a: coefA, b: coefB, c: coefC } = coefficients;
            const isQuadratic = Number.isFinite(coefA) && Math.abs(coefA) > 1e-12;
            const domainRange = [
                Math.min(seg.start[0], seg.end[0]),
                Math.max(seg.start[0], seg.end[0])
            ];

            if (!isQuadratic) {
                const dx = seg.end[0] - seg.start[0];
                const dy = seg.end[1] - seg.start[1];

                if (Math.abs(dx) <= 1e-12) {
                    const yRange = [
                        Math.min(seg.start[1], seg.end[1]),
                        Math.max(seg.start[1], seg.end[1])
                    ];
                    const vertical = EquationBuilder.vertical({
                        x: seg.start[0],
                        yRange,
                        meta: { coefficients }
                    }, { decimals: 3 });
                    vertical.domain = {
                        start: yRange[0].toFixed(2),
                        end: yRange[1].toFixed(2)
                    };
                    vertical.params = {
                        ...vertical.params,
                        coefficients
                    };
                    return vertical;
                }

                const slope = dy / dx;
                const linear = EquationBuilder.linear({
                    slope,
                    point: seg.start,
                    domain: domainRange,
                    meta: { coefficients }
                }, { decimals: 3 });
                linear.domain = {
                    start: domainRange[0].toFixed(2),
                    end: domainRange[1].toFixed(2)
                };
                linear.params = {
                    ...linear.params,
                    coefficients
                };
                return linear;
            }

            const vertexX = -coefB / (2 * coefA);
            const vertexY = coefA * vertexX * vertexX + coefB * vertexX + coefC;
            const equation = EquationBuilder.quadraticVertex({
                a: coefA,
                vertex: [vertexX, vertexY],
                domain: domainRange,
                meta: { coefficients }
            }, { decimals: 3 });

            equation.domain = {
                start: domainRange[0].toFixed(2),
                end: domainRange[1].toFixed(2)
            };

            equation.params = {
                ...equation.params,
                coefficients
            };

            return equation;
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
     * ノット数を設定して近似を実行
     * @param {Array} knotsNum - ノット数
     * @returns {this}
     */
    setKnotsNum(knotsNum) {
        if (!Number.isInteger(knotsNum) || knotsNum < this.options.minKnots) {
            throw new Error('Invalid knots number');
        }

        const customKnots = this.preKnots
            .filter(k => k.priority < knotsNum - 2) // 優先度でフィルタリング
        this.preKnots = customKnots

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

    /**
     * 節点数を設定し近似を実行後、節点の優先度のみ返す
     * @param {number} knotsNum - 節点数
     * @returns {Array} - 節点の優先度
     */
    GetPriority(knotsNum) {
        if (!Number.isInteger(knotsNum) || knotsNum < this.options.minKnots) {
            throw new Error('Invalid knots number');
        }

        const customKnots = this.preKnots
            .filter(k => k.priority < knotsNum - 2) // 優先度でフィルタリング
        this.preKnots = customKnots

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

        return this.preKnots
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

        // 入力を正規化（数値配列/オブジェクト配列の両方に対応）
        const normalizedKnots = customKnots.map((entry, index) => {
            if (typeof entry === 'number') {
                return { knot: entry, priority: index, diff: -9999 };
            }
            if (entry && typeof entry.knot === 'number') {
                return {
                    knot: entry.knot,
                    priority: typeof entry.priority === 'number' ? entry.priority : index,
                    diff: typeof entry.diff === 'number' ? entry.diff : -9999
                };
            }
            throw new Error('Invalid knot entry');
        });

        if (normalizedKnots.some(k => !Number.isFinite(k.knot))) {
            throw new Error('Knots must be finite numbers');
        }

        normalizedKnots.sort((a, b) => a.knot - b.knot);

        // preKnotsを初期化
        this.preKnots = normalizedKnots;

        // ノット列を設定
        this.knots = this.preKnots.map(e => e.knot);
        this.knots_m = this.knots.length;
        this.knots_num = normalizedKnots.length;

        // グラフ範囲の再設定
        this._setGraphRange();

        // 近似計算の再実行
        this.setAb();
        this.solveAb();
        this.getCoefficient();
        // this.getSecondDeri(); // priorityを再計算すると元情報を失うため呼ばない

        return this;
    }

    /**
     * Snappingしたknotsを使って近似を行う
     * @param {Array} knots - Snap前の節点
     * @return {this}
     */
    setSnappedKnots(knots) {
        const snappedKnots = this.getSnappedKnots(knots);
        this.setCustomKnots(snappedKnots);
    }

    /**
     * グラフのスケールレベルを取得する
     * @returns {number} - スケールレベル
     */
    getScaleLevel() {
        // 始点と終点のx座標の差からscaleLevelを決定
        const x0 = this.originalPoints[0][0];
        const x1 = this.originalPoints[this.originalPoints.length - 1][0];
        const diff = Math.abs(x1 - x0);
        let scaleLevel = 0;
        if (diff > 0) {
            scaleLevel = Math.floor(Math.log10(diff)) - 1;
        }
        return scaleLevel;
    }

    /**
     * Snappingしたknots（分割点）を取得する
     * @returns {Array} - 0-1正規化済み分割点配列
     * 
     */
    getSnappedKnots(knots) {
        let scaleLevel = this.getScaleLevel();

        let snappedXs, uniqueSnappedXs;
        let currentScaleLevel = scaleLevel;
        while (true) {
            const grid = Math.pow(10, currentScaleLevel);
            snappedXs = knots.map(t => {
                const x = this.minX + t * (this.maxX - this.minX);
                return Math.round(x / grid) * grid;
            });
            uniqueSnappedXs = Array.from(new Set(snappedXs));
            if (uniqueSnappedXs.length === snappedXs.length) {
                break;
            }
            currentScaleLevel--;
        }
        uniqueSnappedXs.sort((a, b) => a - b);

        // 各スナップxに最も近い点を元点列から探し、そのx座標で正規化
        const minX = this.originalPoints[0][0];
        const maxX = this.originalPoints[this.originalPoints.length - 1][0];
        const range = maxX - minX || 1;
        const normXs = Array.from(new Set(uniqueSnappedXs)).map(snapX =>
            (snapX - minX) / range
        );

        return normXs;
    }

    /**
     * 係数a, b, cから平方完成し、丸めた後のa, b, cを返す
     * @param {number} a - 二次項の係数
     * @param {number} b - 一次項の係数
     * @param {number} c - 定数項の係数
     * @param {number} digits - 小数点以下の桁数
     * @returns {Array} - 平方完成した係数 [a, b, c]
     */
    getRoundedSquare(a, b, c, digits = 3) {
        // 平方完成
        const aRounded = this._signDigits(a, digits);
        const p = b / (2 * aRounded);
        const q = c - aRounded * p * p;

        // 小数点以下の桁数で丸める
        const roundP = this._signDigits(p, digits);
        const roundQ = this._signDigits(q, digits);

        // 平方完成を一般式にもどす
        const bRounded = 2 * a * roundP;
        const cRounded = roundQ + a * roundP * roundP;

        return [a, bRounded, cRounded];
    }

    /**
     * 係数a, b, cを平方完成した係数を返す
     * @param {number} a - 二次項の係数
     * @param {number} b - 一次項の係数
     * @param {number} c - 定数項の係数
     * @returns {Array} - 頂点形式の係数 [a, p, q]
     */
    getVertexFromCoeff(a, b, c) {
        // 平方完成
        const p = - b / (2 * a);
        const q = c - a * p * p;

        // 頂点形式の係数を返す
        return [a, p, q];
    }

    /**
     * 係数a, p, qから一般形に戻した係数を返す
     * @param {number} a - 二次項の係数
     * @param {number} p - 頂点形式のp
     * @param {number} q - 頂点形式のq
     * @returns {Array} - 一般形の係数 [a, b, c]
     */
    getCoeffFromVertex(a, p, q) {
        const b = -2 * a * p;
        const c = a * p * p + q;
        return [a, b, c];
    }

    /**
     * 係数a, b, cから頂点形式に変換し、丸めた後の係数を返す
     * @param {number} a - 二次項の係数
     * @param {number} b - 一次項の係数
     * @param {number} c - 定数項の係数
     * @param {number} digits - 小数点以下の桁数
     * @returns {Array} - 頂点形式の係数 [a, p, q]
     */
    getRoundedVertexFromCoeff(a, b, c, scaleLevel = null) {
        // 平方完成
        // const aRounded = this._signDigits(a, scaleLevel);
        const aRounded = a;
        const p = this._signDigits(- b / (2 * aRounded), scaleLevel);
        const q = this._signDigits(c - (aRounded * p * p), scaleLevel);

        // 頂点形式の係数を返す
        return [a, p, q];
    }
}
