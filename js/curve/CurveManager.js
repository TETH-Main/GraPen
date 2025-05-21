// 必要なインポートを追加
import { EquationHighlighter } from './EquationHighlighter.js';
import { QuadraticBSplineCurveApproximator } from '../approximator/quadratic/QuadraticBSplineCurveApproximator.js';
import { LinearFunctionApproximator } from '../approximator/linear/LinearFunctionApproximator.js';
import { PiecewiseLinearApproximator } from '../approximator/linear/PiecewiseLinearApproximator.js';
/**
 * カーブ管理クラス
 * 曲線の追加、更新、削除などの操作を担当
 */
export class CurveManager {
    constructor(settings, historyManager, graphCalculator = null) {
        this.settings = settings;
        this.historyManager = historyManager;
        this.graphCalculator = graphCalculator; // GraphCalculator参照を保持
        this.curves = [];
        this.g = null;
        this.emphasisPath = null;
        this.emphasisGraphCurveId = null; // GraphCalculator内の強調表示用曲線ID
        this.uiManager = null;
        this.languageManager = null;

        // 数式ハイライト機能クラスを初期化
        this.equationHighlighter = graphCalculator ? new EquationHighlighter(graphCalculator) : null;

        this.quadraticApproximator = new QuadraticBSplineCurveApproximator(this.settings);
        this.linearApproximator = new LinearFunctionApproximator(this.settings);
        this.piecewiseLinearApproximator = new PiecewiseLinearApproximator(this.settings);

        this.approximatorSettings = {
            showKnotsDefault: true,
            maxKnots: 10
        };

        // clear-canvasにドラッグ関連イベントを設定
        this.clearCanvasElem = document.getElementById('clear-canvas');
        if (this.clearCanvasElem) {
            this.clearCanvasElem.ondragover = (event) => {
                this.clearCanvasElem.classList.add('dragover');
                this.dragOver(event);
            }
            this.clearCanvasElem.ondrop = (event) => this.drop(event);
        }
    }

    /**
     * グラフ要素の設定
     */
    setGraphElement(graphElement) {
        this.g = graphElement;
    }

    setUIManager(uiManager) {
        this.uiManager = uiManager;
    }

    setApproximatorSettings(options) {
        this.approximatorSettings = {
            ...this.approximatorSettings,
            ...options
        };
    }

    /**
     * 曲線の追加
     * @param {number} id - 曲線のID
     * @param {string} type - 曲線のタイプ（例: "quadratic"）
     * @param {Object} path - 曲線のSVGパス要素
     * @param {string} color - 曲線の色
     * @param {number} size - 曲線の太さ
     * @param {Object} graphCurve - GraphCalculatorの曲線オブジェクト（オプション）
     * @param {Array} latexEquations - LaTeX形式の数式配列（オプション）
     * @param {Array} preKnots - 近似曲線の節点（二次曲線用オプション）
     * @param {Object} approximatorSettings - 曲線近似設定のオプション機能
     * @param {number} minKnots - 節点の最小数（オプション）
     * @param {number} maxKnots - 節点の最大数（オプション）
     * @param {Array} originalPoints - 元の点データ（オプション）
     */
    addCurve(id, type, path, color, size, graphCurve = null, latexEquations = [], approximatorSettings, preKnots, minKnots, maxKnots, originalPoints) {
        const curve = {
            id: id,
            type: type,
            path: path,
            color: color,
            size: size,
            isHidden: false,        // 曲線の表示・非表示状態
            isDetailShown: false,   // 詳細情報の表示・非表示状態
            graphCurve: graphCurve,  // GraphCalculatorの曲線オブジェクトを保存
            latexEquations: latexEquations,  // 数式を曲線オブジェクト内に直接保存
            preKnots: preKnots,  // 二次曲線近似用の節点
            knotCount: latexEquations ? latexEquations.length + 1 : 0, // 二次曲線近似用の節点数
            originalPoints: originalPoints, // 近似に必要なため元の点データを保存
            minKnots: minKnots || 2, // 節点の最小数
            maxKnots: maxKnots || 10, // 節点の最大数
        };

        this.curves.push(curve);
        this.addCurveToList(id, color, size, true, approximatorSettings);
        this.historyManager.addAction({
            type: 'add',
            curve: this.curves[this.curves.length - 1]
        });
    }

    /**
     * 曲線リストに追加
     */
    addCurveToList(id, color, size, hidden, options) {
        const curveList = d3.select('#curve-list');
        const curve = this.curves[id];

        // 曲線の非表示状態と詳細情報の表示状態を取得
        const isHidden = curve ? curve.isHidden : hidden;
        const isDetailShown = curve ? curve.isDetailShown : false;

        const curveItem = curveList.append('div')
            .attr('class', 'curve-item')
            .attr('data-id', id)
            .html(`
          <span class="curve-id no-copy">${id}</span>
      `);

        // curve-settingにdraggable属性を付与
        const curveSetting = curveItem.append('div')
            .attr('class', 'curve-setting')
            .attr('draggable', true)
            .attr('data-id', id)  // Add data-id attribute here
            .html(`
        <div class="color-icon ${isHidden ? "hidden-curve" : ""}" style="background-color: ${color};" data-id="${id}"></div>
        <button class="details-dropdown ${isDetailShown ? "rotated" : ""}" data-id="${id}">
          <i class="material-symbols-rounded none-event">keyboard_control_key</i>
        </button>
        <button class="delete-btn" data-id="${id}">
          <i class="material-symbols-rounded none-event">close_small</i>
        </button>
      `);

        // 曲線の詳細部分を追加
        const curveDetails = curveItem.append('div')
            .attr('class', `curve-details ${isDetailShown ? "" : "hidden"}`);

        const curveOptions = curveDetails.append('div')
            .attr('class', 'curve-options');

        // -- 節点表示・非表示ボタン -- //
        const nodeToggleBtn = curveOptions.append('button')
            .attr('class', 'curve-option-btn')
            .attr('title', 'Show knots')
            .attr('data-id', id)
            .html('<i class="material-symbols-rounded">commit</i>');

        // 初期状態でshowKnotsDefaultがfalseの場合はactiveクラスを追加
        if (options.showKnotsDefault) {
            nodeToggleBtn.classed('active', true);
        }

        nodeToggleBtn.on('click', (event) => {
            event.stopPropagation();
            const btn = event.currentTarget;
            btn.classList.toggle('active');

            if (this.equationHighlighter) {
                this.equationHighlighter.toggleKnotPoints(id);
            }
        });
        // -- 節点表示・非表示ボタンおわり -- //


        // 二次曲線近似（quadratic）の場合のみ、節点数の調整スライダーを追加
        if (curve && curve.type === 'quadratic') {
            this.createKnotCountSlider(curveOptions, id);
        }

        const equationsContainer = curveDetails.append('div')
            .attr('class', 'equations-container');

        if (curve && curve.latexEquations && Array.isArray(curve.latexEquations) && curve.latexEquations.length > 0) {

            const timeline = equationsContainer.append('div')
                .attr('class', 'equations-timeline');

            if (typeof curve.latexEquations[0] === 'object' && curve.latexEquations[0].domain) {
                timeline.append('div')
                    .attr('class', 'domain-marker')
                    .text(curve.latexEquations[0].domain.start);
            }

            curve.latexEquations.forEach((eq, i) => {
                if (typeof eq === 'object' && eq.formula && eq.domain) {
                    const equationItem = timeline.append('div')
                        .attr('class', 'equation-item')
                        .attr('data-section-index', i)
                        .attr('data-curve-id', id);

                    const equationContent = equationItem.append('div')
                        .attr('class', 'equation-content')
                        .attr('data-section-index', i)
                        .attr('data-curve-id', id);

                    const copyButton = equationContent.append('button')
                        .attr('class', 'equation-copy-btn')
                        .attr('title', '数式をコピー')
                        .html('<i class="material-symbols-rounded">content_copy</i>');

                    const katexContainer = equationContent.append('div')
                        .attr('class', 'katex-display');

                    timeline.append('div')
                        .attr('class', 'domain-marker')
                        .text(eq.domain.end);

                    // Render equation with KaTeX
                    setTimeout(() => {
                        try {
                            katex.render(eq.formula, katexContainer.node(), {
                                throwOnError: false,
                                displayMode: true
                            });

                            copyButton.on('click', (event) => {
                                event.stopPropagation();
                                this.copyEquationToClipboard(eq.formula, copyButton.node());
                            });

                            // EquationHighlighterを使って数式ハイライト機能を追加
                            equationContent
                                .on('mouseenter', () => this.highlightFunction(id, i, eq))
                                .on('mouseleave', () => this.unhighlightFunction())

                        } catch (e) {
                            console.error('KaTeX rendering failed:', e);
                            katexContainer.text(eq.formula);

                            copyButton.on('click', (event) => {
                                event.stopPropagation();
                                this.copyEquationToClipboard(eq.formula, copyButton.node());
                            });
                        }
                    }, 0);
                }
            });
        } else {
            equationsContainer.html('<p class="no-equation">関数式は利用できません</p>');
        }

        // --- ここからクリック/ドラッグ判定 ---
        curveSetting.on('pointerdown', (event) => {
            // 左クリックのみ反応（マウスの場合）
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            // 特定の要素のクリックは無視
            if (event.target.closest('.color-icon') ||
                event.target.closest('.details-dropdown') ||
                event.target.closest('.delete-btn')) {
                return;
            }

            event.preventDefault();
            const curveItemElem = event.target.closest('.curve-item');
            const startPos = this._getEventPosition(event);
            const startX = startPos.x;
            const startY = startPos.y;
            let moved = false;
            let rafId = null;

            // iOS向けのスクロール防止 - タッチ開始時に呼び出し
            if (event.pointerType === 'touch') {
                document.body.style.overflow = 'hidden';
                document.documentElement.style.overflow = 'hidden';
                document.addEventListener('touchmove', this._preventDefaultTouch, { passive: false });
            }

            // ポインタキャプチャを使用して、ポインタイベントを要素に固定
            try {
                event.target.setPointerCapture(event.pointerId);
            } catch (e) {
                console.warn('ポインタキャプチャに失敗:', e);
            }

            // D3を使わず直接DOMイベントを登録（より信頼性が高い）
            const moveHandler = (moveEvent) => {
                if (moveEvent.cancelable) {
                    moveEvent.preventDefault();
                }

                if (rafId) return;

                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    const pos = this._getEventPosition(moveEvent);
                    const dx = pos.x - startX;
                    const dy = pos.y - startY;

                    if (!moved && Math.sqrt(dx * dx + dy * dy) > 5) {
                        moved = true;
                        this._startCurveDrag(moveEvent, id, curveItemElem);
                    }

                    if (moved && this._dragDummy) {
                        this._dragDummy.style.left = `${pos.x - this._dragOffsetX}px`;
                        this._dragDummy.style.top = `${pos.y - this._dragOffsetY}px`;
                        this._onDragMove(moveEvent);
                    }
                });
            };

            const upHandler = (upEvent) => {
                this._cleanupTouchEvents();

                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }

                // ポインタキャプチャを解放
                try {
                    event.target.releasePointerCapture(event.pointerId);
                } catch (e) { }

                // イベントリスナーをクリーンアップ
                document.removeEventListener('pointermove', moveHandler, { capture: true });
                document.removeEventListener('pointerup', upHandler, { capture: true });
                document.removeEventListener('pointercancel', upHandler, { capture: true });

                if (!moved) {
                    this.selectCurve(d3.select(curveItemElem), id);
                } else {
                    this._onDragEnd(upEvent);
                }
            };

            // キャプチャフェーズでイベントを捕捉（優先度が高い）
            document.addEventListener('pointermove', moveHandler, { capture: true, passive: false });
            document.addEventListener('pointerup', upHandler, { capture: true });
            document.addEventListener('pointercancel', upHandler, { capture: true });
        });
        // --- ここまでクリック/ドラッグ判定 ---

        // 詳細表示の切り替え - イベント伝播を停止
        curveItem.select('.details-dropdown').on('pointerdown', (event) => {
            event.stopPropagation();
            this.toggleDetailVisibility(id);
        });

        // 削除ボタン - イベント伝播を停止
        curveItem.select('.delete-btn').on('pointerdown', (event) => {
            event.stopPropagation();
            this.deleteCurve(event);
        });

        // 色アイコンのクリックイベント（曲線の表示・非表示切替え） - イベント伝播を停止
        curveItem.select('.color-icon').on('pointerdown', (event) => {
            event.stopPropagation();
            this.toggleCurveVisibility(id);
        });

        // --- ドラッグ＆ドロップ用の変数 ---
        if (!this._dragDropInitialized) {
            this._dragDropInitialized = true;
            this._dragDummy = null;
            this._draggedCurveId = null;
            this._dragIndicator = null;
            this._curveListElem = document.getElementById('curve-list');
            this._rafMove = null; // RAF管理用変数を追加
            this._touchActive = false; // タッチ処理が進行中かのフラグ

            // タッチ処理用のバインド関数（this参照を固定）
            this._preventDefaultTouch = this._preventDefaultTouch.bind(this);
            this._handleGlobalDragMove = this._handleGlobalDragMove.bind(this);
            this._handleGlobalDragEnd = this._handleGlobalDragEnd.bind(this);

            // グローバルイベントハンドラ - D3を使わずに直接DOMイベント
            document.addEventListener('pointermove', this._handleGlobalDragMove, { passive: false });
            document.addEventListener('pointerup', this._handleGlobalDragEnd);
            document.addEventListener('pointercancel', this._handleGlobalDragEnd);
        }
    }

    /**
     * タッチイベント用のデフォルト動作防止
     * @param {TouchEvent} e - タッチイベント
     */
    _preventDefaultTouch(e) {
        if (e.cancelable) {
            e.preventDefault();
        }
    }

    /**
     * グローバルドラッグ移動ハンドラ
     * @param {PointerEvent} e - ポインターイベント
     */
    _handleGlobalDragMove(e) {
        this._onDragMove(e);
    }

    /**
     * グローバルドラッグ終了ハンドラ
     * @param {PointerEvent} e - ポインターイベント
     */
    _handleGlobalDragEnd(e) {
        this._onDragEnd(e);
    }

    /**
     * タッチイベント関連のクリーンアップ
     */
    _cleanupTouchEvents() {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.removeEventListener('touchmove', this._preventDefaultTouch, { passive: false });
        this._touchActive = false;
    }

    // --- ドラッグ＆ドロップの実装 ---
    _startCurveDrag(event, curveId, curveItemElem) {
        this._removeDragDummy();
        this._removeDragIndicator();

        // タッチ処理中フラグを設定
        if (event.pointerType === 'touch') {
            this._touchActive = true;
        }

        this._draggedCurveId = curveId;
        this._draggedCurveElem = curveItemElem;

        try {
            // ダミー要素を作成
            const rect = curveItemElem.getBoundingClientRect();
            const dummy = curveItemElem.cloneNode(true);
            dummy.classList.add('curve-drag-dummy');
            dummy.style.position = 'fixed';
            dummy.style.left = `${rect.left}px`;
            dummy.style.top = `${rect.top}px`;
            dummy.style.width = `${rect.width}px`;
            dummy.style.height = `${rect.height}px`;
            dummy.style.pointerEvents = 'none';
            dummy.style.opacity = '1';
            dummy.style.zIndex = '10001';

            // モバイルでのパフォーマンス向上のためのCSS
            dummy.style.willChange = 'transform';
            dummy.style.transform = 'translateZ(0)';

            document.body.appendChild(dummy);
            this._dragDummy = dummy;

            // 元のcurve-itemを半透明に
            curveItemElem.classList.add('curve-drag-origin');

            // タッチかマウスかによって座標取得方法を分ける
            const pos = this._getEventPosition(event);
            this._dragOffsetX = pos.x - rect.left;
            this._dragOffsetY = pos.y - rect.top;

            // 最後の座標を記録（タッチが途切れた時のフォールバック用）
            this._lastDragPos = { x: pos.x, y: pos.y };

            // ドラッグ中フラグ
            this._dragging = true;
            this._dummyAnimated = false;
        } catch (err) {
            console.error('ドラッグ開始エラー:', err);
            this._removeDragDummy();
            this._draggedCurveId = null;
            this._draggedCurveElem = null;
            this._dragging = false;
            this._cleanupTouchEvents();
        }
    }

    /**
     * マウスイベントとタッチイベントの両方から座標を取得する共通関数
     * @param {Event} event - ポインター/タッチ/マウスイベント
     * @returns {{x: number, y: number}} イベント発生位置
     */
    _getEventPosition(event) {
        // フォールバック - 最後の既知の位置がある場合
        if (!event && this._lastDragPos) {
            return this._lastDragPos;
        }

        // タッチイベントの場合
        if (event.touches && event.touches.length) {
            return {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY
            };
        }
        // PointerEventの場合
        else if (event.clientX !== undefined) {
            // 座標を更新して記録
            this._lastDragPos = {
                x: event.clientX,
                y: event.clientY
            };
            return this._lastDragPos;
        }
        // フォールバック
        return {
            x: 0,
            y: 0
        };
    }

    _onDragMove(event) {
        if (!this._dragging || !this._dragDummy) return;

        // タッチスクロールを防止（必須）
        if (event && event.cancelable) {
            event.preventDefault();
        }

        // requestAnimationFrameで最適化
        if (this._rafMove) return;

        this._rafMove = requestAnimationFrame(() => {
            this._rafMove = null;

            if (!this._dragDummy) return;

            try {
                // タッチかマウスかによって座標取得方法を分ける
                const pos = this._getEventPosition(event);

                // ダミー要素の位置更新
                const dx = pos.x - this._dragOffsetX;
                const dy = pos.y - this._dragOffsetY;

                // translateでパフォーマンス向上
                this._dragDummy.style.transform = `translate3d(${dx - parseInt(this._dragDummy.style.left)}px, ${dy - parseInt(this._dragDummy.style.top)}px, 0)`;

                // アニメーション効果が終わったら実際の座標を更新
                if (!this._dummyAnimated) {
                    this._dummyAnimated = true;
                    this._dragDummy.classList.add('curve-drag-dummy-animate');
                } else {
                    // 時々実際の位置を更新（長時間ドラッグ時の座標ずれ防止）
                    if (Math.random() < 0.1) {
                        this._dragDummy.style.left = `${dx}px`;
                        this._dragDummy.style.top = `${dy}px`;
                        this._dragDummy.style.transform = 'translate3d(0, 0, 0)';
                    }
                }

                // ゴミ箱エフェクト処理
                this._updateTrashEffect(pos);

                // インジケーター更新
                this._updateDragIndicator(pos);
            } catch (err) {
                console.error('ドラッグ移動エラー:', err);
            }
        });
    }

    /**
     * ゴミ箱エフェクトを更新
     * @param {{x: number, y: number}} pos - 現在の座標
     */
    _updateTrashEffect(pos) {
        const clearElem = document.getElementById('clear-canvas');
        if (!clearElem) return;

        clearElem.classList.add('trash-red');
        const trashRect = clearElem.getBoundingClientRect();
        let overTrash = false;

        if (pos.x >= trashRect.left &&
            pos.x <= trashRect.right &&
            pos.y >= trashRect.top &&
            pos.y <= trashRect.bottom) {
            overTrash = true;
        }

        if (overTrash && this._dragDummy) {
            clearElem.classList.add('trash-hover');
            const dummyRect = this._dragDummy.getBoundingClientRect();
            const trashCenterX = trashRect.left + trashRect.width / 2;
            const trashCenterY = trashRect.top + trashRect.height / 2;
            const dummyCenterX = dummyRect.left + dummyRect.width / 2;
            const dummyCenterY = dummyRect.top + dummyRect.height / 2;

            const dx = trashCenterX - dummyCenterX;
            const dy = trashCenterY - dummyCenterY;
            this._dragDummy.style.transform = `translate(${dx}px, ${dy}px) scale(0.2)`;
            this._dragDummy.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            this._dragDummy.style.opacity = '0';
        } else if (this._dragDummy) {
            clearElem.classList.remove('trash-hover');
            // アニメーションを適用しない場合のデフォルト位置
            const left = parseInt(this._dragDummy.style.left) || 0;
            const top = parseInt(this._dragDummy.style.top) || 0;
            const dx = pos.x - this._dragOffsetX - left;
            const dy = pos.y - this._dragOffsetY - top;
            this._dragDummy.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            this._dragDummy.style.transition = '';
        }
    }

    /**
     * ドラッグインジケーターを更新
     * @param {{x: number, y: number}} pos - 現在の座標
     */
    _updateDragIndicator(pos) {
        if (!this._curveListElem) return;

        const items = Array.from(this._curveListElem.querySelectorAll('.curve-item:not(.curve-drag-dummy)'));
        let insertIndex = items.length;

        for (let i = 0; i < items.length; i++) {
            const rect = items[i].getBoundingClientRect();
            if (pos.y < rect.top + rect.height / 2) {
                insertIndex = i;
                break;
            }
        }

        this._showDragIndicator(insertIndex, items);
        this._dragInsertIndex = insertIndex;
    }

    _onDragEnd(event) {
        if (!this._dragging) return;
        this._dragging = false;

        // RAF実行中なら停止
        if (this._rafMove) {
            cancelAnimationFrame(this._rafMove);
            this._rafMove = null;
        }

        // タッチイベント関連のクリーンアップ
        this._cleanupTouchEvents();

        try {
            // 元のスタイルを復元
            if (this._draggedCurveElem) {
                this._draggedCurveElem.classList.remove('curve-drag-origin');
            }

            // ゴミ箱エリアチェック
            const clearElem = document.getElementById('clear-canvas');
            let overTrash = false;

            if (clearElem) {
                const trashRect = clearElem.getBoundingClientRect();
                const pos = this._getEventPosition(event);

                if (pos.x >= trashRect.left &&
                    pos.x <= trashRect.right &&
                    pos.y >= trashRect.top &&
                    pos.y <= trashRect.bottom) {
                    overTrash = true;
                }

                clearElem.classList.remove('trash-red');
                clearElem.classList.remove('trash-hover');
            }

            if (overTrash && this._draggedCurveId !== null) {
                // ゴミ箱に入れる
                this.deleteCurve({ target: { dataset: { id: this._draggedCurveId } } });
            } else if (this._dragInsertIndex !== undefined && this._draggedCurveId !== null) {
                // 順序変更処理
                const fromId = this._draggedCurveId;
                const toIndex = this._dragInsertIndex;

                if (typeof fromId === 'number' && typeof toIndex === 'number') {
                    if (fromId !== toIndex && fromId !== toIndex - 1) {
                        if (fromId < toIndex) {
                            this.reorderCurves(fromId, toIndex - 1);
                        } else {
                            this.reorderCurves(fromId, toIndex);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('ドラッグ終了エラー:', err);
        } finally {
            // クリーンアップ処理
            this._removeDragDummy();
            this._removeDragIndicator();
            this._draggedCurveId = null;
            this._draggedCurveElem = null;
            this._dragInsertIndex = null;
            this._lastDragPos = null;
        }
    }

    _showDragIndicator(insertIndex, items) {
        // インジケーターを再利用して効率化
        if (!this._dragIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'curve-drag-indicator';
            indicator.style.position = 'absolute';
            indicator.style.left = '0';
            indicator.style.right = '0';
            indicator.style.height = '4px';
            indicator.style.background = '#4285f4';
            indicator.style.borderRadius = '2px';
            indicator.style.zIndex = '10000';
            indicator.style.pointerEvents = 'none';

            // すぐ切り替えるためtransitionを軽量化
            indicator.style.transition = 'top 0.05s ease-out';
            this._curveListElem.appendChild(indicator);
            this._dragIndicator = indicator;
        }

        // 位置計算を最適化
        let topPosition = 0;

        try {
            if (items.length === 0) {
                topPosition = 0;
            } else if (insertIndex === 0) {
                topPosition = items[0].offsetTop - 2;
            } else if (insertIndex >= items.length) {
                const last = items[items.length - 1];
                topPosition = last.offsetTop + last.offsetHeight - 2;
            } else {
                topPosition = items[insertIndex].offsetTop - 2;
            }

            this._dragIndicator.style.top = `${topPosition}px`;
        } catch (err) {
            console.error('インジケーター表示エラー:', err);
        }
    }

    _removeDragDummy() {
        if (this._dragDummy) {
            this._dragDummy.remove();
            this._dragDummy = null;
        }
    }

    _removeDragIndicator() {
        if (this._dragIndicator) {
            this._dragIndicator.remove();
            this._dragIndicator = null;
        }
    }

    /**
     * 曲線の表示・非表示を切り替える
     * @param {number} curveId - 曲線ID
     */
    toggleCurveVisibility(curveId) {
        const curve = this.curves[curveId];
        if (!curve) return;

        // 現在の状態を取得
        const isHidden = curve.isHidden || false;

        // 表示/非表示状態を反転
        const newHiddenState = !isHidden;

        // 履歴に追加
        this.historyManager.addAction({
            type: 'toggleVisibility',
            id: curveId,
            oldHidden: isHidden,
            newHidden: newHiddenState
        });

        // 曲線の表示/非表示を切り替え
        this.setCurveVisibility(curveId, !newHiddenState);
        console.log(`Curve ${curveId} visibility toggled to ${!newHiddenState}`);
    }

    /**
     * 曲線のクリックイベント処理
     */
    handleCurveItemClick(event, id) {
        const clickedElmClass = event.target.classList;
        if (clickedElmClass.contains('color-icon') ||
            clickedElmClass.contains('details-dropdown') ||
            clickedElmClass.contains('delete-btn')) {
            return;
        }

        this.selectCurve(d3.select(event.currentTarget), id);
    }

    /**
     * 曲線選択処理
     */
    selectCurve(curveItem, id) {
        // すべての曲線項目の選択状態を解除
        d3.selectAll('.curve-item').classed('selected', false);

        // 強調表示を削除
        this.delEmphasisCurve();

        // すでに選択されていた場合は選択解除
        if (this.settings.selectCurveId === id) {
            this.deselectCurve();
        } else {
            // 選択された曲線項目にselectedクラスを追加
            curveItem.classed('selected', true);

            // 強調表示
            this.emphasisCurve(id);

            // 現在の色とサイズを保存してから更新
            this.settings.prevColor = this.settings.currentColor;
            this.settings.prevSize = this.settings.currentSize;

            // 選択された曲線の色とサイズを取得
            const curveColor = this.curves[id].color;
            const curveSize = this.curves[id].size;

            // UIコントロールを更新
            d3.select("#size").property('value', curveSize);

            // ミニカラーディスプレイを更新
            this.uiManager.penToolManager.updateColorDisplayMini(curveColor);
            this.uiManager.penToolManager.updateSizeDisplayMini(curveSize);

            // 内部設定を更新
            this.settings.currentColor = curveColor;
            this.settings.currentSize = curveSize;
            this.settings.selectCurveId = id;

            // PenToolManagerに通知（存在する場合）
            if (this.uiManager && this.uiManager.penToolManager) {
                this.uiManager.penToolManager.updateFromCurveSelection(curveColor, curveSize);
            }
        }
    }

    /**
     * 曲線の選択解除
     */
    deselectCurve() {
        this.uiManager.penToolManager.resetToDefault();
        this.settings.currentColor = this.settings.prevColor;
        this.settings.currentSize = this.settings.prevSize;
        this.settings.selectCurveId = null;
    }

    /**
     * 詳細表示の切り替え
     * @param {number} id - 曲線ID
     */
    toggleDetailVisibility(id) {
        const curve = this.curves[id];
        if (!curve) return;

        // 現在の状態を取得
        const isDetailShown = curve.isDetailShown;

        // 表示/非表示状態を反転
        const newDetailState = !isDetailShown;

        // 履歴に追加
        this.historyManager.addAction({
            type: 'toggleDetails',
            id: id,
            oldDetailShown: isDetailShown,
            newDetailShown: newDetailState
        });

        // 状態を更新
        this.setCurveDetailState(id, newDetailState);
    }

    /**
     * 詳細表示の切り替え (イベントハンドラ用)
     * @deprecated 直接toggleDetailVisibilityを使ってください
     */
    showDetails(event) {
        const id = parseInt(event.target.dataset.id);
        this.toggleDetailVisibility(id);
    }

    /**
     * 曲線の削除
     * @param {Event} event - イベントオブジェクト
     */
    deleteCurve(event) {
        const id = parseInt(event.target.dataset.id);

        this.historyManager.addAction({
            type: 'delete',
            curve: this.curves[id],
            index: id,
            nextCurveId: this.settings.nextCurveId
        });

        // D3パスの削除
        this.curves[id].path.remove();

        // GraphCalculatorからも曲線を削除
        if (this.graphCalculator && this.curves[id].graphCurve) {
            const graphCalcCurve = this.curves[id].graphCurve;
            this.graphCalculator.removeCurve(graphCalcCurve.id);
        }

        // 配列から削除
        this.curves.splice(id, 1);

        // IDを再割り当て
        this.curves.forEach((curve, index) => {
            if (curve) {
                curve.id = index;
            }
        });

        this.settings.nextCurveId = this.curves.length;
        this.updateCurveList();
        this.redrawCurves();
        this.deselectCurve();
    }

    /**
     * 曲線リストをID指定で更新
     * @param {number} id - 曲線ID
     */
    updateCurveListById(id) {
        const curve = this.curves[id];
        this.updateEquationsContainer(id, curve.latexEquations)
    }

    /**
     * 曲線リストの更新
     */
    updateCurveList() {
        const curveList = document.getElementById('curve-list');
        curveList.innerHTML = '';
        this.curves.forEach((curve, index) => {
            if (curve) {
                this.addCurveToList(index, curve.color, curve.size, curve.hidden, this.approximatorSettings);
            }
        });
    }

    /**
     * 曲線の強調表示
     */
    emphasisCurve(id) {
        // 既存の強調表示を削除
        this.delEmphasisCurve();

        try {
            if (!this.curves[id]) return;

            // ローカルのSVGに強調表示用曲線を追加
            this.emphasisPath = this.g.append('path')
                .attr('fill', 'none')
                .attr('stroke', this.curves[id].color)
                .attr('stroke-width', this.curves[id].size + 6)
                .attr('stroke-opacity', '0.4')
                .attr('stroke-linecap', 'round')
                .attr('d', this.curves[id].path.attr('d'))
                .attr("id", "emphasisCurve");

            // GraphCalculator内に強調表示用曲線を追加（曲線が存在する場合）"
            if (this.graphCalculator && this.curves[id].graphCurve) {
                const graphCurve = this.curves[id].graphCurve;
                const curveId = graphCurve.id;

                // 強調表示用の曲線ID
                const emphasisId = `emphasis-${curveId}`;

                // パスデータを取得
                const originalCurve = this.graphCalculator.getCurve(curveId);
                if (originalCurve && originalCurve.path) {
                    const pathData = originalCurve.path.getAttribute('d');

                    // 既存の強調表示曲線があれば削除
                    const existingEmphasis = this.graphCalculator.getCurve(emphasisId);
                    if (existingEmphasis) {
                        this.graphCalculator.removeCurve(emphasisId);
                    }

                    // 強調表示用曲線を追加 - 元の曲線と同じデータを使用
                    const emphasisCurve = this.graphCalculator.addCurve(pathData, {
                        id: emphasisId,
                        color: this.curves[id].color,
                        width: this.curves[id].size + 8,
                        opacity: 0.4
                    });

                    // GraphCalculator内の強調表示用曲線IDを保存
                    this.emphasisGraphCurveId = emphasisId;

                    // 注: レイヤー順は新しいグループ構造で自動的に処理されるのでコードを削除
                }
            }
        } catch (error) {
            console.error('Error in emphasisCurve:', error);
        }
    }

    /**
     * 強調表示した曲線の色を更新
     */
    updateEmphasisCurveColor(color) {
        // ローカルの強調表示用曲線の色を更新
        if (this.emphasisPath) {
            this.emphasisPath.attr('stroke', color);
        }

        // GraphCalculator内の強調表示用曲線の色を更新
        if (this.graphCalculator && this.emphasisGraphCurveId) {
            this.graphCalculator.updateCurve(this.emphasisGraphCurveId, {
                color: color
            });
        }
    }

    /**
     * 強調表示した曲線の線の太さを更新
     */
    updateEmphasisCurveSize(size) {
        // ローカルの強調表示用曲線の太さを更新
        if (this.emphasisPath) {
            this.emphasisPath.attr('stroke-width', Number(size) + 6);
        }

        // GraphCalculator内の強調表示用曲線の太さを更新
        if (this.graphCalculator && this.emphasisGraphCurveId) {
            this.graphCalculator.updateCurve(this.emphasisGraphCurveId, {
                width: Number(size) + 8
            });
        }
    }

    /**
     * 曲線の強調表示を解除
     */
    delEmphasisCurve() {
        // ローカルの強調表示用曲線を削除
        d3.selectAll("#emphasisCurve").remove();
        this.emphasisPath = null;

        // GraphCalculator内の強調表示用曲線を削除
        if (this.graphCalculator && this.emphasisGraphCurveId) {
            this.graphCalculator.removeCurve(this.emphasisGraphCurveId);
            this.emphasisGraphCurveId = null;
        }
    }

    /**
     * 曲線の色の更新
     * @param {string} color - 新しい色
     */
    updateCurveColor(color) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            // const oldColor = this.curves[id].color;

            // D3パスの色を更新
            this.curves[id].path.attr('stroke', color);
            d3.select(`.color-icon[data-id='${id}']`).style('background-color', color);
            this.updateEmphasisCurveColor(color);

            this.uiManager.penToolManager.updateColorDisplayMini(color);

            // GraphCalculatorの曲線も更新
            if (this.graphCalculator && this.curves[id].graphCurve) {
                const graphCalcCurve = this.curves[id].graphCurve;
                this.graphCalculator.updateCurve(graphCalcCurve.id, { color: color });
            }

            // if (oldColor !== color) {
            //   this.curves[id].color = color;
            // }
        }
    }

    /**
     * 曲線の線の太さの更新
     * @param {number} size - 新しい太さ
     */
    updateCurveSize(size) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            // const oldSize = this.curves[id].size;

            // D3パスの太さを更新
            this.curves[id].path.attr('stroke-width', size);
            this.updateEmphasisCurveSize(Number(size));

            // GraphCalculatorの曲線も更新
            if (this.graphCalculator && this.curves[id].graphCurve) {
                const graphCalcCurve = this.curves[id].graphCurve;
                this.graphCalculator.updateCurve(graphCalcCurve.id, { width: size });
            }

            // this.curves[id].size = size;
        }
    }

    /**
     * サイズ変更を履歴に記録
     * @param {number} newSize - 新しい太さ
     */
    recordSizeChange(newSize) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            const oldSize = this.curves[id].size;

            // 履歴に記録
            if (oldSize !== newSize) {
                this.historyManager.addAction({
                    type: 'size',
                    id: id,
                    oldSize: oldSize,
                    newSize: newSize
                });
            }
        }
    }

    /**
     * 色変更を履歴に記録
     * @param {string} newColor - 新しい色
     */
    recordColorChange(newColor) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            const oldColor = this.curves[id].color;

            // 履歴に記録
            if (oldColor !== newColor) {
                this.historyManager.addAction({
                    type: 'color',
                    id: id,
                    oldColor: oldColor,
                    newColor: newColor
                });
            }
        }
    }

    /**
     * キャンバスのクリア
     */
    clearCanvas() {
        this.historyManager.addAction({
            type: 'clear',
            curves: [...this.curves]
        });

        // D3パスの削除
        this.g.selectAll('*').remove();

        // GraphCalculatorの曲線も削除
        if (this.graphCalculator) {
            this.curves.forEach(curve => {
                if (curve && curve.graphCurve) {
                    this.graphCalculator.removeCurve(curve.graphCurve.id);
                }
            });
        }

        this.curves = [];
        this.updateCurveList();
        this.settings.nextCurveId = 0;
    }

    /**
     * ドラッグ開始
     */
    dragStart(event) {
        const curveId = event.target.getAttribute('data-id');
        if (curveId) {
            event.dataTransfer.setData('text/plain', curveId);
            event.target.classList.add('dragging');
            this.settings.selectCurveId = null;
        }
    }

    /**
     * ドラッグ中
     */
    dragOver(event) {
        event.preventDefault();
    }

    /**
     * ドロップ処理
     */
    drop(event) {
        event.preventDefault();
        // デバッグログを追加してdataTransferの内容を確認
        console.log('Drop event data:', event.dataTransfer.getData('text'));

        const draggedId = parseInt(event.dataTransfer.getData('text'));
        if (isNaN(draggedId)) {
            console.error('Invalid dragged ID:', event.dataTransfer.getData('text'));
            return;
        }

        // 追加: クリアキャンバス領域へのドロップ判定
        const clearCanvasElem = document.getElementById('clear-canvas');
        if (clearCanvasElem && clearCanvasElem.contains(event.target)) {
            console.log(`削除対象の曲線ID: ${draggedId}`);
            // ドラッグされたアイテムを削除するよう修正
            this.deleteCurve({ target: { dataset: { id: draggedId } } });
            return;
        }

        const targetItem = event.target.closest('.curve-item');
        if (targetItem) {
            const targetId = parseInt(targetItem.querySelector('.curve-id').textContent);
            if (draggedId !== targetId) {
                this.reorderCurves(draggedId, targetId);
            }
        }
    }

    /**
     * ドラッグ終了
     */
    dragEnd(event) {
        event.target.classList.remove('dragging');
    }

    /**
     * 曲線の描画順番変更
     */
    reorderCurves(fromId, toId) {
        const curve = this.curves[fromId];
        this.curves.splice(fromId, 1);
        this.curves.splice(toId, 0, curve);

        // idを昇順に更新
        this.curves.forEach((curve, index) => {
            if (curve) {
                curve.id = index;
            }
        });

        this.updateCurveList();

        // 曲線リストの更新後に色アイコンの背景色を確実に再設定
        this.curves.forEach((curve, index) => {
            if (curve) {
                const colorIcon = document.querySelector(`.color-icon[data-id="${index}"]`);
                if (colorIcon) {
                    colorIcon.style.backgroundColor = curve.color;
                    // 可視性の状態も確実に同期
                    if (curve.isHidden) {
                        colorIcon.classList.add('hidden-curve');
                    } else {
                        colorIcon.classList.remove('hidden-curve');
                    }
                }
            }
        });

        this.redrawCurves();
        this.historyManager.addAction({
            type: 'reorder',
            fromId: fromId,
            toId: toId
        });
    }

    /**
     * 曲線の再描画
     * @param {boolean} useGraphCalculator - GraphCalculatorを使用して曲線を更新するかどうか
     */
    redrawCurves(useGraphCalculator = false) {
        // 選択中の曲線IDを保存
        const selectedCurveId = this.settings.selectCurveId;

        // すべての強調表示を削除
        this.delEmphasisCurve();

        this.g.selectAll('*').remove();

        this.curves.forEach(curve => {
            if (curve) {
                if (useGraphCalculator && this.graphCalculator && curve.graphCurve) {
                    // GraphCalculatorから最新のパスデータを取得
                    const curveObj = this.graphCalculator.getCurve(curve.graphCurve.id);
                    if (curveObj && curveObj.path) {
                        const pathData = curveObj.path.getAttribute('d');
                        curve.path = this.g.append('path')
                            .attr('fill', 'none')
                            .attr('stroke', curve.color)
                            .attr('stroke-width', curve.size)
                            .attr('stroke-linecap', 'round')
                            .attr('d', pathData);
                    } else {
                        // GraphCalculatorから取得できない場合は既存のパスデータを使用
                        curve.path = this.g.append('path')
                            .attr('fill', 'none')
                            .attr('stroke', curve.color)
                            .attr('stroke-width', curve.size)
                            .attr('stroke-linecap', 'round')
                            .attr('d', curve.path.attr('d'));
                    }
                } else {
                    // 通常の再描画
                    curve.path = this.g.append('path')
                        .attr('fill', 'none')
                        .attr('stroke', curve.color)
                        .attr('stroke-width', curve.size)
                        .attr('stroke-linecap', 'round')
                        .attr('d', curve.path.attr('d'));
                }
            }
        });

        // 選択中の曲線があれば強調表示を復元
        if (selectedCurveId !== null && this.curves[selectedCurveId]) {
            setTimeout(() => {
                // curve-itemのdata-id属性 selectedCurveIdの選択状態を復元
                d3.select(`.curve-item[data-id='${selectedCurveId}']`).classed('selected', true);
                this.emphasisCurve(selectedCurveId);
            }, 10);
        }
    }

    /**
     * グラフ計算機のリサイズ後に曲線を更新
     */
    updateCurvesAfterResize() {
        if (!this.graphCalculator) return;

        // GraphCalculatorの曲線が更新されるのを待つ
        setTimeout(() => {
            this.redrawCurves(true);
        }, 10);
    }

    /**
     * GraphCalculatorの曲線IDからCurveManagerの曲線IDを取得
     * @param {string|number} graphCurveId - GraphCalculatorの曲線ID
     * @returns {number|null} CurveManagerの曲線ID、見つからない場合はnull
     */
    getCurveIdByGraphCurveId(graphCurveId) {
        for (let i = 0; i < this.curves.length; i++) {
            if (this.curves[i] && this.curves[i].graphCurve && this.curves[i].graphCurve.id == graphCurveId) {
                return i;
            }
        }
        return null;
    }

    /**
     * 曲線の詳細表示状態を取得
     * @param {number} id - 曲線ID
     * @returns {boolean} 詳細が表示されているか
     */
    getCurveDetailState(id) {
        if (id !== null && id >= 0 && id < this.curves.length && this.curves[id]) {
            return this.curves[id].isDetailShown;
        }
        return false;
    }

    /**
     * 曲線の詳細表示状態を設定
     * @param {number} id - 曲線ID
     * @param {boolean} detailShown - 詳細表示状態
     */
    setCurveDetailState(id, detailShown) {
        if (id !== null && id >= 0 && id < this.curves.length && this.curves[id]) {
            this.curves[id].isDetailShown = detailShown;

            // UI要素も更新
            const curveItem = d3.select(`.curve-item:nth-child(${id + 1})`);
            if (!curveItem.empty()) {
                curveItem.select('.curve-details').classed('hidden', !detailShown);
                curveItem.select('.curve-options').classed('hidden', !detailShown);
                curveItem.select('.details-dropdown').classed('rotated', detailShown);
            }
        }
    }

    /**
     * GraphCalculatorの曲線IDから曲線を選択
     * @param {string|number} graphCurveId - GraphCalculatorの曲線ID
     */
    selectCurveByGraphCurveId(graphCurveId) {
        const curveId = this.getCurveIdByGraphCurveId(graphCurveId);
        if (curveId !== null) {
            const curveItem = d3.select(`.curve-item:nth-child(${curveId + 1})`);
            if (!curveItem.empty()) {
                this.selectCurve(curveItem, curveId);
            }
        }
    }

    /**
     * 曲線の表示・非表示を設定
     * @param {number} id - 曲線ID
     * @param {boolean} visible - 表示するか
     */
    setCurveVisibility(id, visible) {
        const curve = this.curves[id];
        if (!curve) return;

        // 曲線の表示/非表示状態を設定
        curve.isHidden = !visible;

        // グラフ計算機のグループ要素の表示・非表示を設定
        if (this.graphCalculator) {
            this.graphCalculator.setCurveGroupVisibility(id, visible);
        }

        // アイコンUIの切り替え
        const colorIcon = document.querySelector(`.color-icon[data-id="${id}"]`);
        if (colorIcon) {
            if (!visible) {
                colorIcon.classList.add('hidden-curve');
            } else {
                colorIcon.classList.remove('hidden-curve');
            }
        } else {
            console.warn(`Color icon for curve ID ${id} not found.`);
        }
    }

    /**
     * 曲線のスタイル変更（色とサイズ）を記録
     * @param {string} newColor - 新しい色（色を変更しない場合は現在の色）
     * @param {number} newSize - 新しいサイズ（サイズを変更しない場合は現在のサイズ）
     */
    recordStyleChange(newColor, newSize) {
        if (this.settings.selectCurveId !== null) {
            console.log("recordStyleChange");
            const id = this.settings.selectCurveId;
            const curve = this.curves[id];

            if (!curve) return;

            const oldColor = curve.color;
            const oldSize = curve.size;
            console.log("recordStyleChange", oldColor, newColor, oldSize, newSize);

            // 何も変更がなければ何もしない
            if (oldColor === newColor && oldSize === newSize) return;
            console.log("recordStyleChange", oldColor, newColor, oldSize, newSize);

            // 履歴に追加
            this.historyManager.addAction({
                type: 'styleChange',
                id: id,
                oldStyle: {
                    color: oldColor,
                    size: oldSize
                },
                newStyle: {
                    color: newColor,
                    size: newSize
                }
            });

            // 実際に更新
            if (oldColor !== newColor) {
                // 色の更新
                curve.path.attr('stroke', newColor);
                d3.select(`.color-icon[data-id='${id}']`).style('background-color', newColor);
                this.updateEmphasisCurveColor(newColor);

                // GraphCalculatorの曲線も更新
                if (this.graphCalculator && curve.graphCurve) {
                    this.graphCalculator.updateCurve(curve.graphCurve.id, { color: newColor });
                }

                curve.color = newColor;
            }

            if (oldSize !== newSize) {
                // サイズの更新
                curve.path.attr('stroke-width', newSize);
                this.updateEmphasisCurveSize(Number(newSize));

                // GraphCalculatorの曲線も更新
                if (this.graphCalculator && curve.graphCurve) {
                    this.graphCalculator.updateCurve(curve.graphCurve.id, { width: newSize });
                }

                curve.size = newSize;
            }
        }
    }

    /**
     * 曲線の関数式を設定
     * @param {number} id - 曲線ID
     * @param {Array<string>} equations - 関数式の配列
     */
    setLatexEquations(id, equations) {
        // 曲線オブジェクト内に直接保存する方式に変更
        const curve = this.curves[id];
        if (curve) {
            curve.latexEquations = equations;
        }
    }

    /**
     * 数式をクリップボードにコピー
     * @param {string} formula - コピーする数式
     * @param {HTMLElement} buttonElement - コピーボタン要素
     */
    copyEquationToClipboard(formula, buttonElement) {
        try {
            // 数式から"y = "を除去（あれば）
            const cleanFormula = formula.replace(/^y\s*=\s*/, '');

            // クリップボードにコピー
            navigator.clipboard.writeText(cleanFormula).then(() => {
                // コピー成功時のアニメーション
                buttonElement.classList.add('copy-success');

                // アイコンを一時的に変更
                const originalHTML = buttonElement.innerHTML;
                buttonElement.innerHTML = '<i class="material-symbols-rounded">check</i>';

                // 元に戻す
                setTimeout(() => {
                    buttonElement.classList.remove('copy-success');
                    buttonElement.innerHTML = originalHTML;
                }, 1500);
            }).catch(err => {
                console.error('クリップボードへのコピーに失敗しました:', err);
                this.fallbackCopyToClipboard(cleanFormula, buttonElement);
            });
        } catch (err) {
            console.error('クリップボード操作エラー:', err);
            this.fallbackCopyToClipboard(formula, buttonElement);
        }
    }

    /**
     * クリップボードのフォールバック実装
     * @param {string} text - コピーするテキスト
     * @param {HTMLElement} buttonElement - コピーボタン要素
     */
    fallbackCopyToClipboard(text, buttonElement) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);

        try {
            textArea.select();
            document.execCommand('copy');

            // コピー成功時のアニメーション
            buttonElement.classList.add('copy-success');
            const originalHTML = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="material-symbols-rounded">check</i>';

            setTimeout(() => {
                buttonElement.classList.remove('copy-success');
                buttonElement.innerHTML = originalHTML;
            }, 1500);
        } catch (err) {
            console.error('フォールバックコピーに失敗しました:', err);
        } finally {
            document.body.removeChild(textArea);
        }
    }

    /**
     * 関数をハイライト表示 - EquationHighlighterを使用
     */
    highlightFunction(curveId, sectionIndex, equation) {
        if (!this.equationHighlighter || !this.curves[curveId]) return;
        return this.equationHighlighter.highlightEquation(this.curves[curveId], sectionIndex, equation);
    }

    /**
     * 関数ハイライトの解除 - EquationHighlighterを使用
     */
    unhighlightFunction() {
        if (!this.equationHighlighter) return;
        this.equationHighlighter.unhighlightEquation();
    }

    /**
     * 手書き曲線を追加（曲線近似を含む処理）
     * @param {number} id - 曲線のID
     * @param {Array} domainPath - ドメイン座標系の点列 [[x1,y1], [x2,y2], ...]
     * @param {string} color - 曲線の色
     * @param {number} size - 曲線の太さ
     * @param {boolean} useAdvancedMode - 高度な近似モードを使用するかどうか
     * @param {Object} approximatorSettings - 近似設定のオプション（節点を表示するなど）
     * @returns {Object} 追加結果 {success: boolean, message: string, curve: Object}
     */
    addHandDrawnCurve(id, domainPath, color, size, useAdvancedMode, approximatorSettings) {
        let result = {
            success: false,
            message: '',
            curve: null
        };

        // GraphCalculatorの曲線を追加
        let graphCurve = null;
        let latexEquations = []; // LaTeX方程式を保存用の変数を追加

        this.setApproximatorSettings(approximatorSettings);

        const approximationToAttempt = [
            // 折れ線関数
            this.piecewiseLinearApproximator.approximate(domainPath),
            // 定数関数, 一次関数
            this.linearApproximator.approximate(domainPath),
            // 二次関数
            this.quadraticApproximator.approximate(
                domainPath,
                this.graphCalculator.getDomain(),
                this.approximatorSettings
            )
        ]

        for (const approximation of approximationToAttempt) {
            if (approximation.success) {
                // 曲線を追加
                graphCurve = this.graphCalculator.addCurve(approximation.svgPath, {
                    id: id.toString(),
                    color: color,
                    width: size,
                    opacity: 1
                });

                // 曲線のタイプ
                const type = approximation.type;

                // LaTeX方程式を保存
                latexEquations = approximation.latexEquations;

                // 節点座標を取得して保存
                const knotPoints = approximation.knots.map(knot => ({
                    x: knot[0],
                    y: knot[1]
                }));

                const preKnots = approximation.preKnots || []; // 事前に計算されたノットを保存

                const savedKnots = [];
                knotPoints.forEach(knot => {
                    const point = this.graphCalculator.addPoint(graphCurve.id, knot.x, knot.y, {
                        // 節点のスタイルを変更する場合
                        //  color: color,
                        //  size: 12,
                        //  shape: 'hollowCircle',
                    });

                    if (point) {
                        savedKnots.push({
                            x: knot.x,
                            y: knot.y,
                            point: point, // 後で削除する  
                        });
                    }
                });

                // 曲線を追加（節点データも含めて）
                this.addCurve(id, type, d3.select(graphCurve.path),
                    color, size, graphCurve, latexEquations, approximatorSettings,
                    preKnots, 2, this.approximatorSettings.maxKnots, domainPath);

                // 節点の表示がfalseなら非表示に切り替え
                if (!approximatorSettings.showKnotsDefault) {
                    this.equationHighlighter.toggleKnotPoints(id);
                }

                // 節点データを保存
                const curve = this.curves[this.curves.length - 1];
                curve.knotPoints = savedKnots;
                curve.originalPoints = domainPath; // 元の点列も保存しておく

                result.success = true;
                result.message = approximation.type + 'として近似しました';
                result.curve = graphCurve;
                return result;
            }
        }

        // 単調増加でないが拡張モードの場合は特別な処理
        if (useAdvancedMode) {
            try {
                // 通常の曲線として追加（将来的に特別な近似法を実装可能）
                graphCurve = this.graphCalculator.addCurve(domainPath, {
                    id: id.toString(),
                    color: color,
                    width: size,
                    opacity: 1
                });

                // 曲線を追加
                this.addCurve(id, 'parametric', d3.select(graphCurve.path), color, size, graphCurve, [], approximatorSettings);

                result.success = true;
                result.message = '拡張モードで曲線を追加しました（近似なし）';
                result.curve = graphCurve;
                return result;
            } catch (error) {
                result.message = '拡張モードでの曲線追加に失敗しました: ' + error.message;
                return result;
            }
        }

        // 単調増加で近似失敗、拡張モードでも近似失敗した場合
        result.message = '近似処理に失敗しました: ';
        return result;
    }

    /**
     * 二次曲線近似の節点数を調整するスライダーを作成
     * @param {d3.Selection} container - スライダーを追加するコンテナ要素
     * @param {number} curveId - 曲線ID
     */
    createKnotCountSlider(container, curveId) {
        const curve = this.curves[curveId];
        if (!curve || !curve.graphCurve) return;

        // スライダーのラッパー要素
        const sliderWrapper = container.append('div')
            .attr('class', 'knot-slider-wrapper')

        // スライダーのラベル
        const labelElement = sliderWrapper.append('span')
            .attr('class', 'knot-slider-label')
            .attr('data-i18n', 'curve.knot_slider.label')
            .text('節点数:')
            .node();  // DOMノードを取得

        // 言語を適用
        this.updateKnotCountLabel(labelElement);

        // 現在の数（デフォルトは近似設定から取得）
        const currentKnotCount = curve.knotCount || curve.latexEquations.length + 1 || this.approximatorSettings.maxKnots;
        const minKnots = curve.minKnots || 2;
        const maxKnots = curve.maxKnots || 10;

        // 現在の値を表示
        const valueDisplay = sliderWrapper.append('span')
            .attr('class', 'knot-count-value')
            .text(currentKnotCount);

        // スライダー作成
        const slider = sliderWrapper.append('input')
            .attr('type', 'range')
            .attr('class', 'knot-count-slider')
            .attr('min', minKnots)
            .attr('max', maxKnots)
            .attr('step', 1)
            .attr('value', currentKnotCount)
            .attr('data-curve-id', curveId);

        // 値変更時のハンドラ
        let timeout = null;
        slider.on('input', (event) => {
            const value = parseInt(event.target.value);
            valueDisplay.text(value); // 即座に表示を更新

            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                const curve = this.curves[curveId];
                if (!curve || !curve.originalPoints || !this.graphCalculator) return;

                // カスタムノットを作成
                const domain = this.graphCalculator.getDomain();
                const customKnots = curve.preKnots
                    .filter(k => k.knot >= 0 && k.knot <= 1) // 内部ノットのみ抽出
                    .sort((a, b) => a.priority - b.priority) // 優先度でソート
                    .slice(0, value) // 新しい節点数に制限
                    .sort((a, b) => a.knot - b.knot) // x座標でソート
                    .map(k => domain.xMin + k.knot * (domain.xMax - domain.xMin)); // グラフ座標系に変換

                // 新しい近似を計算
                const result = this.quadraticApproximator.approximateWithCustomKnots(
                    curve.originalPoints,
                    customKnots,
                    domain,
                    this.approximatorSettings
                );

                if (result.success) {
                    // GraphCalculatorの曲線を更新
                    this.graphCalculator.updateCurve(curve.graphCurve.id, {
                        path: result.svgPath
                    });

                    // 節点を更新
                    this.graphCalculator.removeAllPoints(curve.graphCurve.id);
                    result.knots.forEach(knot => {
                        this.graphCalculator.addPoint(curve.graphCurve.id, knot[0], knot[1], {
                            color: curve.color,
                            size: 10,
                            shape: 'hollowCircle',
                        });
                    });

                    // 曲線オブジェクトを更新
                    curve.latexEquations = result.latexEquations;
                    curve.knotPoints = result.knots;
                    curve.knotCount = value;

                    // 曲線リストを更新して数式を反映
                    console.log(curve.graphCurve.id);
                    this.updateCurveListById(curve.graphCurve.id);
                    // this.updateCurveList();
                }
            }, 100); // デバウンス
        });

        // スライダー値の初期設定
        curve.knotCount = currentKnotCount;
    }


    /**
     * 指定したタイプの曲線近似の結果だけを取得するメソッド
     * @param {string} type - 曲線のタイプ（'quadratic', 'linear', 'piecewiseLinear' など）
     * @param {Array} points - 近似に使う点列 [[x1, y1], [x2, y2], ...]
     * @param {Object} options - 近似用オプション（必要に応じて）
     * @returns {Object} 近似結果オブジェクト（svgPath, latexEquations, knots, preKnots など）
     */
    getCurveApproximationResult(type, points, options = {}) {
        if (!type || !points || !Array.isArray(points)) return null;
        switch (type) {
            case 'constant':
            case 'vertical':
            case 'linear':
                // 一次関数近似
                return this.linearApproximator.approximate(points);

            case 'quadratic':
                // 二次Bスプライン近似
                return this.quadraticApproximator.approximate(
                    points,
                    this.graphCalculator ? this.graphCalculator.getDomain() : undefined,
                    { ...this.approximatorSettings, ...options }
                );
            case 'piecewiseLinear':
                // 折れ線近似
                return this.piecewiseLinearApproximator.approximate(points);
            default:
                return null;
        }
    }

    /**
     * 指定した曲線IDの.equations-container内の数式DOMだけを更新する
     * @param {number} curveId - 曲線ID
     * @param {Array} latexEquations - LaTeX形式の数式配列（省略時はcurve.latexEquationsを使用）
     */
    updateEquationsContainer(curveId, latexEquations = null) {
        const curve = this.curves[curveId];
        if (!curve) return;
        const equations = latexEquations || curve.latexEquations;

        const curveItem = document.querySelector(`.curve-item[data-id="${curveId}"]`);
        if (!curveItem) return;
        const container = curveItem.querySelector('.equations-container');
        if (!container) return;

        if (equations && Array.isArray(equations) && equations.length > 0) {
            // 数式を再描画
            let html = '<div class="equations-timeline">';
            if (typeof equations[0] === 'object' && equations[0].domain) {
                html += `<div class="domain-marker">${equations[0].domain.start}</div>`;
            }
            equations.forEach((eq, i) => {
                if (typeof eq === 'object' && eq.formula && eq.domain) {
                    html += `
            <div class="equation-item" data-section-index="${i}" data-curve-id="${curveId}">
              <div class="equation-content" data-section-index="${i}" data-curve-id="${curveId}">
                <button class="equation-copy-btn" title="数式をコピー">
                  <i class="material-symbols-rounded">content_copy</i>
                </button>
                <div class="katex-display"></div>
              </div>
            </div>
            <div class="domain-marker">${eq.domain.end}</div>
          `;
                }
            });
            html += '</div>';
            container.innerHTML = html;

            // KaTeX描画とイベント再設定
            equations.forEach((eq, i) => {
                if (typeof eq === 'object' && eq.formula && eq.domain) {
                    const equationContent = container.querySelector(`.equation-content[data-section-index="${i}"][data-curve-id="${curveId}"]`);
                    const katexContainer = equationContent.querySelector('.katex-display');
                    try {
                        katex.render(eq.formula, katexContainer, {
                            throwOnError: false,
                            displayMode: true
                        });
                    } catch (e) {
                        katexContainer.textContent = eq.formula;
                    }
                    // コピーイベント
                    const copyButton = equationContent.querySelector('.equation-copy-btn');
                    copyButton.onclick = (event) => {
                        event.stopPropagation();
                        this.copyEquationToClipboard(eq.formula, copyButton);
                    };
                    // ハイライトイベント
                    equationContent.onmouseenter = () => this.highlightFunction(curveId, i, eq);
                    equationContent.onmouseleave = () => this.unhighlightFunction();
                }
            });
        } else {
            container.innerHTML = '<p class="no-equation">関数式は利用できません</p>';
        }
    }

    updateKnotCountLabel(element) {
        if (this.languageManager && element) {
            this.languageManager.updateSpecificElement(element);
        }
    }

}
