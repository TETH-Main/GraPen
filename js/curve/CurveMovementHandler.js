import { signedFixedString } from '../util/NumberUtil.js';
export class CurveMovementHandler {
    /**
     * @param {CurveManager} curveManager
     * @param {Object} settings - 共通設定（selectCurveIdなどを参照）
     */
    constructor(curveManager, settings) {
        this.curveManager = curveManager;
        this.settings = settings;
        this.enabled = false;

        // ボタン取得（id="curve-move-toggle"）
        this.button = document.getElementById('curve-move-toggle');
        if (this.button) {
            d3.select(this.button).on('pointerdown', () => this.toggleMovementMode());
        }

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

        // UIManager参照（後で設定される）
        this.uiManager = null;
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
     * 曲線移動モードの有効/無効をトグル
     */
    toggleMovementMode() {
        this.enabled = !this.enabled;
        if (this.button) {
            this.button.classList.toggle('active', this.enabled);
        }

        // イベントリスナーの設定/解除
        if (this.enabled) {
            this.setupEventListeners();
        } else {
            this.removeEventListeners();
        }
    }

    /**
     * UIManagerのペンツールの状態から曲線移動モードのスタイルを変更
     * @param {string} penToolState - ペンツールの状態
     */
    updatePenToolState(penToolState) {
        // this.dragState.penToolState = penToolState;

        // if (!this.button) return;

        if (penToolState === 'pen') {
            // ペンツールのスタイル - 曲線移動を無効化
            this.button.classList.add('disabled');
            // this.button.classList.remove('active');

            // // 移動モードが有効になっている場合は無効化
            // if (this.enabled) {
            //   this.enabled = false;
            //   this.removeEventListeners();
            // }
        } else if (penToolState === 'cursor') {
            // カーソルツールの場合は曲線移動を有効化可能に
            this.button.classList.remove('disabled');

            // アクティブ状態は維持（トグルで切り替える）
            // this.button.classList.toggle('active', this.enabled);
        }
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

        const paths = svg.querySelectorAll('path');
        paths.forEach(path => {
            path.style.cursor = 'grab';
        });
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
        if (!this.enabled || this.dragState.isDragging) return;

        // カーソルツールがアクティブな場合のみ曲線移動を有効に
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
        }
    }

    /**
     * マウス移動イベントハンドラ
     * @param {MouseEvent} event 
     */
    handleMouseMove(event) {
        if (!this.enabled || !this.dragState.isDragging) return;

        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

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
        if (!this.enabled || !this.dragState.isDragging) return;

        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

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

        // 曲線を移動して更新
        this.moveCurve(deltaX, deltaY);

        // ドラッグ終了
        this.endDrag();
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

        // 現在の曲線を選択状態にする
        this.curveManager.selectCurve(d3.select(`.curve-item:nth-child(${curveId + 1})`), curveId);

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

        // 元の曲線の節点がある場合はダミー曲線にも節点を追加
        if (curve.knotPoints && Array.isArray(curve.knotPoints)) {
            curve.knotPoints.forEach(knot => {
                if (knot && typeof knot.x === 'number' && typeof knot.y === 'number') {
                    graphCalculator.addPoint(dummyId, knot.x, knot.y, {
                        // color: curve.color,
                        // size: 10,
                        // shape: 'hollowCircle',
                        // opacity: 0.8
                    });
                }
            });
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
        if (dummyGroup) dummyGroup.setAttribute('transform', `translate(${deltaX},${deltaY})`);

        // 数式の更新（リアルタイム表示用）
        if (curve.latexEquations) {
            curve.latexEquations = curve.latexEquations.map(equations => (
                this.getParallelMovedEquations(equations.type, equations, deltaX, deltaY)
            ));
            this.curveManager.updateEquationsContainer(curveId);
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
        this.dragState.displacementText.x.textContent = `Δx: ${signedFixedString(deltaX, 3)}`;

        // Y方向移動量
        const yMidY = (startY + mouseY) / 2;
        this.dragState.displacementText.y.setAttribute("x", mouseX + 10);
        this.dragState.displacementText.y.setAttribute("y", yMidY);
        this.dragState.displacementText.y.textContent = `Δy: ${signedFixedString(deltaY, 3)}`;
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
        console.log("oldPoints", curve);

        // 点列を移動
        const movedPoints = oldPoints.map(point => [point[0] + deltaX, point[1] + deltaY]);

        // 曲線のタイプに応じて近似結果を取得
        const approximationResult = this.curveManager.getCurveApproximationResult(
            curve.type,
            movedPoints,
            {}  // 追加オプションがあれば指定
        );

        if (!approximationResult || !approximationResult.success) {
            console.error("曲線の再近似に失敗しました");
            return;
        }

        // 曲線オブジェクトを更新
        curve.originalPoints = movedPoints;
        curve.latexEquations = approximationResult.latexEquations;

        // GraphCalculatorの曲線を更新
        this.curveManager.graphCalculator.updateCurve(curve.graphCurve.id, {
            path: approximationResult.svgPath
        });

        this.curveManager.graphCalculator.updateCurve(`emphasis-${curve.graphCurve.id}`, {
            path: approximationResult.svgPath
        });

        // 節点も更新
        this.curveManager.graphCalculator.removeAllPoints(curve.graphCurve.id);
        if (approximationResult.knots && Array.isArray(approximationResult.knots)) {
            curve.knotPoints = [];

            approximationResult.knots.forEach(knot => {
                const point = this.curveManager.graphCalculator.addPoint(curve.graphCurve.id, knot[0], knot[1], {
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

        // 数式DOMを更新
        this.curveManager.updateEquationsContainer(curveId);

        // 履歴に記録
        this.recordMoveHistory(curveId, oldPoints, movedPoints, deltaX, deltaY);
    }

    /**
     * 履歴に曲線移動を記録
     * @param {number} curveId 曲線ID
     * @param {Array} oldPoints 移動前の点列
     * @param {Array} newPoints 移動後の点列
     * @param {number} deltaX X方向の移動量
     * @param {number} deltaY Y方向の移動量
     */
    recordMoveHistory(curveId, oldPoints, newPoints, deltaX, deltaY) {
        if (!this.curveManager.historyManager) return;

        this.curveManager.historyManager.addAction({
            type: 'moveCurve',
            id: curveId,
            oldPoints: oldPoints,
            newPoints: newPoints,
            deltaX: deltaX,
            deltaY: deltaY
        });
    }

    /**
     * ドラッグ終了
     * @param {boolean} cancel キャンセルするかどうか
     */
    endDrag(cancel = false) {
        const graphCalculator = this.curveManager.graphCalculator;
        if (!graphCalculator) return;

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
        // startとendの<span>を削除
        const start = equation.domain.start.replace(/<span.*?>.*?<\/span>/, '');
        const end = equation.domain.end.replace(/<span.*?>.*?<\/span>/, '');

        let deltaspan = ` <span style="color: #1E88E5;">${signedFixedString(deltaX, 3)}</span>`;

        if (type === 'vertical') {
            deltaspan = ` <span style="color: #E53935;">${signedFixedString(deltaY, 3)}</span>`;
        }

        return {
            'domain': {
                'start': start + deltaspan,
                'end': end + deltaspan
            },
            'formula': this.getParallelMovedFormula(type, equation.formula, deltaX, deltaY),
            'type': type
        }
    }

    /**
     * 平行移動用の数式を返す
     * @param {String} type - 曲線のタイプ
     * @param {String} formula - 数式
     * @param {Number} deltaX - X方向の移動量
     * @param {Number} deltaY - Y方向の移動量
     * @returns {String} - 平行移動後の数式
     */
    getParallelMovedFormula(type, formula, deltaX, deltaY) {
        // textcolorを削除
        const cleaned = formula.replace(/\\textcolor\{#[0-9A-Fa-f]{6}\}\{[^}]*\}/g, "");

        // 曲線のタイプに応じて平行移動後の数式を生成
        switch (type) {
            case 'constant':
                return cleaned + `\\textcolor{#E53935}{${signedFixedString(deltaY, 3)}}`;

            case 'vertical':
                return cleaned + `\\textcolor{#1E88E5}{${signedFixedString(deltaX, 3)}}`;

            case 'linear':
                // y = a(x - x1) + y1 を "y = a(x - x1" ") + y1" の2つを分割して検出する
                const resultLinear = cleaned.match(/^(.*?\([^)]*)(\).*)$/);

                if (resultLinear && resultLinear.length === 3) {
                    const match1 = resultLinear[1];
                    const match2 = resultLinear[2];
                    const inversDeltaX = -deltaX;

                    const str = match1 + `\\textcolor{#1E88E5}{${signedFixedString(inversDeltaX, 3)}}` + match2 + `\\textcolor{#E53935}{${signedFixedString(deltaY, 3)}}`;
                    return str;

                } else {
                    console.log("パターンに一致しませんでした。");
                }
                return formula;

            case 'quadratic':
                // y = a(x - p)^2 + q を "y = a(x - p" ")^2 + q" の2つを分割して検出する
                const resultQuad = cleaned.match(/^(.*?\([^)]*)(\)\^2.*)$/);

                if (resultQuad && resultQuad.length === 3) {
                    const match1 = resultQuad[1];
                    const match2 = resultQuad[2];
                    const inversDeltaX = -deltaX;

                    const str = match1 + `\\textcolor{#1E88E5}{${signedFixedString(inversDeltaX, 3)}}` + match2 + `\\textcolor{#E53935}{${signedFixedString(deltaY, 3)}}`;
                    return str;

                }
                return formula;

            default:
                return formula;
        }
    }

}
