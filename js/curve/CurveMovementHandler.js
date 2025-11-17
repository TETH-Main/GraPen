import { signedFixedString, applyDeltaToFormulaNumeric } from '../util/NumberUtil.js';
import { EquationBuilder } from '../util/EquationBuilder.js';
export class CurveMovementHandler {
    /**
     * @param {CurveManager} curveManager
     * @param {Object} settings - 共通設定（selectCurveIdなどを参照）
     */
    constructor(curveManager, settings, graphCalculator) {
        this.curveManager = curveManager;
        this.graphCalculator = graphCalculator;
        this.settings = settings;
        this.enabled = false;

        // ドラッグ操作の状態を管理
        this.dragState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            startDomainX: 0,
            startDomainY: 0,
            curveId: null,
            originalOpacity: 1,
            dummyCurve: null,
            guidelines: null,
            displacementText: null,
            penToolState: 'pen'
        };

        // マウスイベントハンドラをバインド
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handlePointerCancel = this.handlePointerCancel.bind(this);

        // UIManager参照（後で設定される）
        this.uiManager = null;
        // 常にイベントリスナーをセットアップしておく（トグルの有効/無効に関係なく移動を可能にする）
        // setupEventListeners は graphCalculator の存在をチェックするため安全に呼べる
        try {
            this.setupEventListeners();
        } catch (e) {
        }
        // 動作フローは finalizeTranslateMove 側の処理で最終決定されます。
    }

    /**
     * UIManagerを設定
     * @param {UIManager} uiManager
     */
    setUIManager(uiManager) {
        this.uiManager = uiManager;
    }


    /**
     * アクティブツールの設定
     */
    setActiveTool(tool) {
        const graphCalculator = this.curveManager.graphCalculator;
        const svg = d3.select(graphCalculator.container).select('svg');

        if (tool === 'pen') {
            // ペンツールの場合は描画を優先するためキャンバス移動を無効化
            graphCalculator.enableZoom(true);
            graphCalculator.enableCanvas(false);
            svg.style('cursor', 'crosshair');

        } else if (tool === 'cursor') {
            // カーソルツールの場合はズームとキャンバス移動を有効化
            graphCalculator.enableZoom(true);
            graphCalculator.enableCanvas(true);
            svg.style('cursor', 'move');
        }

        svg.style('cursor', 'move');

    }

    /**
     * 移動モードが有効かどうか
     */
    isMovementEnabled() {
        return this.enabled;
    }

    /**
     * 選択中の曲線オブジェクトを取得
     * @returns {Object|null}
     */
    getSelectedCurve() {
        const id = this.settings.selectCurveId;
        if (id === null || id === undefined) return null;
        return this.curveManager.curves[id] || null;
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        if (!this.curveManager.graphCalculator) return;

        const svg = this.curveManager.graphCalculator.getSvg();
        d3.select(svg).on('pointerdown.curveMove', this.handleMouseDown);
        d3.select(document).on('pointermove.curveMove', this.handleMouseMove);
        d3.select(document).on('pointerup.curveMove', this.handleMouseUp);
        d3.select(document).on('pointercancel.curveMove', this.handlePointerCancel);

        const paths = svg.querySelectorAll('path');
        paths.forEach(path => {
            path.style.cursor = 'grab';
        });

        d3.select(svg).on('pointermove.cursorHover', (event) => this._onPointerMoveForCursor(event));
    }

    /**
     * ホバー時に対象の曲線が移動可能かどうかに応じてカーソルを更新します。
     * @param {PointerEvent} event
     */
    _onPointerMoveForCursor(event) {
        try {
            const graphCalculator = this.curveManager.graphCalculator;
            if (!graphCalculator) return;
            const svg = graphCalculator.getSvg();

            // 現在ドラッグ中であればカーソルは別で管理されているため何もしない
            if (this.dragState && this.dragState.isDragging) return;

            // 現在のツール状態を取得
            const penState = this.dragState ? this.dragState.penToolState : 'cursor';

            // ポインタ下の要素を探索（event.target が内部要素である場合がある）
            let target = event.target;
            let graphCurveId = null;
            for (let i = 0; i < 4 && target; i++) {
                if (target.dataset && target.dataset.curveId) {
                    graphCurveId = target.dataset.curveId;
                    break;
                }
                if (target.getAttribute && target.getAttribute('data-curve-id')) {
                    graphCurveId = target.getAttribute('data-curve-id');
                    break;
                }
                // SVGルートに達したら探索を止める
                if (target === svg) break;
                target = target.parentElement;
            }

            // カーソルを決定する
            if (graphCurveId && penState === 'cursor') {
                const curveId = this.curveManager.getCurveIdByGraphCurveId(graphCurveId);
                if (curveId !== null && this.curveManager.curves[curveId] && !this.curveManager.curves[curveId].locked) {
                    svg.style.cursor = 'grab';
                    return;
                }
            }

            // フォールバック: penState に応じてカーソルを設定（描画中の UIManager の crosshair/move を上書きしない）
            if (penState === 'pen' || penState === 'eraser') {
                svg.style.cursor = 'crosshair';
            } else if (penState === 'cursor') {
                svg.style.cursor = 'move';
            }
        } catch (e) {
            // 何もしない
        }
    }

    /**
     * イベントリスナーの解除
     */
    removeEventListeners() {
        if (!this.curveManager.graphCalculator) return;

        const svg = this.curveManager.graphCalculator.getSvg();
        d3.select(svg).on('pointerdown.curveMove', null);
        d3.select(document).on('pointermove.curveMove', null);
        d3.select(document).on('pointerup.curveMove', null);
        d3.select(document).on('pointercancel.curveMove', null);

        this.setActiveTool(this.dragState.penToolState);

        const paths = svg.querySelectorAll('path');
        paths.forEach(path => {
            path.style.cursor = '';
        });

        if (this.dragState.isDragging) {
            this.endDrag(true);
        }
    }

    /**
     * UIManagerのペンツールの状態をセット
     */
    setPenToolState(state) {
        this.dragState.penToolState = state;
    }

    /**
     * マウスダウンイベントハンドラ
     * @param {MouseEvent} event 
     */
    handleMouseDown(event) {
        // グローバルトグルに関係なく移動を許可する（進行中のドラッグのみで制御）
        if (this.dragState.isDragging) return;

        // カーソルモード時のみ許可
        if (this.dragState.penToolState !== 'cursor') return;

        // クリックされた要素またはその親要素からヒットエリアを検索
        let target = event.target;
        let hitArea = null;

        // クリックされた要素から最大3階層上まで辿って曲線またはヒットエリアを検索
        for (let i = 0; i < 3; i++) {
            if (!target) break;

            // 曲線ヒットエリアまたはパス要素かチェック
            if (target.classList &&
                (target.classList.contains('curve-hit-area') ||
                    target.classList.contains('curve-path'))) {
                hitArea = target;
                break;
            }

            // 親要素へ
            target = target.parentElement;
        }

        // ヒットエリアが見つかった場合
        if (hitArea) {
            const graphCurveId = hitArea.getAttribute('data-curve-id');
            if (graphCurveId) {
                // カーブマネージャーの対応する曲線IDを取得
                const curveId = this.curveManager.getCurveIdByGraphCurveId(graphCurveId);
                if (curveId !== null) {
                    // 曲線をドラッグ開始
                    this.startDrag(event, curveId);
                }
            }
        } else {
            // 曲線以外（キャンバス背景）をクリックした場合は選択解除
            window.GraPen.deselectCurve();
        }
    }

    /**
     * マウス移動イベントハンドラ
     * @param {MouseEvent} event 
     */
    handleMouseMove(event) {
        if (!this.dragState.isDragging) return;

        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

        if (event && event.cancelable) {
            event.preventDefault();
        }

        // マウスのSVG座標を取得
        const svg = graphCalculator.getSvg();
        const svgRect = svg.getBoundingClientRect();
        const mouseX = event.clientX - svgRect.left;
        const mouseY = event.clientY - svgRect.top;

        // マウス位置のドメイン座標を取得
        const mouseDomain = graphCalculator.screenToDomain(mouseX, mouseY);

        // 移動量を計算（ドメイン座標）
        const deltaX = mouseDomain.x - this.dragState.startDomainX;
        const deltaY = mouseDomain.y - this.dragState.startDomainY;

        // ダミー曲線を移動
        this.updateDummyCurve(deltaX, deltaY);

        // ガイドラインと移動量表示を更新
        this.updateGuidelines(mouseX, mouseY, deltaX, deltaY);
    }

    /**
     * マウスアップイベントハンドラ
     * @param {MouseEvent} event 
     */
    handleMouseUp(event) {
        if (!this.dragState.isDragging) return;

        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

        // マウスのSVG座標を取得
        const svg = graphCalculator.getSvg();
        const svgRect = svg.getBoundingClientRect();
        const mouseX = event.clientX - svgRect.left;
        const mouseY = event.clientY - svgRect.top;
        // 何もしない
        // マウス位置のドメイン座標を取得
        const mouseDomain = graphCalculator.screenToDomain(mouseX, mouseY);

        // 移動量を計算（ドメイン座標）
        const deltaX = mouseDomain.x - this.dragState.startDomainX;
        const deltaY = mouseDomain.y - this.dragState.startDomainY;

        // 曲線を移動して更新
        this.moveCurve(deltaX, deltaY);

        // ドラッグ終了
        this.endDrag();
    }

    /**
     * ポインターキャンセルイベントハンドラ
     * @param {PointerEvent} event
     */
    handlePointerCancel(event) {
        if (!this.dragState.isDragging) return;

        if (event && event.cancelable) {
            event.preventDefault();
        }

        this.endDrag(true);
    }

    /**
     * ドラッグ開始
     * @param {MouseEvent} event マウスイベント
     * @param {number} curveId 曲線ID
     */
    startDrag(event, curveId) {
        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

        // 曲線オブジェクトを取得
        const curve = this.curveManager.curves[curveId];
        if (!curve) return;

        // 個別ロックが有効な場合は移動を開始しない
        if (curve.locked) {
            return;
        }

        if (event && event.cancelable) {
            event.preventDefault();
        }

        // ドラッグ開始時は既に選択されている場合は選択状態を維持する
        if (this.curveManager.settings.selectCurveId !== curveId) {
            this.curveManager.selectCurve(d3.select(`.curve-item:nth-child(${curveId + 1})`), curveId);
        }

        // マウスのSVG座標を取得
        const svg = graphCalculator.getSvg();
        const svgRect = svg.getBoundingClientRect();
        const mouseX = event.clientX - svgRect.left;
        const mouseY = event.clientY - svgRect.top;

        // マウス位置のドメイン座標を取得
        const mouseDomain = graphCalculator.screenToDomain(mouseX, mouseY);

        // ドラッグ状態を初期化
        this.dragState.isDragging = true;
        this.dragState.startX = mouseX;
        this.dragState.startY = mouseY;
        this.dragState.startDomainX = mouseDomain.x;
        this.dragState.startDomainY = mouseDomain.y;
        this.dragState.curveId = curveId;

        // 元の曲線を半透明にする
        const graphCurve = graphCalculator.getCurve(curve.graphCurve.id);
        if (graphCurve && graphCurve.path) {
            this.dragState.originalOpacity = graphCurve.path.getAttribute('stroke-opacity') || 1;
            graphCalculator.updateCurve(curve.graphCurve.id, { opacity: 0.3 });
        }

        // 強調表示も半透明にする
        if (this.curveManager.emphasisGraphCurveId) {
            const emphasisCurve = graphCalculator.getCurve(this.curveManager.emphasisGraphCurveId);
            if (emphasisCurve) {
                graphCalculator.updateCurve(this.curveManager.emphasisGraphCurveId, { opacity: 0 });
            }
        }

        graphCalculator.enableZoom(false);
        graphCalculator.enableCanvas(false);

        // ダミー曲線を作成
        this.createDummyCurve(curve);

        // ガイドラインと移動量表示を作成
        this.createGuidelines(mouseX, mouseY);

        // カーソルスタイル変更
        svg.style.cursor = 'grabbing';
    }

    /**
     * ダミー曲線の作成
     * @param {Object} curve 元の曲線オブジェクト
     */
    createDummyCurve(curve) {
        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator || !curve.graphCurve) return;

        // 元の曲線からパスデータを取得
        const originalCurve = graphCalculator.getCurve(curve.graphCurve.id);
        if (!originalCurve || !originalCurve.path) return;

        const pathData = originalCurve.path.getAttribute('d');

        // ダミー曲線を追加（元の曲線と同じデータで色は同じだが半透明）
        const dummyId = `dummy-${curve.graphCurve.id}`;
        const dummyCurve = graphCalculator.addCurve(pathData, {
            id: dummyId,
            color: curve.color,
            width: curve.size,
            opacity: 0.8
        });

        this.dragState.dummyCurve = dummyCurve;

        // base transform をコピーしておく（連続移動でのジャンプを防ぐため）
        try {
            const svgRoot = graphCalculator.svg;
            const originalGroup = svgRoot.querySelector(`g[data-curve-base-id="${curve.graphCurve.id}"]`);
            const dummyGroup = svgRoot.querySelector(`g[data-curve-base-id="dummy-${curve.graphCurve.id}"]`);
            const baseTransform = originalGroup ? (originalGroup.getAttribute('transform') || '') : '';
            if (dummyGroup && baseTransform) {
                dummyGroup.setAttribute('transform', baseTransform);
            }
            // dragState に保存して update 時に合成する
            this.dragState.dummyBaseTransform = baseTransform;
            this.dragState.curveBaseTransform = baseTransform;
        } catch (e) {
            this.dragState.dummyBaseTransform = '';
            this.dragState.curveBaseTransform = '';
        }



        return dummyCurve;
    }

    /**
     * ガイドラインと移動量表示の作成
     * @param {number} startX 開始点のX座標（スクリーン座標）
     * @param {number} startY 開始点のY座標（スクリーン座標）
     */
    createGuidelines(startX, startY) {
        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

        const svg = graphCalculator.getSvg();
        const ns = "http://www.w3.org/2000/svg";

        // ガイドラインのグループを作成
        const guidelinesGroup = document.createElementNS(ns, "g");
        guidelinesGroup.setAttribute("class", "movement-guidelines");

        // X軸方向のガイドライン（青）
        const xLine = document.createElementNS(ns, "line");
        xLine.setAttribute("x1", startX);
        xLine.setAttribute("y1", startY);
        xLine.setAttribute("x2", startX);
        xLine.setAttribute("y2", startY);
        xLine.setAttribute("stroke", "#1E88E5");
        xLine.setAttribute("stroke-width", "1");
        xLine.setAttribute("stroke-dasharray", "4,4");
        xLine.setAttribute("class", "x-guideline");

        // Y軸方向のガイドライン（赤）
        const yLine = document.createElementNS(ns, "line");
        yLine.setAttribute("x1", startX);
        yLine.setAttribute("y1", startY);
        yLine.setAttribute("x2", startX);
        yLine.setAttribute("y2", startY);
        yLine.setAttribute("stroke", "#E53935");
        yLine.setAttribute("stroke-width", "1");
        yLine.setAttribute("stroke-dasharray", "4,4");
        yLine.setAttribute("class", "y-guideline");

        // 移動量表示テキスト
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", startX);
        text.setAttribute("y", startY);
        text.setAttribute("dy", "-10");
        text.setAttribute("class", "displacement-text");
        text.textContent = "(0, 0)";

        // X軸方向の移動量ラベル
        const xText = document.createElementNS(ns, "text");
        xText.setAttribute("class", "x-displacement-text");
        xText.textContent = "0";

        // Y軸方向の移動量ラベル
        const yText = document.createElementNS(ns, "text");
        yText.setAttribute("class", "y-displacement-text");
        yText.textContent = "0";

        // グループに要素を追加
        guidelinesGroup.appendChild(xLine);
        guidelinesGroup.appendChild(yLine);
        guidelinesGroup.appendChild(text);
        guidelinesGroup.appendChild(xText);
        guidelinesGroup.appendChild(yText);

        // SVGに追加
        svg.appendChild(guidelinesGroup);

        // 状態として保存
        this.dragState.guidelines = guidelinesGroup;
        this.dragState.displacementText = {
            main: text,
            x: xText,
            y: yText
        };
    }

    /**
     * ダミー曲線の更新
     * @param {number} deltaX X方向の移動量（ドメイン座標）
     * @param {number} deltaY Y方向の移動量（ドメイン座標）
     */
    updateDummyCurve(deltaX, deltaY) {
        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator || !this.dragState.dummyCurve) return;

        const curveId = this.dragState.curveId;
        const curve = this.curveManager.curves[curveId];
        if (!curve) return;

        // ダミー曲線のgグループを取得（data-curve-base-id="dummy-..."）
        const dummyGroup = graphCalculator.svg.querySelector(
            `g[data-curve-base-id="dummy-${curve.graphCurve.id}"]`
        );
        if (dummyGroup) {
            const base = this.dragState.dummyBaseTransform || '';
            const translate = `translate(${deltaX},${deltaY})`;
            dummyGroup.setAttribute('transform', `${base} ${translate}`.trim());
        }

        // 数式の更新（リアルタイム表示用）

        if (curve.latexEquations && Array.isArray(curve.latexEquations)) {
            const movedEquations = curve.latexEquations.map(equations => (
                this.getParallelMovedEquations(equations.type, equations, deltaX, deltaY)
            ));
            this.curveManager.updateEquationsContainer(curveId, movedEquations);
        }
    }

    /**
     * ガイドラインと移動量表示の更新
     * @param {number} mouseX 現在のマウスX座標（スクリーン座標）
     * @param {number} mouseY 現在のマウスY座標（スクリーン座標）
     * @param {number} deltaX X方向の移動量（ドメイン座標）
     * @param {number} deltaY Y方向の移動量（ドメイン座標）
     */
    updateGuidelines(mouseX, mouseY, deltaX, deltaY) {
        if (!this.dragState.guidelines || !this.dragState.displacementText) return;

        // delta 表示は signedFixedString を使う（存在しない場合は toFixed フォールバック）

        const startX = this.dragState.startX;
        const startY = this.dragState.startY;

        // X軸方向のガイドライン
        const xLine = this.dragState.guidelines.querySelector('.x-guideline');
        xLine.setAttribute("x1", startX);
        xLine.setAttribute("y1", startY);
        xLine.setAttribute("x2", mouseX);
        xLine.setAttribute("y2", startY);

        // Y軸方向のガイドライン
        const yLine = this.dragState.guidelines.querySelector('.y-guideline');
        yLine.setAttribute("x1", mouseX);
        yLine.setAttribute("y1", startY);
        yLine.setAttribute("x2", mouseX);
        yLine.setAttribute("y2", mouseY);

        // 移動量表示テキスト
        this.dragState.displacementText.main.setAttribute("x", mouseX);
        this.dragState.displacementText.main.setAttribute("y", mouseY);
        this.dragState.displacementText.main.textContent =
            `(${deltaX.toFixed(2)}, ${deltaY.toFixed(2)})`;

        // X方向移動量
        const xMidX = (startX + mouseX) / 2;
        this.dragState.displacementText.x.setAttribute("x", xMidX);
        this.dragState.displacementText.x.setAttribute("y", startY - 10);
        this.dragState.displacementText.x.textContent = `Δx: ${(typeof signedFixedString === 'function' ? signedFixedString(deltaX, 3) : String(deltaX.toFixed(3)))}`;

        // Y方向移動量
        const yMidY = (startY + mouseY) / 2;
        this.dragState.displacementText.y.setAttribute("x", mouseX + 10);
        this.dragState.displacementText.y.setAttribute("y", yMidY);
        this.dragState.displacementText.y.textContent = `Δy: ${(typeof signedFixedString === 'function' ? signedFixedString(deltaY, 3) : String(deltaY.toFixed(3)))}`;
    }

    /**
     * 曲線を移動して更新
     * @param {number} deltaX X方向の移動量（ドメイン座標）
     * @param {number} deltaY Y方向の移動量（ドメイン座標）
     */
    moveCurve(deltaX, deltaY) {
        if (deltaX === 0 && deltaY === 0) return;
        const curveId = this.dragState.curveId;
        const curve = this.curveManager.curves[curveId];
        if (!curve || !curve.originalPoints) return;

        // 移動前の点列を保存（履歴用）
        const oldPoints = [...curve.originalPoints];

        // 点列を移動（内部データとしては単純にオフセットする）
        const movedPoints = oldPoints.map(point => [point[0] + deltaX, point[1] + deltaY]);

        // デフォルト: 内部データをデルタで更新し、表示は g の transform で行う（再近似は行わない）
        const graphCalculator = this.curveManager.graphCalculator;
        curve.originalPoints = movedPoints;
        this.dragState.lastDelta = { dx: deltaX, dy: deltaY };

        // 視覚フィードバックのため、グループに transform を適用する
        const svgRoot = graphCalculator && graphCalculator.svg;
        if (svgRoot && curve.graphCurve) {
            const group = svgRoot.querySelector(`g[data-curve-base-id="${curve.graphCurve.id}"]`);
            const translate = `translate(${deltaX},${deltaY})`;
            if (group) {
                const baseCurve = this.dragState.curveBaseTransform || (group.getAttribute('transform') || '');
                group.setAttribute('transform', `${baseCurve} ${translate}`.trim());
            }
            const emphasisGroup = svgRoot.querySelector(`g[data-curve-base-id="emphasis-${curve.graphCurve.id}"]`);
            if (emphasisGroup) {
                const baseEm = emphasisGroup.getAttribute('transform') || '';
                emphasisGroup.setAttribute('transform', `${baseEm} ${translate}`.trim());
            }
        }

        if (curve.knotPoints && Array.isArray(curve.knotPoints)) {
            curve.knotPoints = curve.knotPoints.map(k => ({ x: k.x + deltaX, y: k.y + deltaY, point: k.point }));
        }

        if (curve.latexEquations && Array.isArray(curve.latexEquations)) {
            const movedEquations = curve.latexEquations.map(equations => (
                this.getParallelMovedEquations(equations.type, equations, deltaX, deltaY)
            ));
            this.curveManager.updateEquationsContainer(curveId, movedEquations);
        } else {
            this.curveManager.updateEquationsContainer(curveId);
        }

        this.recordMoveHistory(curveId, deltaX, deltaY);

    }

    /**
     * 履歴に曲線移動を記録（delta-only）
     * @param {number} curveId 曲線ID
     * @param {number} deltaX X方向の移動量
     * @param {number} deltaY Y方向の移動量
     */
    recordMoveHistory(curveId, deltaX, deltaY) {
        if (!this.curveManager.historyManager) return;

        const action = {
            type: 'moveCurve',
            id: curveId,
            deltaX: deltaX,
            deltaY: deltaY
        };

        this.curveManager.historyManager.addAction(action);
    }

    /**
     * ドラッグ終了
     * @param {boolean} cancel キャンセルするかどうか
     */
    endDrag(cancel = false) {
        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

        if (!cancel && this.dragState && this.dragState.lastDelta && this.dragState.curveId !== null) {
            try {
                this.finalizeTranslateMove(this.dragState.curveId);
            } catch (err) {
                console.warn('finalizeTranslateMove failed', err);
            }
        }

        // ダミー曲線を削除
        if (this.dragState.dummyCurve) {
            graphCalculator.removeCurve(this.dragState.dummyCurve.id);
            this.dragState.dummyCurve = null;
        }

        // ガイドラインを削除
        if (this.dragState.guidelines) {
            this.dragState.guidelines.remove();
            this.dragState.guidelines = null;
            this.dragState.displacementText = null;
        }

        // 元の曲線の透明度を元に戻す
        if (this.dragState.curveId !== null) {
            const curve = this.curveManager.curves[this.dragState.curveId];
            if (curve && curve.graphCurve) {
                graphCalculator.updateCurve(curve.graphCurve.id, { opacity: 1 });
            }
        }

        // 強調表示の透明度を元に戻す
        if (this.curveManager.emphasisGraphCurveId) {
            graphCalculator.updateCurve(this.curveManager.emphasisGraphCurveId, { opacity: 0.4 });
        }

        // ツール設定を復元
        this.setActiveTool(this.dragState.penToolState);

        // ドラッグ状態をリセット
        this.dragState.isDragging = false;
        this.dragState.curveId = null;
    }

    /**
     * 平行移動用の数式オブジェクトを返す
     * @param {String} type - 曲線のタイプ
     * @param {String} equation - 数式
     * @param {Number} deltaX - X方向の移動量
     * @param {Number} deltaY - Y方向の移動量
     * @returns {Object} - 平行移動後の数式
     */
    getParallelMovedEquations(type, equation, deltaX, deltaY) {
        const stripSpan = (value) => {
            if (typeof value !== 'string') return '';
            return value.replace(/<span.*?>.*?<\/span>/g, '');
        };

        const df = (v) => (typeof signedFixedString === 'function')
            ? signedFixedString(v, 3)
            : String(Number(v || 0).toFixed(3));

        const axis = equation && equation.domainAxis ? equation.domainAxis : null;
        let deltaForDomain = 0;
        if (type === 'vertical') {
            deltaForDomain = deltaY;
        } else if (axis === 'x') {
            deltaForDomain = deltaX;
        } else if (axis === 'y') {
            deltaForDomain = deltaY;
        }

        const startBase = stripSpan(equation && equation.domain && equation.domain.start);
        const endBase = stripSpan(equation && equation.domain && equation.domain.end);

        let startText = startBase;
        let endText = endBase;

        if (startBase) {
            const color = (type === 'vertical' || axis === 'y') ? '#E53935' : '#1E88E5';
            startText = `${startBase} <span style="color: ${color};">${df(deltaForDomain)}</span>`;
        }
        if (endBase) {
            const color = (type === 'vertical' || axis === 'y') ? '#E53935' : '#1E88E5';
            endText = `${endBase} <span style="color: ${color};">${df(deltaForDomain)}</span>`;
        }

        return {
            domain: {
                start: startText,
                end: endText
            },
            formula: this.getParallelMovedFormula(type, equation, deltaX, deltaY),
            type: type
        };
    }

    /**
     * 平行移動用の数式を返す
     * @param {String} type - 曲線のタイプ
     * @param {Object|String} equationOrFormula - 数式オブジェクトまたは文字列
     * @param {Number} deltaX - X方向の移動量
     * @param {Number} deltaY - Y方向の移動量
     * @returns {String} - 平行移動後の数式
     */
    getParallelMovedFormula(type, equationOrFormula, deltaX, deltaY) {
        const equationObject = (equationOrFormula && typeof equationOrFormula === 'object') ? equationOrFormula : null;
        const baseFormula = equationObject ? (equationObject.latex || equationObject.formula || '') : (equationOrFormula || '');
        const cleaned = (baseFormula || '').replace(/\\textcolor\{#[0-9A-Fa-f]{6}\}\{[^}]*\}/g, "");

        const decimals = (equationObject && Number.isFinite(equationObject.precision))
            ? equationObject.precision
            : 3;

        const formatSignedDelta = (value) => {
            if (!Number.isFinite(value)) {
                return String(value ?? '');
            }
            if (typeof signedFixedString === 'function') {
                try {
                    return signedFixedString(Number(value), decimals);
                } catch (err) {
                }
            }
            const text = Number(value).toFixed(decimals);
            return value >= 0 ? `+${text}` : text;
        };

        const markFmt = (value, color) => `\\textcolor{${color}}{${formatSignedDelta(value)}}`;
        const markX = (value) => markFmt(value, '#1E88E5');
        const markY = (value) => markFmt(value, '#E53935');

        const formatNumber = (value) => {
            if (!Number.isFinite(value)) {
                return String(value ?? '');
            }
            const text = Number(value).toFixed(decimals);
            return text
                .replace(/(\.\d*?[1-9])0+$/, '$1')
                .replace(/\.0+$/, '')
                .replace(/^-0$/, '0');
        };

        const formatMagnitude = (value) => formatNumber(Math.abs(value));

        const formatSignedTerm = (value) => {
            if (!Number.isFinite(value) || Math.abs(value) < 1e-12) {
                return ' + 0';
            }
            const magnitude = formatMagnitude(value);
            return value >= 0 ? ` + ${magnitude}` : ` - ${magnitude}`;
        };

        const getParamSymbol = () => {
            if (equationObject && equationObject.parameterRange && equationObject.parameterRange.symbol) {
                return equationObject.parameterRange.symbol;
            }
            return 't';
        };

        const formatPointWithDelta = (point) => {
            if (!Array.isArray(point) || point.length < 2) {
                return `\\left(0 ${markX(deltaX)}, 0 ${markY(deltaY)}\\right)`;
            }
            const xText = formatNumber(point[0]);
            const yText = formatNumber(point[1]);
            return `\\left(${xText} ${markX(deltaX)}, ${yText} ${markY(deltaY)}\\right)`;
        };

        switch (type) {
            case 'constant':
                return `${cleaned} ${markY(deltaY)}`.trim();

            case 'vertical':
                return `${cleaned} ${markX(deltaX)}`.trim();

            case 'linear':
                try {
                    if (equationObject && equationObject.params) {
                        const maybeSlope = equationObject.params.slope;
                        let maybeIntercept = equationObject.params.intercept;
                        const maybePoint = equationObject.params.point;
                        if (!Number.isFinite(maybeIntercept) && Array.isArray(maybePoint) && maybePoint.length >= 2) {
                            const px = Number(maybePoint[0]);
                            const py = Number(maybePoint[1]);
                            if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(maybeSlope)) {
                                maybeIntercept = py - maybeSlope * px;
                            }
                        }

                        if (Number.isFinite(maybeSlope)) {
                            const a = Number(maybeSlope);
                            const b = Number.isFinite(maybeIntercept) ? Number(maybeIntercept) : 0;

                            const aPrefix = (Math.abs(a - 1) < 1e-12) ? '' : (Math.abs(a + 1) < 1e-12 ? '-' : formatNumber(a));
                            const dxRaw = deltaX || 0;
                            // 括弧内では色付きの符号付きデルタのみを使い、数値の重複表示を避ける
                            // markX は符号付きの値を期待する。括弧内で (x - Dx) / (x + Dx) の形になるよう -dx を渡す
                            const inner = `(x ${markX(-dxRaw)})`;

                            const newB = b - deltaY;
                            const bMag = formatMagnitude(Math.abs(newB));
                            const bPart = (Math.abs(newB) < 1e-12) ? '' : (newB >= 0 ? ` + ${bMag} ${markY(deltaY)}` : ` - ${bMag} ${markY(deltaY)}`);

                            // 常に括弧付きの平行移動表現 y = a(x - Dx) + (b - Dy) を優先する
                            const prefix = (aPrefix === '') ? '' : aPrefix;
                            return `y = ${prefix}${inner}${bPart}`.trim();
                        }
                    }
                    const reLinear = /\(\s*x\s*([+-])\s*([0-9.eE+-]+)\s*\)/;
                    const match = cleaned.match(reLinear);
                    if (match) {
                        const sign = match[1];
                        const marker = markX((sign === '-') ? -deltaX : deltaX);
                        const coloredInner = match[0].replace(match[2], `${match[2]} ${marker}`);
                        let rewritten = cleaned.replace(match[0], coloredInner);
                        const trailing = /([+-]\s*[0-9.eE+-]+)\s*$/;
                        const trailingMatch = cleaned.match(trailing);
                        if (trailingMatch) {
                            rewritten = rewritten.replace(trailingMatch[0], `${trailingMatch[0]} ${markY(deltaY)}`);
                        } else {
                            rewritten = `${rewritten} ${markY(deltaY)}`;
                        }
                        return rewritten.trim();
                    }
                } catch (err) {

                }
                return `${cleaned} ${markY(deltaY)}`.trim();

            case 'quadratic':
                try {
                    const reVertex = /\(\s*x\s*([+-])\s*([0-9.eE+-]+)\s*\)\^2/;
                    const match = cleaned.match(reVertex);
                    if (match) {
                        const sign = match[1];
                        const marker = markX((sign === '-') ? -deltaX : deltaX);
                        const coloredInner = match[0].replace(match[2], `${match[2]} ${marker}`);
                        let rewritten = cleaned.replace(match[0], coloredInner);
                        const trailing = /([+-]\s*[0-9.eE+-]+)\s*$/;
                        const trailingMatch = cleaned.match(trailing);
                        if (trailingMatch) {
                            rewritten = rewritten.replace(trailingMatch[0], `${trailingMatch[0]} ${markY(deltaY)}`);
                        } else {
                            rewritten = `${rewritten} ${markY(deltaY)}`;
                        }
                        return rewritten.trim();
                    }
                } catch (err) {

                }
                return `${cleaned} ${markY(deltaY)}`.trim();

            case 'circle':
                if (equationObject && equationObject.params && Array.isArray(equationObject.params.center)) {
                    const [cx, cy] = equationObject.params.center;
                    const radius = equationObject.params.radius;
                    if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(radius)) {
                        const signX = cx >= 0 ? '-' : '+';
                        const signY = cy >= 0 ? '-' : '+';
                        const markerX = markX(signX === '-' ? -deltaX : deltaX);
                        const markerY = markY(signY === '-' ? -deltaY : deltaY);
                        const radiusText = formatNumber(radius);
                        const xTerm = `(x ${signX} ${formatMagnitude(cx)} ${markerX})^2`;
                        const yTerm = `(y ${signY} ${formatMagnitude(cy)} ${markerY})^2`;
                        return `${xTerm} + ${yTerm} = ${radiusText}^2`;
                    }
                }
                return cleaned;

            case 'quadraticBezier':
                if (equationObject && equationObject.params && Array.isArray(equationObject.params.controlPoints)) {
                    const points = equationObject.params.controlPoints;
                    if (points.length >= 3) {
                        const symbol = getParamSymbol();
                        const p0 = formatPointWithDelta(points[0]);
                        const p1 = formatPointWithDelta(points[1]);
                        const p2 = formatPointWithDelta(points[2]);
                        return `${p0} (1 - ${symbol})^2 + 2 ${p1} (1 - ${symbol}) ${symbol} + ${p2} ${symbol}^2`;
                    }
                }
                return cleaned;

            case 'cubicBezier':
                if (equationObject && equationObject.params && Array.isArray(equationObject.params.controlPoints)) {
                    const points = equationObject.params.controlPoints;
                    if (points.length >= 4) {
                        const symbol = getParamSymbol();
                        const p0 = formatPointWithDelta(points[0]);
                        const p1 = formatPointWithDelta(points[1]);
                        const p2 = formatPointWithDelta(points[2]);
                        const p3 = formatPointWithDelta(points[3]);
                        return `${p0} (1 - ${symbol})^3 + 3 ${p1} (1 - ${symbol})^2 ${symbol} + 3 ${p2} (1 - ${symbol}) ${symbol}^2 + ${p3} ${symbol}^3`;
                    }
                }
                return cleaned;

            case 'arc':
                if (equationObject && equationObject.params && Array.isArray(equationObject.params.center)) {
                    const [cx, cy] = equationObject.params.center;
                    const radius = equationObject.params.radius;
                    if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(radius)) {
                        const symbol = getParamSymbol();
                        const radiusText = formatNumber(radius);
                        const xTerm = `${radiusText}\\cos ${symbol}${formatSignedTerm(cx)} ${markX(deltaX)}`;
                        const yTerm = `${radiusText}\\sin ${symbol}${formatSignedTerm(cy)} ${markY(deltaY)}`;
                        return `\\left(${xTerm}, ${yTerm}\\right)`;
                    }
                }
                return cleaned;

            default:
                return cleaned;
        }
    }

    applyParallelMoveToStoredEquation(type, equation, deltaX, deltaY) {
        if (!equation || typeof equation !== 'object') {
            return equation;
        }

        const effectiveType = equation.type || type;
        const translated = EquationBuilder.translateEquation(
            { ...equation, type: effectiveType },
            deltaX,
            deltaY
        );
        if (translated) {
            return translated;
        }

        const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, '').trim();
        const parseNum = (s) => {
            const numerical = stripHtml(s).replace(/[^0-9eE+\-\.]/g, '');
            const parsed = parseFloat(numerical);
            return Number.isFinite(parsed) ? parsed : NaN;
        };

        const startNum = parseNum(equation.domain && equation.domain.start);
        const endNum = parseNum(equation.domain && equation.domain.end);
        const deltaForDomain = (effectiveType === 'vertical') ? deltaY : deltaX;

        const newStart = Number.isFinite(startNum) ? startNum + deltaForDomain : null;
        const newEnd = Number.isFinite(endNum) ? endNum + deltaForDomain : null;

        const formatNum = (value, original) => {
            if (!Number.isFinite(value)) {
                return original || '';
            }
            if (typeof signedFixedString === 'function') {
                try {
                    return signedFixedString(value, 3);
                } catch (err) {

                }
            }
            return value.toFixed(3);
        };

        const newDomain = {
            start: newStart !== null ? formatNum(newStart, equation.domain && equation.domain.start) : ((equation.domain && equation.domain.start) || ''),
            end: newEnd !== null ? formatNum(newEnd, equation.domain && equation.domain.end) : ((equation.domain && equation.domain.end) || '')
        };

        const newFormula = this.getParallelMovedFormulaNumeric(effectiveType, equation.formula, deltaX, deltaY);

        return {
            ...equation,
            domain: newDomain,
            formula: newFormula,
            latex: newFormula,
            type: effectiveType
        };
    }

    /**
     * getParallelMovedFormulaNumeric
     * - getParallelMovedFormula を参考にするが、色付け注釈ではなく
     *   実際に数値を足し合わせた LaTeX 文字列を返す（簡易パーサ）
     */
    getParallelMovedFormulaNumeric(type, formula, deltaX, deltaY) {
        console.log('getParallelMovedFormulaNumeric', type, formula, deltaX, deltaY);
        // textcolor を削除
        const cleaned = (formula || '').replace(/\\textcolor\{#[0-9A-Fa-f]{6}\}\{[^}]*\}/g, "");

        const toNum = (s) => {
            const n = parseFloat((s || '').toString().replace(/[^0-9eE+\-\.]/g, ''));
            return Number.isFinite(n) ? n : NaN;
        };

        try {
            if (typeof applyDeltaToFormulaNumeric === 'function') {
                const moved = applyDeltaToFormulaNumeric(cleaned, deltaX, deltaY);
                if (moved && typeof moved === 'string') return moved;
            }
        } catch (err) {
            console.warn('applyDeltaToFormulaNumeric failed, falling back to local handling', err);
        }
        return cleaned;
    }

    translateSvgPathData(pathData, deltaX, deltaY) {
        if (typeof pathData !== 'string' || !pathData.trim()) {
            return pathData;
        }

        const tokens = [];
        const regex = /([AaCcHhLlMmQqSsTtVvZz])|([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
        let match;
        while ((match = regex.exec(pathData)) !== null) {
            if (match[1]) {
                tokens.push({ type: 'command', value: match[1] });
            } else if (match[2]) {
                tokens.push({ type: 'number', value: match[2] });
            }
        }

        const formatNumber = (value) => {
            if (!Number.isFinite(value)) return '0';
            const rounded = Math.abs(value) < 1e-12 ? 0 : value;
            let str = rounded.toFixed(6);
            str = str.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
            if (str === '-0') return '0';
            return str;
        };

        const applyPairAdjustment = (numbers, adjustX, adjustY) => {
            const adjusted = [];
            for (let i = 0; i < numbers.length; i += 2) {
                const rawX = numbers[i];
                const rawY = numbers[i + 1];
                const parsedX = parseFloat(rawX);
                const parsedY = parseFloat(rawY);
                adjusted.push(Number.isFinite(parsedX) ? adjustX(parsedX) : rawX);
                adjusted.push(Number.isFinite(parsedY) ? adjustY(parsedY) : rawY);
            }
            return adjusted;
        };

        const applyArcAdjustment = (numbers, isRelativeCommand) => {
            const adjusted = [];
            for (let i = 0; i < numbers.length; i += 7) {
                if (i + 6 >= numbers.length) break;
                const rawRx = numbers[i];
                const rawRy = numbers[i + 1];
                const rawRotation = numbers[i + 2];
                const largeArc = numbers[i + 3];
                const sweep = numbers[i + 4];
                const rawX = numbers[i + 5];
                const rawY = numbers[i + 6];

                const parsedRx = parseFloat(rawRx);
                const parsedRy = parseFloat(rawRy);
                const parsedRotation = parseFloat(rawRotation);
                const parsedX = parseFloat(rawX);
                const parsedY = parseFloat(rawY);

                adjusted.push(Number.isFinite(parsedRx) ? formatNumber(parsedRx) : rawRx);
                adjusted.push(Number.isFinite(parsedRy) ? formatNumber(parsedRy) : rawRy);
                adjusted.push(Number.isFinite(parsedRotation) ? formatNumber(parsedRotation) : rawRotation);
                adjusted.push(typeof largeArc === 'string' ? largeArc : formatNumber(parseFloat(largeArc)));
                adjusted.push(typeof sweep === 'string' ? sweep : formatNumber(parseFloat(sweep)));
                adjusted.push(Number.isFinite(parsedX)
                    ? (isRelativeCommand ? formatNumber(parsedX) : adjustX(parsedX))
                    : rawX);
                adjusted.push(Number.isFinite(parsedY)
                    ? (isRelativeCommand ? formatNumber(parsedY) : adjustY(parsedY))
                    : rawY);
            }
            return adjusted;
        };

        const adjustX = (value) => formatNumber(value + deltaX);
        const adjustY = (value) => formatNumber(value + deltaY);

        const result = [];
        let index = 0;
        let firstMoveHandled = false;

        while (index < tokens.length) {
            const token = tokens[index];
            if (token.type !== 'command') {
                index++;
                continue;
            }

            const command = token.value;
            const upper = command.toUpperCase();
            const isRelative = command !== upper;
            result.push(command);

            index++;
            const numbers = [];
            while (index < tokens.length && tokens[index].type === 'number') {
                numbers.push(tokens[index].value);
                index++;
            }

            if (numbers.length === 0) continue;

            const processedNumbers = [];

            const handlePairs = (adjustFirstPairOnlyForRelativeMove = false) => {
                for (let i = 0; i < numbers.length; i += 2) {
                    const rawXStr = numbers[i];
                    const rawYStr = numbers[i + 1];
                    const parsedX = parseFloat(rawXStr);
                    const parsedY = parseFloat(rawYStr);
                    const shouldAdjust = !isRelative || (!firstMoveHandled && command === 'm');
                    const applyAdjustment = adjustFirstPairOnlyForRelativeMove
                        ? (i === 0 && shouldAdjust)
                        : shouldAdjust;
                    const nextX = Number.isFinite(parsedX)
                        ? (applyAdjustment ? adjustX(parsedX) : formatNumber(parsedX))
                        : rawXStr;
                    const nextY = Number.isFinite(parsedY)
                        ? (applyAdjustment ? adjustY(parsedY) : formatNumber(parsedY))
                        : rawYStr;
                    processedNumbers.push(nextX, nextY);
                }
            };

            switch (upper) {
                case 'M':
                    if (command === 'm') {
                        handlePairs(true);
                    } else {
                        handlePairs();
                    }
                    firstMoveHandled = true;
                    break;
                case 'L':
                case 'T':
                    handlePairs();
                    break;
                case 'H':
                    numbers.forEach(num => {
                        const value = parseFloat(num);
                        if (!Number.isFinite(value)) {
                            processedNumbers.push(num);
                        } else {
                            processedNumbers.push(!isRelative ? adjustX(value) : formatNumber(value));
                        }
                    });
                    break;
                case 'V':
                    numbers.forEach(num => {
                        const value = parseFloat(num);
                        if (!Number.isFinite(value)) {
                            processedNumbers.push(num);
                        } else {
                            processedNumbers.push(!isRelative ? adjustY(value) : formatNumber(value));
                        }
                    });
                    break;
                case 'C':
                    processedNumbers.push(...applyPairAdjustment(numbers, (val) => !isRelative ? adjustX(val) : formatNumber(val), (val) => !isRelative ? adjustY(val) : formatNumber(val)));
                    break;
                case 'S':
                case 'Q':
                    processedNumbers.push(...applyPairAdjustment(numbers, (val) => !isRelative ? adjustX(val) : formatNumber(val), (val) => !isRelative ? adjustY(val) : formatNumber(val)));
                    break;
                case 'A':
                    processedNumbers.push(...applyArcAdjustment(numbers, isRelative));
                    break;
                case 'Z':
                    break;
                default:
                    processedNumbers.push(...numbers);
                    break;
            }

            if (command === 'm' && !firstMoveHandled) {
                firstMoveHandled = true;
            }

            if (processedNumbers.length > 0) {
                result.push(processedNumbers.join(' '));
            }
        }

        return result.join(' ').replace(/\s+/g, ' ').trim();
    }

    translatePointCollections(points, deltaX, deltaY) {
        if (!Array.isArray(points)) return points;
        return points.map(entry => {
            if (Array.isArray(entry)) {
                if (entry.length >= 2 && Number.isFinite(entry[0]) && Number.isFinite(entry[1])) {
                    const translated = entry.slice();
                    translated[0] = entry[0] + deltaX;
                    translated[1] = entry[1] + deltaY;
                    return translated;
                }
                return this.translatePointCollections(entry, deltaX, deltaY);
            }
            if (entry && typeof entry === 'object') {
                const hasX = Number.isFinite(entry.x);
                const hasY = Number.isFinite(entry.y);
                if (hasX || hasY) {
                    return {
                        ...entry,
                        x: hasX ? entry.x + deltaX : entry.x,
                        y: hasY ? entry.y + deltaY : entry.y
                    };
                }
            }
            return entry;
        });
    }

    /**
     * finalizeTranslateMove
     * - translate-only PoC の移動を確定させるため、近似を再実行して path を更新し、
     *   g の transform をリセットする。履歴の登録は moveCurve 側で行われる想定。
     */
    finalizeTranslateMove(curveId) {
        const graphCalculator = this.curveManager.graphCalculator;
        const curve = this.curveManager.curves[curveId];
        if (!graphCalculator || !curve || !curve.originalPoints) return;

        const baseTransform = this.dragState ? (this.dragState.curveBaseTransform || '') : '';
        const lastDelta = this.dragState && this.dragState.lastDelta || { dx: 0, dy: 0 };
        const dx = Number.isFinite(lastDelta.dx) ? lastDelta.dx : 0;
        const dy = Number.isFinite(lastDelta.dy) ? lastDelta.dy : 0;

        const resetGroupTransforms = () => {
            try {
                const svgRoot = graphCalculator.svg;
                const group = svgRoot && curve.graphCurve
                    ? svgRoot.querySelector(`g[data-curve-base-id="${curve.graphCurve.id}"]`)
                    : null;
                if (group) {
                    group.setAttribute('transform', baseTransform);
                }
                const emphasisGroup = svgRoot
                    ? svgRoot.querySelector(`g[data-curve-base-id="emphasis-${curve.graphCurve.id}"]`)
                    : null;
                if (emphasisGroup) {
                    emphasisGroup.setAttribute('transform', baseTransform);
                }
            } catch (e) {

            }
        };
        if (dx === 0 && dy === 0) {
            resetGroupTransforms();
            this.dragState && (this.dragState.lastDelta = null);
            return;
        }

        const updateGraphCurvePath = () => {
            if (!curve.graphCurve) return;
            const graphCurve = curve.graphCurve;
            if (Array.isArray(graphCurve.originalData)) {
                const translatedPoints = this.translatePointCollections(graphCurve.originalData, dx, dy);
                graphCalculator.updateCurve(graphCurve.id, { path: translatedPoints });
            } else if (typeof graphCurve.originalData === 'string') {
                const translatedPath = this.translateSvgPathData(graphCurve.originalData, dx, dy);
                graphCalculator.updateCurve(graphCurve.id, { path: translatedPath });
                if (curve.path && typeof curve.path.attr === 'function') {
                    curve.path.attr('d', translatedPath);
                }
            } else if (graphCurve.path) {
                const currentPath = graphCurve.path.getAttribute('d');
                if (typeof currentPath === 'string') {
                    const translatedPath = this.translateSvgPathData(currentPath, dx, dy);
                    graphCalculator.updateCurve(graphCurve.id, { path: translatedPath });
                    if (curve.path && typeof curve.path.attr === 'function') {
                        curve.path.attr('d', translatedPath);
                    }
                }
            }

            const emphasisId = `emphasis-${graphCurve.id}`;
            const emphasisCurve = graphCalculator.getCurve(emphasisId);
            if (emphasisCurve) {
                if (Array.isArray(emphasisCurve.originalData)) {
                    const translatedPoints = this.translatePointCollections(emphasisCurve.originalData, dx, dy);
                    graphCalculator.updateCurve(emphasisId, { path: translatedPoints });
                } else if (typeof emphasisCurve.originalData === 'string') {
                    const translatedPath = this.translateSvgPathData(emphasisCurve.originalData, dx, dy);
                    graphCalculator.updateCurve(emphasisId, { path: translatedPath });
                }
            }
        };

        updateGraphCurvePath();

        if (Array.isArray(curve.preKnots) && curve.preKnots.length > 0) {
            curve.preKnots = this.translatePointCollections(curve.preKnots, dx, dy);
        }

        const updatedPointIds = new Set();
        if (Array.isArray(curve.knotPoints)) {
            curve.knotPoints.forEach(knot => {
                if (!knot || !knot.point) return;
                const nextX = knot.x;
                const nextY = knot.y;
                knot.point.x = nextX;
                knot.point.y = nextY;
                if (knot.point.group) {
                    knot.point.group.setAttribute('transform', `translate(${nextX}, ${nextY})`);
                }
                updatedPointIds.add(knot.point.id);
            });
        }

        if (curve.graphCurve && Array.isArray(curve.graphCurve.points)) {
            curve.graphCurve.points.forEach(point => {
                if (!point || updatedPointIds.has(point.id)) return;
                if (Number.isFinite(point.x)) point.x += dx;
                if (Number.isFinite(point.y)) point.y += dy;
                if (point.group) {
                    point.group.setAttribute('transform', `translate(${point.x}, ${point.y})`);
                }
            });
        }

        if (Array.isArray(curve.latexEquations) && curve.latexEquations.length > 0) {
            const translatedEquations = curve.latexEquations.map(eq =>
                this.applyParallelMoveToStoredEquation(eq.type, eq, dx, dy)
            );
            curve.latexEquations = translatedEquations;
            this.curveManager.updateEquationsContainer(curveId, translatedEquations);
        } else {
            this.curveManager.updateEquationsContainer(curveId);
        }

        this.dragState && (this.dragState.lastDelta = null);
        resetGroupTransforms();
    }

}
