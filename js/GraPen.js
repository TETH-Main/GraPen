/**
 * GraPen API クラス
 * Webアプリケーションの主要機能への統一されたアクセスを提供
 * 開発者ツールのコンソールや内部処理での使用を想定
 */
import * as NumberUtil from './util/NumberUtil.js';

export class GraPen {
    // プライベートフィールド - 外部からアクセス不可
    #uiManager;
    #curveManager;
    #graphCalculator;
    #historyManager;
    #settings;
    #curveMovementHandler;

    constructor(uiManager, curveManager, graphCalculator, historyManager, settings, curveMovementHandler) {
        // 内部クラスをプライベートフィールドに格納
        this.#uiManager = uiManager;
        this.#curveManager = curveManager;
        this.#graphCalculator = graphCalculator;
        this.#historyManager = historyManager;
        this.#settings = settings;
        this.#curveMovementHandler = curveMovementHandler;

        // パブリックなプロパティ（読み取り専用の情報のみ）
        Object.defineProperty(this, 'version', {
            value: '1.0.4',
            writable: false,
            enumerable: true,
            configurable: false
        });

        Object.defineProperty(this, 'apiVersion', {
            value: '1.1.0',
            writable: false,
            enumerable: true,
            configurable: false
        });
    }

    // プライベートメソッド - 内部処理用
    #validateCurveId(curveId) {
        if (typeof curveId !== 'number' || curveId < 0 || !Number.isInteger(curveId)) {
            return { valid: false, message: '曲線IDは0以上の整数である必要があります' };
        }
        if (!this.#curveManager.curves[curveId]) {
            return { valid: false, message: `曲線ID ${curveId} が見つかりません` };
        }
        return { valid: true };
    }

    #validatePoints(points) {
        if (!Array.isArray(points)) {
            return { valid: false, message: '点は配列で指定してください' };
        }
        if (points.length < 2) {
            return { valid: false, message: '少なくとも2つの点が必要です' };
        }
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (!Array.isArray(point) || point.length !== 2) {
                return { valid: false, message: `点${i}は [x, y] の形式である必要があります` };
            }
            if (typeof point[0] !== 'number' || typeof point[1] !== 'number') {
                return { valid: false, message: `点${i}の座標は数値である必要があります` };
            }
        }
        return { valid: true };
    }

    #createErrorResult(message) {
        return { success: false, message };
    }

    #createSuccessResult(message, additionalData = {}) {
        return { success: true, message, ...additionalData };
    }

    // ========== 曲線操作 API ==========

    /**
     * 新しい曲線を追加
     * @param {Array} points - 点の配列 [[x, y], [x, y], ...]
     * @param {Object} options - オプション設定
     * @param {string} options.color - 曲線の色 (デフォルト: 現在の色)
     * @param {number} options.size - 曲線の太さ (デフォルト: 現在のサイズ)
     * @param {boolean} options.useAdvancedMode - 高度な近似モードを使用 (デフォルト: false)
     * @param {string} options.type - 近似タイプ ('quadratic', 'linear', 'piecewiseLinear') (デフォルト: 'quadratic')
     * @returns {Object} 追加結果 {success: boolean, curveId: number, message: string}
     */
    addCurve(descriptor) {
        if (!descriptor || typeof descriptor !== 'object') {
            return this.#createErrorResult('曲線の記述子オブジェクトが必要です');
        }

        const points = Array.isArray(descriptor.points)
            ? descriptor.points
            : (Array.isArray(descriptor.originalPoints) ? descriptor.originalPoints : []);

        const options = {
            color: descriptor.color,
            size: descriptor.size,
            useAdvancedMode: descriptor.useAdvancedMode,
            type: descriptor.type
        };

        const pointsValidation = this.#validatePoints(points);
        if (!pointsValidation.valid) {
            return this.#createErrorResult(pointsValidation.message);
        }

        const {
            color = this.#settings.currentColor,
            size = this.#settings.currentSize,
            useAdvancedMode = false,
            type = 'quadratic'
        } = options;

        const validTypes = ['quadratic', 'linear', 'piecewiseLinear'];
        if (!validTypes.includes(type)) {
            return this.#createErrorResult(`無効な近似タイプです。有効なタイプ: ${validTypes.join(', ')}`);
        }

        const domainPoints = points.map(point => [Number(point[0]), Number(point[1])]);
        const curveId = this.#settings.nextCurveId;

        try {
            const result = this.#curveManager.addHandDrawnCurve({
                id: curveId,
                domainPath: domainPoints,
                color,
                size,
                useAdvancedMode,
                approximatorSettings: this.#curveManager.approximatorSettings
            });

            if (result.success) {
                this.#settings.nextCurveId++;
                return this.#createSuccessResult('曲線が正常に追加されました', {
                    curveId: curveId,
                    curve: result.curve
                });
            } else {
                return this.#createErrorResult(result.message || '曲線の追加に失敗しました');
            }
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    /**
     * 曲線のスタイルを変更
     * @param {number} curveId - 曲線ID
     * @param {Object} style - スタイル設定
     * @param {string} style.color - 新しい色
     * @param {number} style.size - 新しい太さ
     * @returns {Object} 変更結果 {success: boolean, message: string}
     */
    updateCurveStyle(curveId, style) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) {
            return this.#createErrorResult(validation.message);
        }

        if (!style || typeof style !== 'object') {
            return this.#createErrorResult('スタイル設定が必要です');
        }

        try {
            const curve = this.#curveManager.curves[curveId];
            const oldColor = curve.color;
            const oldSize = curve.size;

            if (style.color !== undefined) {
                if (typeof style.color !== 'string') {
                    return this.#createErrorResult('色は文字列で指定してください');
                }
                curve.color = style.color;
                curve.path.attr('stroke', style.color);

                if (this.#graphCalculator && curve.graphCurve) {
                    this.#graphCalculator.updateCurveColor(curve.graphCurve.id, style.color);
                }
            }

            if (style.size !== undefined) {
                if (typeof style.size !== 'number' || style.size <= 0) {
                    return this.#createErrorResult('サイズは正の数値で指定してください');
                }
                curve.size = style.size;
                curve.path.attr('stroke-width', style.size);

                if (this.#graphCalculator && curve.graphCurve) {
                    this.#graphCalculator.updateCurveStrokeWidth(curve.graphCurve.id, style.size);
                }
            }

            this.#historyManager.addAction({
                type: 'styleChange',
                id: curveId,
                oldColor: oldColor,
                newColor: curve.color,
                oldSize: oldSize,
                newSize: curve.size
            });

            const colorIcon = document.querySelector(`.color-icon[data-id="${curveId}"]`);
            if (colorIcon && style.color) {
                colorIcon.style.backgroundColor = style.color;
            }

            return this.#createSuccessResult('曲線のスタイルが更新されました');
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    /**
     * 曲線を削除
     * @param {number} curveId - 曲線ID
     * @returns {Object} 削除結果 {success: boolean, message: string}
     */
    deleteCurve(curveId) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) {
            return this.#createErrorResult(validation.message);
        }

        try {
            const curve = this.#curveManager.curves[curveId];

            this.#historyManager.addAction({
                type: 'delete',
                curve: curve,
                index: curveId,
                nextCurveId: this.#settings.nextCurveId
            });

            curve.path.remove();

            if (this.#graphCalculator && curve.graphCurve) {
                this.#graphCalculator.removeCurve(curve.graphCurve.id);
            }

            this.#curveManager.curves.splice(curveId, 1);

            this.#curveManager.curves.forEach((curve, index) => {
                if (curve) {
                    curve.id = index;
                    try { if (curve.path && typeof curve.path.attr === 'function') curve.path.attr('data-id', index); } catch (e) {}
                }
            });

            this.#settings.nextCurveId = this.#curveManager.curves.length;
            this.#curveManager.updateCurveList();
            this.#curveManager.redrawCurves();
            this.#curveManager.deselectCurve();

            return this.#createSuccessResult('曲線が削除されました');
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    // ========== 近似設定 API ==========

    getApproxSettings() {
        const approximatorManager = this.#uiManager?.ApproximatorManager;
        if (!approximatorManager || typeof approximatorManager.getSettings !== 'function') {
            return this.#createErrorResult('近似設定マネージャーが利用できません');
        }

        const settingsSnapshot = JSON.parse(JSON.stringify(approximatorManager.getSettings()));
        const modelSnapshot = typeof approximatorManager.getSettingsModel === 'function'
            ? approximatorManager.getSettingsModel()
            : null;

        const payload = { settings: settingsSnapshot };
        if (modelSnapshot) {
            payload.model = JSON.parse(JSON.stringify(modelSnapshot));
        }

        return this.#createSuccessResult('近似設定を取得しました', payload);
    }

    setApproxSettings(partialSettings) {
        if (!partialSettings || typeof partialSettings !== 'object' || Array.isArray(partialSettings)) {
            return this.#createErrorResult('近似設定の更新にはオブジェクトを指定してください');
        }

        const approximatorManager = this.#uiManager?.ApproximatorManager;
        if (!approximatorManager || typeof approximatorManager.applyExternalSettings !== 'function') {
            return this.#createErrorResult('近似設定マネージャーが利用できません');
        }

        const result = approximatorManager.applyExternalSettings(partialSettings, {
            source: 'api',
            persist: true,
            updateUI: true
        });

        if (!result.success) {
            const detail = Array.isArray(result.errors) && result.errors.length
                ? ` (${result.errors.join(', ')})`
                : '';
            return this.#createErrorResult((result.message || '近似設定の更新に失敗しました') + detail);
        }

        const response = {
            settings: JSON.parse(JSON.stringify(result.settings))
        };

        if (Array.isArray(result.appliedKeys) && result.appliedKeys.length) {
            response.appliedKeys = [...result.appliedKeys];
        }

        if (Array.isArray(result.warnings) && result.warnings.length) {
            response.warnings = [...result.warnings];
        }

        return this.#createSuccessResult('近似設定を更新しました', response);
    }

    /**
     * 選択を解除
     */
    deselectCurve() {
        this.#settings.selectCurveId = null;
        d3.selectAll('.curve-item').classed('selected', false);

        this.#curveManager.deselectCurve();
        d3.selectAll("#emphasisCurve").remove();
        this.emphasisPath = null;

        if (this.#graphCalculator && this.#curveManager.emphasisGraphCurveId) {
            this.#graphCalculator.removeCurve(this.#curveManager.emphasisGraphCurveId);
            this.#curveManager.emphasisGraphCurveId = null;
        }
        this.#uiManager.penToolManager.resetToDefault();
        this.#settings.currentColor = this.#settings.prevColor;
        this.#settings.currentSize = this.#settings.prevSize;
    }

    /**
     * 曲線を平行移動
     * @param {number} curveId - 曲線ID
     * @param {number} deltaX - X方向の移動量
     * @param {number} deltaY - Y方向の移動量
     * @returns {Object} 移動結果 {success: boolean, message: string}
     */
    translateCurve(curveId, deltaX, deltaY) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) {
            return this.#createErrorResult(validation.message);
        }

        if (typeof deltaX !== 'number' || typeof deltaY !== 'number') {
            return this.#createErrorResult('移動量は数値で指定してください');
        }

        if (!isFinite(deltaX) || !isFinite(deltaY)) {
            return this.#createErrorResult('移動量は有限の数値である必要があります');
        }

        try {
            // CurveMovementHandlerを使用して移動
            if (this.#curveMovementHandler) {
                const result = this.#curveMovementHandler.moveCurve(curveId, deltaX, deltaY);
                if (result.success) {
                    return this.#createSuccessResult('曲線が移動されました');
                } else {
                    return this.#createErrorResult(result.message || '曲線の移動に失敗しました');
                }
            } else {
                return this.#createErrorResult('曲線移動機能が利用できません');
            }
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    // ========== 情報取得 API ==========

    /**
     * すべての曲線の情報を取得
     * @returns {Array} 曲線情報の配列
     */
    getCurves() {
        return this.#curveManager.curves.map(curve => ({
            id: curve.id,
            type: curve.type,
            color: curve.color,
            size: curve.size,
            isHidden: curve.isHidden,
            isDetailShown: curve.isDetailShown,
            latexEquations: curve.latexEquations ? [...curve.latexEquations] : [], // 配列のコピーを返す
            knotCount: curve.knotCount
        }));
    }

    /**
     * 指定された曲線の情報を取得
     * @param {number} curveId - 曲線ID
     * @returns {Object|null} 曲線情報、見つからない場合はnull
     */
    getCurve(curveId) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) {
            return null;
        }

        const curve = this.#curveManager.curves[curveId];
        return {
            id: curve.id,
            type: curve.type,
            color: curve.color,
            size: curve.size,
            isHidden: curve.isHidden,
            isDetailShown: curve.isDetailShown,
            latexEquations: curve.latexEquations ? [...curve.latexEquations] : [], // 配列のコピーを返す
            knotCount: curve.knotCount,
            originalPoints: curve.originalPoints ? [...curve.originalPoints] : [] // 配列のコピーを返す
        };
    }

    /**
     * 現在の設定を取得（読み取り専用のコピー）
     * @returns {Object} 設定情報
     */
    getSettings() {
        return {
            currentColor: this.#settings.currentColor,
            currentSize: this.#settings.currentSize,
            currentTool: this.#settings.currentTool,
            selectCurveId: this.#settings.selectCurveId,
            nextCurveId: this.#settings.nextCurveId,
            totalCurves: this.#curveManager.curves.length
        };
    }

    /** 詳細表示の切り替え（トグル or 指定） */
    toggleCurveDetails(curveId, show = null) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) return this.#createErrorResult(validation.message);
        if (!this.#curveManager) return this.#createErrorResult('CurveManagerが利用できません');
        try {
            if (show === null) {
                this.#curveManager.toggleDetailVisibility(curveId);
                return this.#createSuccessResult('詳細表示を切り替えました');
            } else {
                this.#curveManager.setCurveDetailState(curveId, !!show);
                return this.#createSuccessResult('詳細表示を更新しました', { detailShown: !!show });
            }
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    /** 詳細表示状態を取得 */
    getCurveDetailState(curveId) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) return null;
        if (!this.#curveManager || typeof this.#curveManager.getCurveDetailState !== 'function') return null;
        try { return this.#curveManager.getCurveDetailState(curveId); } catch { return null; }
    }

    // ========== 拡張モード管理 API ==========

    /**
     * 拡張モードを設定する（UI からも呼ばれることを想定）
     * @param {boolean} enabled
     */
    setAdvancedMode(enabled) {
        try {
            this.#settings.advancedMode = !!enabled;
            // カスタムイベントで他コンポーネントに通知
            const evt = new CustomEvent('advancedModeChanged', { detail: { enabled: !!enabled } });
            document.dispatchEvent(evt);
        } catch (e) {
            console.warn('setAdvancedMode failed', e);
        }
    }

    /**
     * 拡張モードの状態を取得
     * @returns {boolean}
     */
    isAdvancedMode() {
        return !!(this.#settings && this.#settings.advancedMode);
    }

    // ========== クエリ / UI 抑制フラグ API ==========

    /**
     * 新機能モーダルを非表示にするフラグを設定
     * @param {boolean} flag
     */
    setHideNewFeatureModal(flag) {
        try {
            this.#settings.hideNewFeatureModal = !!flag;
            document.dispatchEvent(new CustomEvent('graPenQueryFlagChanged', { detail: { name: 'hideNewFeatureModal', value: !!flag } }));
            return this.#createSuccessResult('hideNewFeatureModal を設定しました', { value: !!flag });
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    isNewFeatureModalHidden() {
        return !!(this.#settings && this.#settings.hideNewFeatureModal);
    }

    /**
     * チュートリアルパネルを非表示にするフラグを設定
     * @param {boolean} flag
     */
    setHideTutorialModal(flag) {
        try {
            this.#settings.hideTutorialModal = !!flag;
            document.dispatchEvent(new CustomEvent('graPenQueryFlagChanged', { detail: { name: 'hideTutorialModal', value: !!flag } }));
            return this.#createSuccessResult('hideTutorialModal を設定しました', { value: !!flag });
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    isTutorialModalHidden() {
        return !!(this.#settings && this.#settings.hideTutorialModal);
    }

    /**
     * ページ離脱時の警告を抑制するフラグを設定
     * @param {boolean} flag
     */
    setSuppressUnloadAlert(flag) {
        try {
            this.#settings.suppressUnloadAlert = !!flag;
            document.dispatchEvent(new CustomEvent('graPenQueryFlagChanged', { detail: { name: 'suppressUnloadAlert', value: !!flag } }));
            return this.#createSuccessResult('suppressUnloadAlert を設定しました', { value: !!flag });
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    isUnloadAlertSuppressed() {
        return !!(this.#settings && this.#settings.suppressUnloadAlert);
    }

    // ========== 表示制御 API ==========

    /**
     * 曲線の表示・非表示を切り替え
     * @param {number} curveId - 曲線ID
     * @param {boolean} visible - 表示するかどうか（省略時は切り替え）
     * @returns {Object} 結果 {success: boolean, message: string, visible: boolean}
     */
    toggleCurveVisibility(curveId, visible = null) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) {
            return { ...this.#createErrorResult(validation.message), visible: false };
        }

        try {
            if (visible === null) {
                // 切り替え
                this.#curveManager.toggleCurveVisibility(curveId);
            } else {
                // 指定された状態に設定
                this.#curveManager.setCurveVisibility(curveId, visible);
            }

            const curve = this.#curveManager.curves[curveId];
            const isVisible = !curve.isHidden;

            return this.#createSuccessResult('曲線の表示状態が変更されました', { visible: isVisible });
        } catch (error) {
            return { ...this.#createErrorResult(`エラー: ${error.message}`), visible: false };
        }
    }

    // ========== NumberUtil RPN API Exposure ==========

    /**
     * フォーミュラの種類を判定します（'quadratic'|'linear'|'constant'|'unknown')
     */
    detectFormulaType(formula) {
        if (typeof NumberUtil.detectFormulaType === 'function') return NumberUtil.detectFormulaType(formula);
        return 'unknown';
    }

    toRPN(formula) {
        if (typeof NumberUtil.toRPN === 'function') return NumberUtil.toRPN(formula);
        return [];
    }

    /**
     * Generate SVG for linear formulas (moved from LinearFunctionApproximator.generateSVGPathFromFormula)
     */
    generateSVGPathFromFormula_linear(latexEquations = [], originalPoints = [], options = {}) {
        const eq = Array.isArray(latexEquations) && latexEquations.length > 0 ? latexEquations[0] : null;
        if (!eq) return '';
        const formula = eq.formula || '';
        const type = eq.type || NumberUtil.detectFormulaType(formula);

        if (type === 'vertical' || eq.type === 'vertical') {
            const match = (formula || '').match(/x\s*=\s*([+-]?\d*\.?\d+)/);
            const xVal = match ? Number(match[1]) : NaN;
            const y1 = eq.domain ? Number(eq.domain.start) : NaN;
            const y2 = eq.domain ? Number(eq.domain.end) : NaN;
            if (!isNaN(xVal) && !isNaN(y1) && !isNaN(y2)) return `M ${xVal},${y1} L ${xVal},${y2}`;
            return '';
        }

        if (type === 'constant' || eq.type === 'constant') {
            const match = (formula || '').match(/y\s*=\s*([+-]?\d*\.?\d+)/);
            const yVal = match ? Number(match[1]) : NaN;
            const x1 = eq.domain ? Number(eq.domain.start) : NaN;
            const x2 = eq.domain ? Number(eq.domain.end) : NaN;
            if (!isNaN(yVal) && !isNaN(x1) && !isNaN(x2)) return `M ${x1},${yVal} L ${x2},${yVal}`;
            return '';
        }

        if (type === 'linear' || eq.type === 'linear') {
            const xStart = eq.domain ? Number(eq.domain.start) : NaN;
            const xEnd = eq.domain ? Number(eq.domain.end) : NaN;
            if (isNaN(xStart) || isNaN(xEnd)) return '';
            const yStart = NumberUtil.evaluateFormula(formula, xStart);
            const yEnd = NumberUtil.evaluateFormula(formula, xEnd);
            if (!isFinite(yStart) || !isFinite(yEnd)) return '';
            return `M ${xStart},${yStart} L ${xEnd},${yEnd}`;
        }

        return '';
    }

    /**
     * Generate SVG for piecewise linear formulas (moved from PiecewiseLinearApproximator.generateSVGPathFromFormula style logic)
     */
    generateSVGPathFromFormula_piecewise(latexEquations = [], originalPoints = [], options = {}) {
        if (!Array.isArray(latexEquations) || latexEquations.length === 0) return '';

        const segCmds = [];
        for (const seg of latexEquations) {
            const type = seg.type || 'linear';
            if (type === 'vertical') {
                const match = (seg.formula || '').match(/x\s*=\s*([+-]?\d*\.?\d+)/);
                const xVal = match ? Number(match[1]) : NaN;
                const y1 = seg.domain ? Number(seg.domain.start) : NaN;
                const y2 = seg.domain ? Number(seg.domain.end) : NaN;
                if (!isNaN(xVal) && !isNaN(y1) && !isNaN(y2)) segCmds.push(`M ${xVal},${y1} L ${xVal},${y2}`);
            } else if (type === 'constant') {
                const match = (seg.formula || '').match(/y\s*=\s*([+-]?\d*\.?\d+)/);
                const yVal = match ? Number(match[1]) : NaN;
                const x1 = seg.domain ? Number(seg.domain.start) : NaN;
                const x2 = seg.domain ? Number(seg.domain.end) : NaN;
                if (!isNaN(yVal) && !isNaN(x1) && !isNaN(x2)) segCmds.push(`M ${x1},${yVal} L ${x2},${yVal}`);
            } else {
                const xStart = seg.domain ? Number(seg.domain.start) : NaN;
                const xEnd = seg.domain ? Number(seg.domain.end) : NaN;
                if (!isNaN(xStart) && !isNaN(xEnd)) {
                    const yStart = NumberUtil.evaluateFormula(seg.formula || '', xStart);
                    const yEnd = NumberUtil.evaluateFormula(seg.formula || '', xEnd);
                    if (isFinite(yStart) && isFinite(yEnd)) segCmds.push(`M ${xStart},${yStart} L ${xEnd},${yEnd}`);
                }
            }
        }

        if (segCmds.length > 0) return segCmds.join(' ');
        return '';
    }

    /**
     * Generate SVG for quadratic formulas (moved from QuadraticBSplineCurveApproximator.generateSVGPathFromFormula)
     */
    generateSVGPathFromFormula_quadratic(latexEquations = [], originalPoints = [], options = {}) {
        if (!Array.isArray(latexEquations) || latexEquations.length === 0) return '';

        const segments = [];
        for (const eq of latexEquations) {
            const formula = eq.formula || '';
            const domainStart = eq.domain ? Number(eq.domain.start) : NaN;
            const domainEnd = eq.domain ? Number(eq.domain.end) : NaN;
            if (!isFinite(domainStart) || !isFinite(domainEnd)) continue;

            // Try parse coefficients via sampling
            let a = NaN, b = NaN, c = NaN;
            const x0 = domainStart;
            const x1 = (domainStart + domainEnd) / 2;
            const x2 = domainEnd;
            const y0 = NumberUtil.evaluateFormula(formula, x0);
            const y1 = NumberUtil.evaluateFormula(formula, x1);
            const y2 = NumberUtil.evaluateFormula(formula, x2);
            if ([y0, y1, y2].every(v => isFinite(v))) {
                const denom = (x0 - x1) * (x0 - x2) * (x1 - x2);
                if (denom !== 0) {
                    a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / denom;
                    b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / denom;
                    c = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / denom;
                }
            }

            if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue;

            const xm = (x0 + x2) / 2;
            const yS = a * x0 * x0 + b * x0 + c;
            const yE = a * x2 * x2 + b * x2 + c;
            const yM = a * xm * xm + b * xm + c;
            const P1x = xm;
            const P1y = 2 * yM - 0.5 * yS - 0.5 * yE;

            segments.push({ start: [x0, yS], control: [P1x, P1y], end: [x2, yE] });
        }

        if (segments.length === 0) return '';
        const cmds = [];
        cmds.push(`M ${segments[0].start[0]} ${segments[0].start[1]}`);
        for (const seg of segments) cmds.push(`Q ${seg.control[0]} ${seg.control[1]} ${seg.end[0]} ${seg.end[1]}`);
        return cmds.join(' ');
    }

    generateSVGPathFromFormula_circle(latexEquations = []) {
        const eq = Array.isArray(latexEquations) && latexEquations.length > 0 ? latexEquations[0] : null;
        if (!eq || !eq.params) return '';
        const center = Array.isArray(eq.params.center) ? eq.params.center : [0, 0];
        const radius = Number(eq.params.radius);
        if (!Number.isFinite(radius) || radius <= 0) return '';
        const [cx, cy] = center;
        const startX = cx + radius;
        const startY = cy;
        return [
            `M ${startX} ${startY}`,
            `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy}`,
            `A ${radius} ${radius} 0 1 0 ${startX} ${startY}`
        ].join(' ');
    }

    generateSVGPathFromFormula_ellipse(latexEquations = []) {
        const eq = Array.isArray(latexEquations) && latexEquations.length > 0 ? latexEquations[0] : null;
        if (!eq || !eq.params) return '';
        const center = Array.isArray(eq.params.center) ? eq.params.center : [0, 0];
        const radiusX = Number(eq.params.radiusX);
        const radiusY = Number(eq.params.radiusY);
        const rotation = Number(eq.params.rotation) || 0;
        if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX <= 0 || radiusY <= 0) return '';
        const cosT = Math.cos(rotation);
        const sinT = Math.sin(rotation);
        const [cx, cy] = center;
        const startX = cx + radiusX * cosT;
        const startY = cy + radiusX * sinT;
        const oppositeX = cx - radiusX * cosT;
        const oppositeY = cy - radiusX * sinT;
        const rotationDeg = (rotation * 180) / Math.PI;
        return [
            `M ${startX} ${startY}`,
            `A ${radiusX} ${radiusY} ${rotationDeg} 0 1 ${oppositeX} ${oppositeY}`,
            `A ${radiusX} ${radiusY} ${rotationDeg} 0 1 ${startX} ${startY}`
        ].join(' ');
    }

    generateSVGPathFromFormula_quadraticBezierSegment(latexEquations = []) {
        if (!Array.isArray(latexEquations) || latexEquations.length === 0) return '';
        const commands = [];
        let moved = false;
        for (const eq of latexEquations) {
            const controlPoints = eq && eq.params ? eq.params.controlPoints : null;
            if (!Array.isArray(controlPoints) || controlPoints.length < 3) continue;
            const [p0, p1, p2] = controlPoints;
            if (!moved) {
                commands.push(`M ${p0[0]} ${p0[1]}`);
                moved = true;
            }
            commands.push(`Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`);
        }
        return commands.join(' ');
    }

    generateSVGPathFromFormula_cubicBezierSegment(latexEquations = []) {
        if (!Array.isArray(latexEquations) || latexEquations.length === 0) return '';
        const commands = [];
        let moved = false;
        for (const eq of latexEquations) {
            const controlPoints = eq && eq.params ? eq.params.controlPoints : null;
            if (!Array.isArray(controlPoints) || controlPoints.length < 4) continue;
            const [p0, p1, p2, p3] = controlPoints;
            if (!moved) {
                commands.push(`M ${p0[0]} ${p0[1]}`);
                moved = true;
            }
            commands.push(`C ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`);
        }
        return commands.join(' ');
    }

    generateSVGPathFromFormula_arc(latexEquations = []) {
        if (!Array.isArray(latexEquations) || latexEquations.length === 0) return '';
        const commands = [];
        let moved = false;
        for (const eq of latexEquations) {
            const params = eq && eq.params;
            if (!params) continue;
            const center = Array.isArray(params.center) ? params.center : [0, 0];
            const radius = Number(params.radius);
            const startAngle = Number(params.startAngle ?? 0);
            const endAngle = Number(params.endAngle ?? startAngle);
            const direction = params.direction >= 0 ? 1 : 0;
            if (!Number.isFinite(radius) || radius <= 0) continue;
            const [cx, cy] = center;
            const startX = cx + radius * Math.cos(startAngle);
            const startY = cy + radius * Math.sin(startAngle);
            const endX = cx + radius * Math.cos(endAngle);
            const endY = cy + radius * Math.sin(endAngle);
            const sweep = endAngle - startAngle;
            const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
            if (!moved) {
                commands.push(`M ${startX} ${startY}`);
                moved = true;
            }
            commands.push(`A ${radius} ${radius} 0 ${largeArc} ${direction} ${endX} ${endY}`);
        }
        return commands.join(' ');
    }

    generateSVGPathFromApproximationData(approximationData = {}) {
        if (!approximationData) return '';
        if (typeof approximationData.svgPath === 'string' && approximationData.svgPath.length > 0) {
            return approximationData.svgPath;
        }
        const segments = Array.isArray(approximationData.segments) ? approximationData.segments : [];
        if (!segments.length) return '';
        const commands = [];
        let moved = false;
        const moveTo = (point) => {
            commands.push(`M ${point[0]} ${point[1]}`);
            moved = true;
        };
        const lastPointOf = (point) => {
            if (Array.isArray(point) && point.length >= 2) return point;
            if (point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number') {
                return [point.x, point.y];
            }
            return null;
        };
        segments.forEach(seg => {
            if (!seg) return;
            if (seg.type === 'linear' && Array.isArray(seg.points) && seg.points.length >= 2) {
                const start = lastPointOf(seg.points[0]);
                const end = lastPointOf(seg.points[1]);
                if (!start || !end) return;
                if (!moved) moveTo(start);
                commands.push(`L ${end[0]} ${end[1]}`);
            } else if (seg.type === 'quadratic' && Array.isArray(seg.controlPoints) && seg.controlPoints.length >= 3) {
                const [p0, p1, p2] = seg.controlPoints;
                if (!moved) moveTo(p0);
                commands.push(`Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`);
            } else if (seg.type === 'cubic' && Array.isArray(seg.controlPoints) && seg.controlPoints.length >= 4) {
                const [p0, p1, p2, p3] = seg.controlPoints;
                if (!moved) moveTo(p0);
                commands.push(`C ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`);
            } else if (seg.type === 'arc' && seg.center && typeof seg.radius === 'number') {
                const center = Array.isArray(seg.center) ? seg.center : [seg.center.x, seg.center.y];
                const radius = seg.radius;
                const startAngle = seg.startAngle ?? 0;
                const endAngle = seg.endAngle ?? startAngle;
                const direction = seg.sweepDirection >= 0 ? 1 : 0;
                const start = seg.start ? lastPointOf(seg.start) : [center[0] + radius * Math.cos(startAngle), center[1] + radius * Math.sin(startAngle)];
                const end = seg.end ? lastPointOf(seg.end) : [center[0] + radius * Math.cos(endAngle), center[1] + radius * Math.sin(endAngle)];
                const sweep = endAngle - startAngle;
                const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
                if (!moved && start) moveTo(start);
                if (end) {
                    commands.push(`A ${radius} ${radius} 0 ${largeArc} ${direction} ${end[0]} ${end[1]}`);
                }
            }
        });
        return commands.join(' ');
    }

    /**
     * Public dispatcher that matches the old ApproximatorManager behavior.
     */
    generateSVGPathFromFormula(latexEquations, originalPoints, options = {}) {
        if (options && options.approximationData) {
            const approxPath = this.generateSVGPathFromApproximationData(options.approximationData);
            if (approxPath) return approxPath;
        }
        const type = options.type || (latexEquations && latexEquations[0] && latexEquations[0].type) || null;
        // linear, vertival, constantは1つの式のみを想定
        // if (type === 'linear' || type === 'vertical' || type === 'constant') return this.generateSVGPathFromFormula_linear(latexEquations, originalPoints, options);
        if (type === 'linear' || type === 'vertical' || type === 'constant' || type === 'piecewiseLinear' || type === 'piecewise') return this.generateSVGPathFromFormula_piecewise(latexEquations, originalPoints, options);
        if (type === 'quadratic') return this.generateSVGPathFromFormula_quadratic(latexEquations, originalPoints, options);
        if (type === 'quadraticBezier') return this.generateSVGPathFromFormula_quadraticBezierSegment(latexEquations, originalPoints, options);
        if (type === 'cubicBezier') return this.generateSVGPathFromFormula_cubicBezierSegment(latexEquations, originalPoints, options);
        if (type === 'circle') return this.generateSVGPathFromFormula_circle(latexEquations, originalPoints, options);
        if (type === 'ellipse') return this.generateSVGPathFromFormula_ellipse(latexEquations, originalPoints, options);
        if (type === 'arc') return this.generateSVGPathFromFormula_arc(latexEquations, originalPoints, options);
        if (type === 'selectiveHybrid' && options && options.approximationData) {
            return this.generateSVGPathFromApproximationData(options.approximationData);
        }
        return '';
    }

    applyDeltaToRPN(rpnTokens, dx = 0, dy = 0) {
        try {
            const num = require('./util/NumberUtil.js');
            if (typeof num.applyDeltaToRPN === 'function') return num.applyDeltaToRPN(rpnTokens, dx, dy);
        } catch (e) {
            if (typeof window !== 'undefined' && window.NumberUtil && typeof window.NumberUtil.applyDeltaToRPN === 'function') {
                return window.NumberUtil.applyDeltaToRPN(rpnTokens, dx, dy);
            }
        }
        return rpnTokens;
    }

    fromRPN(rpnTokens) {
        try {
            const num = require('./util/NumberUtil.js');
            if (typeof num.fromRPN === 'function') return num.fromRPN(rpnTokens);
        } catch (e) {
            if (typeof window !== 'undefined' && window.NumberUtil && typeof window.NumberUtil.fromRPN === 'function') {
                return window.NumberUtil.fromRPN(rpnTokens);
            }
        }
        return '';
    }

    /**
     * 全ての曲線をクリア
     * @returns {Object} クリア結果 {success: boolean, message: string}
     */
    clearAllCurves() {
        try {
            this.#curveManager.clearCanvas();
            this.#settings.nextCurveId = 0;

            return this.#createSuccessResult('全ての曲線がクリアされました');
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    // ========== ツール制御 API ==========

    /**
     * アクティブツールを設定
     * @param {string} tool - ツール名 ('pen' | 'cursor')
     * @returns {Object} 設定結果 {success: boolean, message: string}
     */
    setTool(tool) {
        if (!['pen', 'cursor'].includes(tool)) {
            return this.#createErrorResult('有効なツールは "pen" または "cursor" です');
        }

        try {
            this.#uiManager.setActiveTool(tool);
            return this.#createSuccessResult(`ツールが ${tool} に設定されました`);
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    // ========== 履歴操作 API ==========

    /**
     * 元に戻す
     * @returns {Object} 実行結果 {success: boolean, message: string}
     */
    undo() {
        try {
            if (this.#historyManager.isUndoStackEmpty()) {
                return this.#createErrorResult('元に戻す操作がありません');
            }

            this.#historyManager.undo();
            this.#uiManager.updateHistoryButtons();
            return this.#createSuccessResult('操作を元に戻しました');
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    /**
     * やり直し
     * @returns {Object} 実行結果 {success: boolean, message: string}
     */
    redo() {
        try {
            if (this.#historyManager.isRedoStackEmpty()) {
                return this.#createErrorResult('やり直す操作がありません');
            }

            this.#historyManager.redo();
            this.#uiManager.updateHistoryButtons();
            return this.#createSuccessResult('操作をやり直しました');
        } catch (error) {
            return this.#createErrorResult(`エラー: ${error.message}`);
        }
    }

    /**
     * スライダーの値をプログラムから設定する（公開API）
     * @param {number} curveId - 曲線ID
     * @param {number} value - スライダーに設定する値
     * @param {boolean} suppressHistory - true の場合は履歴に追加しない
     * @returns {Object} 実行結果
     */
    setKnotCountSliderValue(curveId, value, suppressHistory = false) {
        const validation = this.#validateCurveId(curveId);
        if (!validation.valid) return this.#createErrorResult(validation.message);

        const v = Number(value);
        if (!Number.isFinite(v)) return this.#createErrorResult('値が数値ではありません');

        try {
            if (this.#curveManager && typeof this.#curveManager.setKnotCountSliderValue === 'function') {
                this.#curveManager.setKnotCountSliderValue(curveId, v, suppressHistory);
                return this.#createSuccessResult('節点数スライダー値を設定しました', { curveId, value: v });
            }
            return this.#createErrorResult('CurveManager API が利用できません');
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    // ========== グラフ表示 API ==========

    /** ドメインを設定（GraphCalculatorに委譲） */
    setDomainRange(xMinOrDomain, xMax, yMin, yMax, animate = true) {
        try {
            if (!this.#graphCalculator) return this.#createErrorResult('GraphCalculatorが利用できません');
            let domain;
            if (typeof xMinOrDomain === 'object' && xMinOrDomain) {
                domain = xMinOrDomain;
                animate = (typeof xMax === 'boolean') ? xMax : animate;
            } else {
                domain = { xMin: xMinOrDomain, xMax, yMin, yMax };
            }
            this.#graphCalculator.setDomain(domain, !!animate);
            return this.#createSuccessResult('ドメインを設定しました', { domain: this.#graphCalculator.getDomain() });
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    /** 現在のドメインを取得 */
    getDomain() {
        if (!this.#graphCalculator) return null;
        return this.#graphCalculator.getDomain();
    }

    /** 指定座標を中心に表示（scale指定でズーム） */
    centerOn(x, y, options = {}) {
        try {
            if (!this.#graphCalculator) return this.#createErrorResult('GraphCalculatorが利用できません');
            const { scale = null, animate = true } = options || {};
            const cur = this.#graphCalculator.getDomain();
            if (!cur) return this.#createErrorResult('ドメイン取得に失敗');
            const curW = cur.xMax - cur.xMin;
            const curH = cur.yMax - cur.yMin;
            const newW = (scale && Number.isFinite(scale) && scale > 0) ? (curW / scale) : curW;
            const newH = (scale && Number.isFinite(scale) && scale > 0) ? (curH / scale) : curH;
            const domain = { xMin: x - newW / 2, xMax: x + newW / 2, yMin: y - newH / 2, yMax: y + newH / 2 };
            this.#graphCalculator.setDomain(domain, !!animate);
            return this.#createSuccessResult('中心座標を移動しました', { domain: this.#graphCalculator.getDomain() });
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    /** 一段階ズームイン */
    zoomIn() {
        if (!this.#graphCalculator) return this.#createErrorResult('GraphCalculatorが利用できません');
        try { this.#graphCalculator.zoomIn(); return this.#createSuccessResult('ズームインしました'); } catch (e) { return this.#createErrorResult(`エラー: ${e.message}`); }
    }

    /** 一段階ズームアウト */
    zoomOut() {
        if (!this.#graphCalculator) return this.#createErrorResult('GraphCalculatorが利用できません');
        try { this.#graphCalculator.zoomOut(); return this.#createSuccessResult('ズームアウトしました'); } catch (e) { return this.#createErrorResult(`エラー: ${e.message}`); }
    }

    /** 初期ビューに戻す */
    resetToHome() {
        if (!this.#graphCalculator) return this.#createErrorResult('GraphCalculatorが利用できません');
        try { this.#graphCalculator.resetToHome(); return this.#createSuccessResult('ホームにリセットしました'); } catch (e) { return this.#createErrorResult(`エラー: ${e.message}`); }
    }

    /**
     * 現在のドメインがホーム（初期ドメイン）にあるかを判定します。
     * 第2引数に true または { requireXRange: true } を渡すと、x ドメインが [-10,10] であることも確認します。
     * @param {number} tolerance - 許容誤差（ドメイン座標系）。デフォルトは 1e-0。
     * @param {Object|boolean} optionsOrRequireXRange - オプションまたはフラグ（省略時は false）。
     * @returns {boolean|null} true/false、GraphCalculatorが利用できない場合は null。
     */
    isAtHome(tolerance = 1e-0, optionsOrRequireXRange = false) {
        if (!this.#graphCalculator) return null;
        try {
            if (typeof this.#graphCalculator.isAtHome === 'function') {
                return this.#graphCalculator.isAtHome(tolerance, optionsOrRequireXRange);
            }

            // フォールバック: GraphCalculatorが isAtHome を提供しない場合は類似ロジックで判定
            const d = this.#graphCalculator.getDomain();
            if (!d) return null;
            const cx = (d.xMin + d.xMax) / 2;
            const cy = (d.yMin + d.yMax) / 2;
            const tol = (typeof tolerance === 'number' && isFinite(tolerance)) ? Math.abs(tolerance) : 1e-0;

            const centerOk = Math.abs(cx) <= tol && Math.abs(cy) <= tol;

            let requireXRange = false;
            if (optionsOrRequireXRange === true) requireXRange = true;
            else if (optionsOrRequireXRange && typeof optionsOrRequireXRange === 'object' && optionsOrRequireXRange.requireXRange) requireXRange = true;

            if (!requireXRange) return centerOk;

            const xMinOk = Math.abs(d.xMin - (-10)) <= tol;
            const xMaxOk = Math.abs(d.xMax - 10) <= tol;

            return centerOk && xMinOk && xMaxOk;
        } catch (e) {
            return null;
        }
    }

    /** 画面座標→ドメイン座標 */
    screenToDomain(screenX, screenY) {
        if (!this.#graphCalculator) return null;
        return this.#graphCalculator.screenToDomain(screenX, screenY);
    }

    /** ドメイン座標→画面座標 */
    domainToScreen(x, y) {
        if (!this.#graphCalculator) return null;
        return this.#graphCalculator.domainToScreen(x, y);
    }

    /** 曲線のバウンディングボックス取得 */
    getCurveBoundingBox(curveId, space = 'domain') {
        if (!this.#graphCalculator) return null;
        return this.#graphCalculator.getCurveBoundingBox(curveId, space);
    }

    /** 曲線の中心へジャンプ（ズームなし） */
    jumpToCurve(curveId, options = {}) {
        try {
            if (!this.#graphCalculator) return this.#createErrorResult('GraphCalculatorが利用できません');
            const bbox = this.#graphCalculator.getCurveBoundingBox(curveId, 'domain');
            if (!bbox) return this.#createErrorResult('曲線が見つかりません');
            const cur = this.#graphCalculator.getDomain();
            const w = cur.xMax - cur.xMin;
            const h = cur.yMax - cur.yMin;
            const domain = { xMin: bbox.cx - w / 2, xMax: bbox.cx + w / 2, yMin: bbox.cy - h / 2, yMax: bbox.cy + h / 2 };
            this.#graphCalculator.setDomain(domain, options && options.animate !== undefined ? !!options.animate : true);
            return this.#createSuccessResult('曲線の中心に移動しました', { domain });
        } catch (e) {
            return this.#createErrorResult(`エラー: ${e.message}`);
        }
    }

    // ========== ヘルパーメソッド ==========

    /**
     * APIの使用方法を表示
     */
    help() {
        console.log(`
🎨 GraPen API v${this.apiVersion} 使用方法:

=== 曲線操作 ===
• addCurve(descriptor) - 曲線を追加（descriptor: { points, color, size, useAdvancedMode, type } ）
    例: GraPen.addCurve({ points: [[0,0], [1,1], [2,0]], color: '#ff0000', size: 3 })

• updateCurveStyle(curveId, style) - 曲線のスタイルを変更
  例: GraPen.updateCurveStyle(0, {color: '#00ff00', size: 5})

• deleteCurve(curveId) - 曲線を削除
  例: GraPen.deleteCurve(0)
• toggleCurveDetails(curveId, show=null) - 詳細表示の切替/設定
    例: GraPen.toggleCurveDetails(0) / GraPen.toggleCurveDetails(0, true)

• translateCurve(curveId, deltaX, deltaY) - 曲線を平行移動
  例: GraPen.translateCurve(0, 1, -0.5)

=== 情報取得 ===
• getCurves() - 全曲線の情報を取得
• getCurve(curveId) - 指定曲線の情報を取得
• getSettings() - 現在の設定を取得

=== 近似設定 ===
• getApproxSettings() - 現在の近似設定とモデル情報を取得
• setApproxSettings(partial) - 近似設定を部分更新（バリデーション後に保存）

=== 表示制御 ===
• toggleCurveVisibility(curveId, visible) - 曲線の表示切り替え
• clearAllCurves() - 全曲線をクリア

=== グラフ表示 ===
• setDomainRange(domain|xMin,xMax,yMin,yMax, animate=true) - ドメイン設定
    例: GraPen.setDomainRange({xMin:-5,xMax:5,yMin:-3,yMax:3}, true)
• getDomain() - 現在のドメイン取得
• centerOn(x, y, {scale, animate}) - 座標を中心に表示（scale指定でズーム）
    例: GraPen.centerOn(2, 3, { scale: 2 })
• zoomIn(), zoomOut() - 段階ズーム
• resetToHome() - 初期ビューに戻す
• screenToDomain(x, y), domainToScreen(x, y)
• getCurveBoundingBox(curveId, space='domain')
• jumpToCurve(curveId, {animate}) - 曲線の中心に移動（ズームなし）
 
 • isAtHome(tolerance = 1e-0, optionsOrRequireXRange = false) - 現在のビューがホーム（中心が原点、オプションで x ドメインが [-10,10]）かを判定します（true/false/null）

=== ツール制御 ===
• setTool(tool) - アクティブツールを設定 ('pen' | 'cursor')

=== 履歴操作 ===
• undo() - 元に戻す
• redo() - やり直し

=== その他 ===
• help() - このヘルプを表示
• version - アプリケーションバージョン (読み取り専用)
• apiVersion - APIバージョン (読み取り専用)

⚠️  注意: 内部クラス（UIManager、CurveManagerなど）への直接アクセスは制限されています
        `);
    }
}
