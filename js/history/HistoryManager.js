/**
 * 履歴管理クラス
 * 元に戻す/やり直し機能を担当
 */
export class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];

        this.penToolManager = null;
        this.curveManager = null;
        this.graphCalculator = null;
        this.uiManager = null;
        this.saveGraphManager = null;
    }

    initManagers(uiManager) {
        this.penToolManager = uiManager.penToolManager;
        this.curveManager = uiManager.curveManager;
        this.graphCalculator = uiManager.graphCalculator;
        this.uiManager = uiManager;
        this.saveGraphManager = uiManager.saveGraphManager;
        
        // SaveGraphManagerにHistoryManagerへの参照を渡す
        if (this.saveGraphManager) {
            this.saveGraphManager.setHistoryManager(this);
        }
    }

    /**
     * オブジェクトのディープコピーを作成する
     * @private
     */
    _deepCopy(obj) {
        if (obj === null || typeof obj !== 'object') return obj;

        // SVGElementの場合は参照を返す
        if (obj instanceof SVGElement) return obj;

        // 配列の場合
        if (Array.isArray(obj)) {
            return obj.map(item => this._deepCopy(item));
        }

        // オブジェクトの場合
        const copy = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (key === 'path' || key === 'hitArea' || key === 'group' ||
                    key === 'element' || key === 'points' || key === 'graphCurve') {
                    // DOM要素や特殊オブジェクトは参照を保持
                    copy[key] = obj[key];
                } else {
                    copy[key] = this._deepCopy(obj[key]);
                }
            }
        }
        return copy;
    }

    /**
     * アクションを履歴に追加
     * GraphCalculatorの曲線オブジェクトを適切に処理する
     */
    addAction(action) {
        // アクションのタイプに応じて必要なデータを保存
        switch (action.type) {
            case 'add':
                if (action.curve && action.curve.graphCurve) {
                    // GraphCalculator参照の主要データを保存
                    action.graphCurveData = {
                        id: action.curve.graphCurve.id,
                        originalData: action.curve.graphCurve.originalData,
                        points: action.curve.graphCurve.points
                    };

                    // 曲線と詳細の表示状態を保存
                    action.isHidden = action.curve.isHidden;
                    action.isDetailShown = action.curve.isDetailShown;
                }
                break;

            case 'delete':
                if (action.curve && action.curve.graphCurve) {
                    action.graphCurveData = {
                        id: action.curve.graphCurve.id,
                        originalData: action.curve.graphCurve.originalData,
                        points: action.curve.graphCurve.points
                    };

                    // 曲線と詳細の表示状態を保存
                    action.isHidden = action.curve.isHidden;
                    action.isDetailShown = action.curve.isDetailShown;
                }
                break;

            case 'color':
            case 'size':
            case 'styleChange':
                // 色やサイズ変更アクションには詳細状態を追加
                if (action.id !== undefined) {
                    action.isDetailShown = this.getCurveDetailState(action.id);
                }
                break;

            case 'clear':
                // 全曲線の詳細な状態を保存
                if (Array.isArray(action.curves)) {
                    action.curves.forEach(curve => {
                        if (curve && curve.graphCurve) {
                            curve.graphCurveData = {
                                id: curve.graphCurve.id,
                                originalData: curve.graphCurve.originalData,
                                points: curve.graphCurve.points
                            };
                        }
                    });
                }
                break;

            case 'reorder':
                // reorderには特別な処理は不要
                break;

            case 'toggleDetails':
                // 詳細表示の切り替えアクション（プロパティ名は既に明確）
                break;

            case 'import':
                // importアクションの処理
                if (Array.isArray(action.curves)) {
                    action.curves.forEach(curve => {
                        if (curve && curve.graphCurve) {
                            curve.graphCurveData = {
                                id: curve.graphCurve.id,
                                originalData: curve.graphCurve.originalData,
                                points: curve.graphCurve.points
                            };
                        }
                    });
                }
                break;

            case 'toggleVisibility':
                // 表示/非表示の切り替えアクション（プロパティ名は既に明確）
                break;

            case 'defaultStyleChange':
                // デフォルトスタイル変更アクションの処理
                break;

            case 'moveCurve':
                // 曲線移動アクションの処理
                if (action.oldPoints && action.newPoints) {
                    action.oldPoints = this._deepCopy(action.oldPoints);
                    action.newPoints = this._deepCopy(action.newPoints);
                }
                break;
        }

        // アクションのディープコピーを作成
        const actionCopy = this._deepCopy(action);
        this.undoStack.push(actionCopy);
        this.redoStack = [];
        
        // 新しい履歴が追加されたらSaveGraphManagerの状態をリセット
        if (this.saveGraphManager) {
            this.saveGraphManager.resetSaveState();
        }
    }

    /**
     * 曲線の詳細表示状態を取得するヘルパーメソッド
     */
    getCurveDetailState(id) {
        // このメソッドはUIManagerから適切にセットされる必要があります
        // デフォルト値を返します
        return false;
    }

    /**
     * アクションの取得
     */
    getUndoAction() {
        if (this.undoStack.length === 0) return null;
        const action = this.undoStack.pop();
        const actionCopy = this._deepCopy(action);
        this.redoStack.push(actionCopy);
        return actionCopy;
    }

    /**
     * やり直しアクションの取得
     */
    getRedoAction() {
        if (this.redoStack.length === 0) return null;
        const action = this.redoStack.pop();
        const actionCopy = this._deepCopy(action);
        this.undoStack.push(actionCopy);
        return actionCopy;
    }

    /**
     * 履歴が空かどうかを確認
     */
    isUndoStackEmpty() {
        return this.undoStack.length === 0;
    }

    /**
     * やり直し履歴が空かどうかを確認
     */
    isRedoStackEmpty() {
        return this.redoStack.length === 0;
    }

    /**
     * Undoスタックの最後の要素を返す（削除はしない）
     */
    peekUndoAction() {
        if (this.isUndoStackEmpty()) return null;
        return this._deepCopy(this.undoStack[this.undoStack.length - 1]);
    }

    /**
     * 元に戻す処理
     */
    undo() {
        const action = this.getUndoAction();
        if (!action) return;

        // 現在選択中の曲線IDを記録
        const currentSelectedId = this.uiManager.settings.selectCurveId;

        switch (action.type) {
            case 'add':
                // パスの削除
                if (action.curve && action.curve.path) {
                    action.curve.path.remove();

                    // GraphCalculatorからも曲線を削除
                    if (action.curve.graphCurve) {
                        this.graphCalculator.removeCurve(action.curve.graphCurve.id);
                    }

                    // IDが有効かチェック
                    if (action.curve.id >= 0 && action.curve.id < this.curveManager.curves.length) {
                        this.curveManager.curves.splice(action.curve.id, 1);
                        this.uiManager.settings.nextCurveId--;
                    }
                }
                break;

            case 'delete':
                // action.indexが有効かチェック
                if (action.index >= 0) {
                    this.curveManager.curves.splice(action.index, 0, action.curve);

                    // グラフ計算機のSVGに曲線を追加
                    if (this.graphCalculator && this.curveManager.g && action.curve && action.curve.path) {
                        this.curveManager.g.node().appendChild(action.curve.path.node());

                        // GraphCalculatorに曲線を復元
                        if (action.curve.graphCurve || action.graphCurveData) {
                            const curveData = action.graphCurveData ||
                                (action.curve.graphCurve ? {
                                    id: action.curve.graphCurve.id,
                                    originalData: action.curve.graphCurve.originalData
                                } : null);

                            if (curveData) {
                                const newCurve = this.graphCalculator.addCurve(curveData.originalData, {
                                    id: curveData.id,
                                    color: action.curve.color,
                                    width: action.curve.size
                                });

                                curveData.points.forEach(point => {
                                    this.graphCalculator.addPoint(
                                        action.curve.graphCurve.id,
                                        point.x,
                                        point.y,
                                        {
                                            fill: point.properties.fill,
                                            color: point.color,
                                            size: point.properties.size,
                                            shape: point.shapeType,
                                            stroke: point.properties.stroke,
                                            strokeWidth: point.properties.strokeWidth,
                                        }
                                    );
                                });


                                // 復元したGraphCalculator曲線参照を更新
                                action.curve.graphCurve = newCurve;
                            }
                        }

                        // 詳細表示状態を復元
                        if (action.isHidden !== undefined) {
                            this.curveManager.setCurveVisibility(action.index, !action.isHidden);
                        }
                    }

                    this.uiManager.settings.nextCurveId = action.nextCurveId || this.curveManager.curves.length;
                }
                break;

            case 'color':
                // action.idが有効かチェック
                if (action.id !== undefined &&
                    action.id >= 0 &&
                    action.id < this.curveManager.curves.length &&
                    this.curveManager.curves[action.id]) {

                    // 色を元に戻す
                    this.curveManager.curves[action.id].color = action.oldColor;
                    this.curveManager.curves[action.id].path.attr('stroke', action.oldColor);

                    // 選択中の曲線なら内部状態も更新
                    if (this.uiManager.settings.selectCurveId === action.id) {
                        this.uiManager.settings.currentColor = action.oldColor;

                        // PenToolManagerの表示も更新
                        // if (this.penToolManager) {
                        //   this.penToolManager.updateFromCurveSelection(action.oldColor, this.curveManager.curves[action.id].size);
                        // }
                    }

                    // GraphCalculatorの曲線も更新
                    if (this.curveManager.curves[action.id].graphCurve) {
                        const graphCalcCurve = this.curveManager.curves[action.id].graphCurve;
                        this.graphCalculator.updateCurve(graphCalcCurve.id, { color: action.oldColor });
                    }

                    // リスト内の色表示も更新
                    const colorIcon = document.querySelector(`.color-icon[data-id="${action.id}"]`);
                    if (colorIcon) {
                        colorIcon.style.backgroundColor = action.oldColor;
                    }
                }
                break;

            case 'size':
                // action.idが有効かチェック
                if (action.id !== undefined &&
                    action.id >= 0 &&
                    action.id < this.curveManager.curves.length &&
                    this.curveManager.curves[action.id]) {

                    // サイズを元に戻す
                    this.curveManager.curves[action.id].size = action.oldSize;
                    this.curveManager.curves[action.id].path.attr('stroke-width', action.oldSize);

                    // 選択中の曲線なら内部状態も更新
                    if (this.uiManager.settings.selectCurveId === action.id) {
                        this.uiManager.settings.currentSize = action.oldSize;

                        // PenToolManagerの表示も更新
                        if (this.penToolManager) {
                            this.penToolManager.updateFromCurveSelection(this.uiManager.settings.currentColor, action.oldSize);
                        }
                    }

                    // GraphCalculatorの曲線も更新
                    if (this.curveManager.curves[action.id].graphCurve) {
                        const graphCalcCurve = this.curveManager.curves[action.id].graphCurve;
                        this.graphCalculator.updateCurve(graphCalcCurve.id, { width: action.oldSize });
                    }

                    // リスト内のサイズスライダーも更新
                    const sizeSlider = document.querySelector(`.curve-item[data-id="${action.id}"] .size-slider`);
                    if (sizeSlider) {
                        sizeSlider.value = action.oldSize;
                    }
                }
                break;

            case 'clear':
                this.curveManager.curves = action.curves;

                // GraphCalculatorに曲線を復元
                if (this.graphCalculator) {
                    action.curves.forEach(curve => {
                        if (curve && (curve.graphCurve || curve.graphCurveData)) {
                            const curveData = curve.graphCurveData ||
                                (curve.graphCurve ? {
                                    id: curve.graphCurve.id,
                                    originalData: curve.graphCurve.originalData
                                } : null);

                            if (curveData) {
                                const newCurve = this.graphCalculator.addCurve(curveData.originalData, {
                                    id: curveData.id,
                                    color: curve.color,
                                    width: curve.size
                                });

                                // 復元したGraphCalculator曲線参照を更新
                                curve.graphCurve = newCurve;
                            }
                        }
                    });
                }

                this.curveManager.redrawCurves();
                break;

            case 'reorder':
                this.curveManager.reorderCurves(action.toId, action.fromId);
                // 重複を避けるために削除
                this.undoStack.pop();
                break;

            case 'toggleDetails':
                // 詳細表示状態を元に戻す
                this.curveManager.setCurveDetailState(action.id, action.oldDetailShown);
                break;

            case 'toggleVisibility':
                // 表示/非表示状態を元に戻す
                this.curveManager.setCurveVisibility(action.id, !action.oldHidden);

                // 色アイコンのクラスも更新
                const colorIcon = document.querySelector(`.color-icon[data-id="${action.id}"]`);
                if (colorIcon) {
                    if (action.oldHidden) {
                        colorIcon.classList.add('hidden-curve');
                    } else {
                        colorIcon.classList.remove('hidden-curve');
                    }
                }
                break;

            case 'defaultColor':
                // 曲線選択なしの場合のデフォルト色変更
                this.uiManager.settings.currentColor = action.oldColor;
                this.uiManager.settings.prevColor = action.oldColor;

                // カラーディスプレイを更新
                this.penToolManager.setSize(action.oldColor);

                // PenToolManagerの表示も更新（存在する場合）
                if (this.penToolManager) {
                    this.penToolManager.updateFromCurveSelection(action.oldColor, this.settings.currentSize);
                }
                break;

            case 'styleChange':
                if (action.id !== undefined &&
                    action.id >= 0 &&
                    action.id < this.curveManager.curves.length) {

                    // 曲線のスタイルを元に戻す
                    const curve = this.curveManager.curves[action.id];
                    curve.color = action.oldStyle.color;
                    curve.size = action.oldStyle.size;

                    // D3パスを更新
                    curve.path.attr('stroke', action.oldStyle.color)
                        .attr('stroke-width', action.oldStyle.size);

                    // GraphCalculatorの曲線も更新
                    if (curve.graphCurve) {
                        this.graphCalculator.updateCurve(curve.graphCurve.id, {
                            color: action.oldStyle.color,
                            width: action.oldStyle.size
                        });
                    }

                    // 現在選択中の曲線なら設定も更新
                    if (this.uiManager.settings.selectCurveId === action.id) {
                        this.uiManager.settings.currentColor = action.oldStyle.color;
                        this.uiManager.settings.currentSize = action.oldStyle.size;

                        // PenToolManagerの表示も更新
                        if (this.penToolManager) {
                            this.penToolManager.updateFromCurveSelection(
                                action.oldStyle.color,
                                action.oldStyle.size
                            );
                        }
                    }
                }
                break;

            case 'defaultStyleChange':
                // デフォルトスタイルを元に戻す
                this.uiManager.settings.currentColor = action.oldStyle.color;
                this.uiManager.settings.currentSize = action.oldStyle.size;
                this.uiManager.settings.prevColor = action.oldStyle.color;
                this.uiManager.settings.prevSize = action.oldStyle.size;

                // UI表示を更新
                if (this.penToolManager) {
                    this.penToolManager.updateFromCurveSelection(
                        action.oldStyle.color,
                        action.oldStyle.size
                    );
                }
                break;
            case 'moveCurve':
                // 曲線の移動を元に戻す
                if (action.id !== undefined && this.curveManager.curves[action.id]) {
                    const curve = this.curveManager.curves[action.id];
                    // 点列を元に戻す
                    curve.originalPoints = [...action.oldPoints];
                    // 近似・再描画
                    const approximationResult = this.curveManager.getCurveApproximationResult(
                        curve.type,
                        action.oldPoints,
                        {}
                    );
                    if (approximationResult && approximationResult.success) {
                        curve.latexEquations = approximationResult.latexEquations;
                        this.graphCalculator.updateCurve(curve.graphCurve.id, {
                            path: approximationResult.svgPath
                        });
                        this.graphCalculator.removeAllPoints(curve.graphCurve.id);
                        if (approximationResult.knots && Array.isArray(approximationResult.knots)) {
                            curve.knotPoints = [];
                            approximationResult.knots.forEach(knot => {
                                const point = this.graphCalculator.addPoint(curve.graphCurve.id, knot[0], knot[1], {
                                    // color: curve.color,
                                    // size: 10,
                                    // shape: 'hollowCircle'
                                });
                                if (point) {
                                    curve.knotPoints.push({
                                        x: knot[0],
                                        y: knot[1],
                                        point: point
                                    });
                                }
                            });
                        }
                        this.curveManager.updateEquationsContainer(action.id);
                    }
                }
                break;
        }

        // IDを再割り当て
        this.curveManager.curves.forEach((curve, index) => {
            if (curve) {
                curve.id = index;
            }
        });

        // 現在選択中の曲線がある場合、強調表示をリセット
        if (currentSelectedId !== null && currentSelectedId < this.curveManager.curves.length) {
            this.curveManager.delEmphasisCurve();
            this.curveManager.emphasisCurve(currentSelectedId);
        }

        this.curveManager.updateCurveList();
        this.curveManager.redrawCurves();
        
        // SaveGraphManagerの状態を更新
        if (this.saveGraphManager) {
            this.saveGraphManager.updateSaveButtonState();
        }
    }

    /**
     * やり直し処理
     */
    redo() {
        const action = this.getRedoAction();
        if (!action) return;

        // 現在選択中の曲線IDを記録
        const currentSelectedId = this.uiManager.settings.selectCurveId;

        switch (action.type) {
            case 'add':
                // action.curve.idが有効かチェック
                if (action.curve && action.curve.id !== undefined) {
                    // 配列に追加
                    this.curveManager.curves.splice(action.curve.id, 0, action.curve);

                    // グラフ計算機のSVGに曲線を追加
                    if (this.graphCalculator && this.curveManager.g && action.curve.path) {
                        this.curveManager.g.node().appendChild(action.curve.path.node());

                        // GraphCalculatorに曲線を復元
                        if (action.curve.graphCurve || action.graphCurveData) {
                            const curveData = action.graphCurveData ||
                                (action.curve.graphCurve ? {
                                    id: action.curve.graphCurve.id,
                                    originalData: action.curve.graphCurve.originalData
                                } : null);

                            if (curveData) {
                                const newCurve = this.graphCalculator.addCurve(curveData.originalData, {
                                    id: curveData.id,
                                    color: action.curve.color,
                                    width: action.curve.size
                                });

                                // 復元したGraphCalculator曲線参照を更新
                                action.curve.graphCurve = newCurve;
                            }
                        }

                        // 詳細表示状態を復元
                        if (action.isHidden !== undefined) {
                            this.curveManager.setCurveVisibility(action.curve.id, !action.isHidden);
                        }
                    }

                    if (action.graphCurveData && Array.isArray(action.graphCurveData.points)) {
                        action.graphCurveData.points.forEach(point => {
                            if (this.graphCalculator) {
                                this.graphCalculator.addPoint(
                                    action.curve.graphCurve.id,
                                    point.x,
                                    point.y,
                                    {
                                        fill: point.properties.fill,
                                        color: point.color,
                                        size: point.properties.size,
                                        shape: point.shapeType,
                                        stroke: point.properties.stroke,
                                        strokeWidth: point.properties.strokeWidth,
                                    }
                                );
                            }
                        });
                    }

                    this.uiManager.settings.nextCurveId++;
                }
                break;

            case 'delete':
                // action.indexが有効かチェック
                if (action.index !== undefined &&
                    action.index >= 0 &&
                    action.index < this.curveManager.curves.length) {

                    // 曲線を削除
                    if (action.curve && action.curve.path) {
                        action.curve.path.remove();
                    }

                    this.curveManager.curves.splice(action.index, 1);

                    // GraphCalculatorからも曲線を削除
                    if (action.curve && action.curve.graphCurve) {
                        this.graphCalculator.removeCurve(action.curve.graphCurve.id);
                    }

                    this.uiManager.settings.nextCurveId = this.curveManager.curves.length;
                }
                break;

            case 'color':
                // action.idが有効かチェック
                if (action.id !== undefined &&
                    action.id >= 0 &&
                    action.id < this.curveManager.curves.length &&
                    this.curveManager.curves[action.id]) {

                    // 色を新しい色に更新
                    this.curveManager.curves[action.id].color = action.newColor;
                    this.curveManager.curves[action.id].path.attr('stroke', action.newColor);

                    // 選択中の曲線なら内部状態も更新
                    if (this.uiManager.settings.selectCurveId === action.id) {
                        this.uiManager.settings.currentColor = action.newColor;

                        // // PenToolManagerの表示も更新
                        // if (this.penToolManager) {
                        //   this.penToolManager.updateFromCurveSelection(action.newColor, this.curveManager.curves[action.id].size);
                        // }
                    }

                    // GraphCalculatorの曲線も更新
                    if (this.curveManager.curves[action.id].graphCurve) {
                        const graphCalcCurve = this.curveManager.curves[action.id].graphCurve;
                        this.graphCalculator.updateCurve(action.id, { color: action.newColor });
                    }

                    // リスト内の色表示も更新
                    const colorIcon = document.querySelector(`.color-icon[data-id="${action.id}"]`);
                    if (colorIcon) {
                        colorIcon.style.backgroundColor = action.newColor;
                    }
                }
                break;

            case 'size':
                // action.idが有効かチェック
                if (action.id !== undefined &&
                    action.id >= 0 &&
                    action.id < this.curveManager.curves.length &&
                    this.curveManager.curves[action.id]) {

                    // サイズを新しいサイズに更新
                    this.curveManager.curves[action.id].size = action.newSize;
                    this.curveManager.curves[action.id].path.attr('stroke-width', action.newSize);

                    // 選択中の曲線なら内部状態も更新
                    if (this.uiManager.settings.selectCurveId === action.id) {
                        this.uiManager.settings.currentSize = action.newSize;

                        // PenToolManagerの表示も更新
                        if (this.penToolManager) {
                            this.penToolManager.updateFromCurveSelection(this.uiManager.settings.currentColor, action.newSize);
                        }
                    }

                    // GraphCalculatorの曲線も更新
                    if (this.curveManager.curves[action.id].graphCurve) {
                        const graphCalcCurve = this.curveManager.curves[action.id].graphCurve;
                        this.graphCalculator.updateCurve(graphCalcCurve.id, { width: action.newSize });
                    }

                    // リスト内のサイズスライダーも更新
                    const sizeSlider = document.querySelector(`.curve-item[data-id="${action.id}"] .size-slider`);
                    if (sizeSlider) {
                        sizeSlider.value = action.newSize;
                    }
                }
                break;

            case 'clear':
                if (this.graphCalculator && this.curveManager.g) {
                    this.curveManager.g.selectAll('*').remove();

                    // GraphCalculatorの曲線もすべて削除
                    this.curveManager.curves.forEach(curve => {
                        if (curve && curve.graphCurve) {
                            this.graphCalculator.removeCurve(curve.graphCurve.id);
                        }
                    });
                }

                this.curveManager.curves = [];
                break;

            case 'reorder':
                this.curveManager.reorderCurves(action.fromId, action.toId);
                // 重複を避けるために削除
                this.redoStack.pop();
                break;

            case 'toggleDetails':
                // 詳細表示状態を新しい状態に更新
                this.curveManager.setCurveDetailState(action.id, action.newDetailShown);
                break;

            case 'toggleVisibility':
                // 表示/非表示状態を新しい状態に更新
                this.curveManager.setCurveVisibility(action.id, !action.newHidden);

                // 色アイコンのクラスも更新
                const colorIcon = document.querySelector(`.color-icon[data-id="${action.id}"]`);
                if (colorIcon) {
                    if (action.newHidden) {
                        colorIcon.classList.add('hidden-curve');
                    } else {
                        colorIcon.classList.remove('hidden-curve');
                    }
                }
                break;

            case 'defaultColor':
                // 曲線選択なしの場合のデフォルト色変更
                this.uiManager.settings.currentColor = action.newColor;
                this.uiManager.settings.prevColor = action.newColor;

                // カラーディスプレイを更新
                this.penToolManager.setColor(action.newColor);
                // const colorDisplay = document.getElementById('color-display');
                // if (colorDisplay) {
                //   colorDisplay.style.backgroundColor = action.newColor;
                // }

                // PenToolManagerの表示も更新（存在する場合）
                if (this.penToolManager) {
                    this.penToolManager.updateFromCurveSelection(action.newColor, this.settings.currentSize);
                }
                break;

            case 'styleChange':
                if (action.id !== undefined &&
                    action.id >= 0 &&
                    action.id < this.curveManager.curves.length) {

                    // 曲線のスタイルを新しい状態に更新
                    const curve = this.curveManager.curves[action.id];
                    curve.color = action.newStyle.color;
                    curve.size = action.newStyle.size;

                    // D3パスを更新
                    curve.path.attr('stroke', action.newStyle.color)
                        .attr('stroke-width', action.newStyle.size);

                    // GraphCalculatorの曲線も更新
                    if (curve.graphCurve) {
                        this.graphCalculator.updateCurve(curve.graphCurve.id, {
                            color: action.newStyle.color,
                            width: action.newStyle.size
                        });
                    }

                    // 現在選択中の曲線なら設定も更新
                    if (this.uiManager.settings.selectCurveId === action.id) {
                        this.uiManager.settings.currentColor = action.newStyle.color;
                        this.uiManager.settings.currentSize = action.newStyle.size;

                        // PenToolManagerの表示も更新
                        if (this.penToolManager) {
                            this.penToolManager.updateFromCurveSelection(
                                action.newStyle.color,
                                action.newStyle.size
                            );
                        }
                    }
                }
                break;

            case 'defaultStyleChange':
                // デフォルトスタイルを新しい状態に更新
                this.uiManager.settings.currentColor = action.newStyle.color;
                this.uiManager.settings.currentSize = action.newStyle.size;
                this.uiManager.settings.prevColor = action.newStyle.color;
                this.uiManager.settings.prevSize = action.newStyle.size;

                // UI表示を更新
                if (this.penToolManager) {
                    this.penToolManager.updateFromCurveSelection(
                        action.newStyle.color,
                        action.newStyle.size
                    );
                }
                break;
            case 'moveCurve':
                // 曲線の移動をやり直す
                if (action.id !== undefined && this.curveManager.curves[action.id]) {
                    const curve = this.curveManager.curves[action.id];
                    // 点列を移動後に
                    curve.originalPoints = [...action.newPoints];
                    // 近似・再描画
                    const approximationResult = this.curveManager.getCurveApproximationResult(
                        curve.type,
                        action.newPoints,
                        {}
                    );
                    if (approximationResult && approximationResult.success) {
                        curve.latexEquations = approximationResult.latexEquations;
                        this.graphCalculator.updateCurve(curve.graphCurve.id, {
                            path: approximationResult.svgPath
                        });
                        this.graphCalculator.removeAllPoints(curve.graphCurve.id);
                        if (approximationResult.knots && Array.isArray(approximationResult.knots)) {
                            curve.knotPoints = [];
                            approximationResult.knots.forEach(knot => {
                                const point = this.graphCalculator.addPoint(curve.graphCurve.id, knot[0], knot[1], {
                                    color: curve.color,
                                    size: 10,
                                    shape: 'hollowCircle'
                                });
                                if (point) {
                                    curve.knotPoints.push({
                                        x: knot[0],
                                        y: knot[1],
                                        point: point
                                    });
                                }
                            });
                        }
                        this.curveManager.updateEquationsContainer(action.id);
                    }
                }
                break;
        }

        // IDを再割り当て
        this.curveManager.curves.forEach((curve, index) => {
            if (curve) {
                curve.id = index;
            }
        });

        // 現在選択中の曲線がある場合、強調表示をリセット
        if (currentSelectedId !== null && currentSelectedId < this.curveManager.curves.length) {
            this.curveManager.delEmphasisCurve();
            this.curveManager.emphasisCurve(currentSelectedId);
        }

        this.curveManager.updateCurveList();
        this.curveManager.redrawCurves();
        
        // SaveGraphManagerの状態を更新
        if (this.saveGraphManager) {
            this.saveGraphManager.updateSaveButtonState();
        }
    }
}
