// 必要なインポートを追加
import { EquationHighlighter } from './EquationHighlighter.js';
import { toRPN } from '../util/NumberUtil.js';
import { QuadraticBSplineCurveApproximator } from '../approximator/quadratic/QuadraticBSplineCurveApproximator.js';
import { LinearFunctionApproximator } from '../approximator/linear/LinearFunctionApproximator.js';
import { PiecewiseLinearApproximator } from '../approximator/linear/PiecewiseLinearApproximator.js';
import { SingleQuadraticBezierApproximator } from '../approximator/quadratic/SingleQuadraticBezierApproximator.js';
import { QuadraticBezierChainApproximator } from '../approximator/quadratic/QuadraticBezierChainApproximator.js';
import { SingleCircleApproximator } from '../approximator/circle/SingleCircleApproximator.js';
import { SelectiveCurveApproximator } from '../approximator/selective/SelectiveCurveApproximator.js';
import {
    createDefaultModel as createApproxSettingsModel,
    mergeModel as mergeApproxSettings,
    resolveSettings as resolveApproxSettings,
    cloneModel as cloneApproxSettingsModel
} from '../util/ApproximatorSettings.js';
/**
 * カーブ管理クラス
 * 曲線の追加、更新、削除などの操作を担当
 */
export class CurveManager {
    constructor(settings, historyManager, graphCalculator = null, languageManager) {
        this.settings = settings;
        this.historyManager = historyManager;
        this.graphCalculator = graphCalculator; // GraphCalculator参照を保持
        this.curves = [];
        this.g = null;
        this.emphasisPath = null;
        this.emphasisGraphCurveId = null; // GraphCalculator内の強調表示用曲線ID
        this.emphasisTargetCurveId = null; // 強調表示中の元曲線ID
        this.uiManager = null;
        this.languageManager = languageManager;

        // 数式ハイライト機能クラスを初期化
        this.equationHighlighter = graphCalculator ? new EquationHighlighter(graphCalculator) : null;

        this.quadraticApproximator = new QuadraticBSplineCurveApproximator(this.settings);
        this.linearApproximator = new LinearFunctionApproximator(this.settings);
        this.piecewiseLinearApproximator = new PiecewiseLinearApproximator(this.settings);
        this.singleQuadraticApproximator = new SingleQuadraticBezierApproximator(this.settings);
        this.singleCircleApproximator = new SingleCircleApproximator(this.settings);
        this.quadraticBezierChainApproximator = new QuadraticBezierChainApproximator(this.settings);
        this.selectiveCurveApproximator = new SelectiveCurveApproximator(this.settings);

        this._approximatorSettingsModel = createApproxSettingsModel();
        this.approximatorSettings = resolveApproxSettings(this._approximatorSettingsModel);
        this._syncApproximatorOptions(this.approximatorSettings);
    }

    /**
     * スライダーの値をプログラムから設定するための最小API
     * UI（スライダー）を更新し、節点数を適用する
     * @param {number} curveId
     * @param {number} value
     * @param {boolean} suppressHistory
     */
    setKnotCountSliderValue(curveId, value, suppressHistory = false) {
        // スライダー要素を探して値を反映
        const slider = document.querySelector(`.curve-item[data-id="${curveId}"] .knot-count-slider`);
        if (slider) slider.value = value;

        // 表示ラベルも更新
        const label = document.querySelector(`.curve-item[data-id="${curveId}"] .knot-count-value`);
        if (label) label.textContent = String(value);

        // 実際の適用は setKnotCount に委譲
        this.setKnotCount(curveId, Number(value), suppressHistory);
    }

    /**
     * 指定した曲線の節点数を適用するAPI
     * @param {number} curveId
     * @param {number} knotCount
     * @param {boolean} suppressHistory - true の場合は履歴に追加しない
     */
    setKnotCount(curveId, knotCount, suppressHistory = false) {
        const curve = this.curves[curveId];
        if (!curve || !curve.originalPoints || !this.graphCalculator) return;

        const domain = this.graphCalculator.getDomain();
        const customKnots = (curve.preKnots || [])
            .filter(k => k.priority < (knotCount - 2))
            .sort((a, b) => a.knot - b.knot);

        const result = this.quadraticApproximator.approximateWithCustomKnots(
            curve.originalPoints,
            customKnots,
            domain
        );

        if (!result.success) return;

        // 曲線を置換
        if (curve.graphCurve) {
            this.graphCalculator.updateCurve(curve.graphCurve.id, { path: result.svgPath });
            this.graphCalculator.removeAllPoints(curve.graphCurve.id);
            result.knots.forEach(knot => {
                const p = this.graphCalculator.addPoint(curve.graphCurve.id, knot[0], knot[1], {
                    color: curve.color,
                    size: 10,
                    shape: 'hollowCircle',
                });
                if (p && curve && curve.showKnots === false && p.group && p.group.style) p.group.style.display = 'none';
            });

            curve.latexEquations = result.latexEquations;
            curve.knotPoints = result.knots;
            curve.knotCount = knotCount;

            this.updateCurveListById(curve.graphCurve.id);

            // UI スライダーと表示を更新（undo/redo などプログラムからの呼び出しを反映）
            try {
                const curveItem = document.querySelector(`.curve-item[data-id="${curveId}"]`);
                if (curveItem) {
                    const valueDisplay = curveItem.querySelector('.knot-count-value');
                    const slider = curveItem.querySelector('.knot-count-slider');
                    if (valueDisplay) valueDisplay.textContent = String(knotCount);
                    if (slider) slider.value = String(knotCount);
                }
            } catch (e) {
                // ignore UI update errors
            }

            this.syncEmphasisCurvePath(curveId, curve.graphCurve.id, result.svgPath);
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

    setApproximatorSettings(options, meta = {}) {
        const previousSnapshot = JSON.stringify(this.approximatorSettings);
        const mergedModel = mergeApproxSettings(this._approximatorSettingsModel, options);
        const resolved = resolveApproxSettings(mergedModel);
        const nextSnapshot = JSON.stringify(resolved);

        if (previousSnapshot === nextSnapshot) {
            return this.approximatorSettings;
        }

        this._approximatorSettingsModel = mergedModel;
        this.approximatorSettings = resolved;
        this._syncApproximatorOptions(resolved);

        if (this.settings) {
            this.settings.showKnotsDefault = resolved.showKnotsDefault;
            this.settings.snap = resolved.snap;
        }

        if (!meta.silent) {
            const detail = {
                source: meta.source || 'curve-manager',
                settings: JSON.parse(JSON.stringify(resolved)),
                model: cloneApproxSettingsModel(this._approximatorSettingsModel),
                persist: meta.persist !== false
            };
            document.dispatchEvent(new CustomEvent('approximatorSettingsChanged', { detail }));
        }

        return this.approximatorSettings;
    }

    _syncApproximatorOptions(resolvedSettings) {
        if (!resolvedSettings) return;
        const categories = resolvedSettings.categories || {};
        const globalSnap = typeof resolvedSettings.snap === 'boolean' ? resolvedSettings.snap : false;

        const linearOptions = categories.linear || resolvedSettings.linear;
        if (this.linearApproximator) {
            const nextLinearOptions = {
                ...(linearOptions ? { ...linearOptions } : {}),
                snap: globalSnap
            };

            if (typeof this.linearApproximator.setOptions === 'function') {
                this.linearApproximator.setOptions(nextLinearOptions);
            } else if (this.linearApproximator.options) {
                this.linearApproximator.options = {
                    ...this.linearApproximator.options,
                    ...nextLinearOptions
                };
            }
        }

        const piecewiseOptions = categories.piecewiseLinear || resolvedSettings.piecewiseLinear;
        if (this.piecewiseLinearApproximator) {
            const nextPiecewiseOptions = {
                ...(piecewiseOptions ? { ...piecewiseOptions } : {}),
                snap: globalSnap
            };

            if (typeof this.piecewiseLinearApproximator.setOptions === 'function') {
                this.piecewiseLinearApproximator.setOptions(nextPiecewiseOptions);
            } else if (this.piecewiseLinearApproximator.options) {
                this.piecewiseLinearApproximator.options = {
                    ...this.piecewiseLinearApproximator.options,
                    ...nextPiecewiseOptions
                };
            }
        }

        const quadraticOptions = categories.quadraticBSpline || resolvedSettings.quadraticBSpline;
        if (quadraticOptions && this.quadraticApproximator) {
            if (typeof this.quadraticApproximator.setOptions === 'function') {
                this.quadraticApproximator.setOptions({ ...quadraticOptions });
            } else if (this.quadraticApproximator.options) {
                this.quadraticApproximator.options = {
                    ...this.quadraticApproximator.options,
                    ...quadraticOptions
                };
            }
        }

        const singleQuadraticOptions = categories.singleQuadratic || resolvedSettings.singleQuadratic;
        if (singleQuadraticOptions && this.singleQuadraticApproximator) {
            if (typeof this.singleQuadraticApproximator.setOptions === 'function') {
                this.singleQuadraticApproximator.setOptions({ ...singleQuadraticOptions });
            } else if (this.singleQuadraticApproximator.options) {
                this.singleQuadraticApproximator.options = {
                    ...this.singleQuadraticApproximator.options,
                    ...singleQuadraticOptions
                };
            }
        }

        const singleCircleOptions = categories.singleCircle || resolvedSettings.singleCircle;
        if (singleCircleOptions && this.singleCircleApproximator) {
            if (typeof this.singleCircleApproximator.setOptions === 'function') {
                this.singleCircleApproximator.setOptions({ ...singleCircleOptions });
            } else if (this.singleCircleApproximator.options) {
                this.singleCircleApproximator.options = {
                    ...this.singleCircleApproximator.options,
                    ...singleCircleOptions
                };
            }
        }

        const quadraticChainOptions = categories.quadraticChain || resolvedSettings.quadraticChain;
        if (quadraticChainOptions && this.quadraticBezierChainApproximator) {
            if (typeof this.quadraticBezierChainApproximator.setOptions === 'function') {
                this.quadraticBezierChainApproximator.setOptions({ ...quadraticChainOptions });
            } else if (this.quadraticBezierChainApproximator.options) {
                this.quadraticBezierChainApproximator.options = {
                    ...this.quadraticBezierChainApproximator.options,
                    ...quadraticChainOptions
                };
            }
        }

        const selectiveOptions = categories.selective || resolvedSettings.selective;
        if (selectiveOptions && this.selectiveCurveApproximator) {
            if (typeof this.selectiveCurveApproximator.setOptions === 'function') {
                this.selectiveCurveApproximator.setOptions({ ...selectiveOptions });
            } else if (this.selectiveCurveApproximator.options) {
                this.selectiveCurveApproximator.options = {
                    ...this.selectiveCurveApproximator.options,
                    ...selectiveOptions
                };
            }
        }
    }

    /**
     * 曲線の追加
     * @param {Object} descriptor - 曲線の属性を含むオブジェクト
     */
    addCurve(descriptor) {
        if (typeof descriptor !== 'object' || descriptor === null) {
            console.error('CurveManager.addCurve: descriptor object required');
            return;
        }

        const curve = {
            id: descriptor.id,
            type: descriptor.type,
            path: descriptor.path,
            color: descriptor.color,
            size: descriptor.size,
            // 移動ロックフラグ（true の場合は個別移動が禁止される）
            locked: descriptor.locked || false,
            isHidden: false,        // 曲線の表示・非表示状態
            isDetailShown: true,    // 詳細情報をデフォルトで開く
            graphCurve: descriptor.graphCurve || null,  // GraphCalculatorの曲線オブジェクトを保存
            latexEquations: descriptor.latexEquations || [],  // 数式を曲線オブジェクト内に直接保存
            preKnots: descriptor.preKnots || [],  // 二次曲線近似用の節点
            knotCount: (descriptor.latexEquations && Array.isArray(descriptor.latexEquations)) ? descriptor.latexEquations.length + 1 : 0, // 二次曲線近似用の節点数
            originalPoints: descriptor.originalPoints || null, // 近似に必要なため元の点データを保存
            minKnots: descriptor.minKnots || 2, // 節点の最小数
            maxKnots: descriptor.maxKnots || 10, // 節点の最大数
            approximationType: descriptor.approximationType || descriptor.type || null,
            approximationData: descriptor.approximationData || null,
            approximationDiagnostics: descriptor.approximationDiagnostics || null,
            selectedApproximator: descriptor.selectedApproximator || null,
            approximatorPriority: descriptor.approximatorPriority ?? null,
        };

        const targetId = descriptor.id;

        // もし placeholder が既に存在する場合はそれを置換して参照を保つ
        if (this.curves[targetId]) {
            this.curves[targetId] = curve;
        } else {
            this.curves.push(curve);
        }

        // UI リストは既に placeholder を追加済みの場合は差分更新のみ行う
        try {
            // Use descriptor values to avoid passing objects to DOM attrs
            this.addCurveToList(targetId, descriptor.color, descriptor.size, true, this.approximatorSettings, descriptor.type);
        } catch (e) {
            // UI が無ければ無視
        }

        // 履歴に追加（placeholder があっても実体曲線を渡す）
        this.historyManager.addAction({
            type: 'add',
            curve: this.curves[targetId]
        });
    }

    /**
     * 曲線リストに追加
     */
    addCurveToList(id, color, size, hidden, options, type) {
        const curveList = d3.select('#curve-list');
        const curve = this.curves[id];

        // 曲線の非表示状態と詳細情報の表示状態を取得
        const isHidden = curve ? curve.isHidden : hidden;
        const isDetailShown = curve ? curve.isDetailShown : true;
        const iconType = type || curve?.approximationType || curve?.type || 'linear';

        let curveItem = d3.select(`#curve-list .curve-item[data-id="${id}"]`);
        if (curveItem && curveItem.node()) {
            curveItem.html('');
        } else {
            curveItem = curveList.append('div')
                .attr('class', 'curve-item')
                .attr('data-id', id);
        }

        curveItem.append('span')
            .attr('class', 'curve-id no-copy')
            .text(id);

        const curveSetting = curveItem.append('div')
            .attr('class', 'curve-setting')
            .attr('draggable', true)
            .attr('data-id', id)
            .html(`
                                <div class="color-icon ignore-selection ${isHidden ? "hidden-curve" : ""}" style="background-color: ${color};" data-id="${id}">
                                    ${this.getColorIconSVG(iconType, 'white')}
                </div>
                <button class="curve-option-btn jump-to-curve-btn ignore-selection" data-id="${id}">
                    <i class="material-symbols-rounded none-event">jump_to_element</i>
                </button>
                <button class="curve-option-btn lock-toggle ignore-selection" data-id="${id}" title="Lock movement">
                    <i class="material-symbols-rounded none-event">lock_open</i>
                </button>
                <button class="details-dropdown ignore-selection ${isDetailShown ? "" : "rotated"}" data-id="${id}">
                    <i class="material-symbols-rounded none-event">expand_more</i>
                </button>
                <button class="delete-btn ignore-selection" data-id="${id}">
                    <i class="material-symbols-rounded none-event">close_small</i>
                </button>
            `);


        // 曲線の詳細部分を追加
        const curveDetails = curveItem.append('div')
            .attr('class', `curve-details ${isDetailShown ? "" : "hidden"}`);

        const curveOptions = curveDetails.append('div')
            .attr('class', 'curve-options');

        // 初期表示状態は曲線個別のフラグを優先
        const initialShowKnots = (curve && typeof curve.showKnots !== 'undefined') ? curve.showKnots : this.approximatorSettings.showKnotsDefault;
        this.createCurveOptionButton(curveOptions, id, {
            iconName: 'commit',
            initialActive: initialShowKnots,
            title: 'Show knots',
            onClick: (curveId, isActive, buttonElement) => {
                // 節点表示フラグを更新して DOM を切り替える
                const c = this.curves[curveId];
                if (c) c.showKnots = isActive;

                if (!this.graphCalculator) return;
                const gc = this.graphCalculator.getCurve(c?.graphCurve?.id || c?.graphCurve || curveId);
                if (!gc || !Array.isArray(gc.points)) return;
                gc.points.forEach(p => { if (p && p.group && p.group.style) p.group.style.display = isActive ? '' : 'none'; });
            }
        });

        // Lock toggle: UI にボタンが静的に挿入されているため、ここで初期状態の反映とクリック処理を結びつける
        try {
            const lockBtn = curveItem.node().querySelector('.lock-toggle');
            if (lockBtn) {
                const iconEl = lockBtn.querySelector('i.material-symbols-rounded');
                const isLocked = (curve && !!curve.locked);
                if (isLocked) {
                    lockBtn.classList.add('active');
                    if (iconEl) iconEl.textContent = 'lock';
                } else {
                    lockBtn.classList.remove('active');
                    if (iconEl) iconEl.textContent = 'lock_open';
                }

                lockBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const btn = ev.currentTarget;
                    const willLock = !btn.classList.contains('active');
                    btn.classList.toggle('active', willLock);
                    if (iconEl) iconEl.textContent = willLock ? 'lock' : 'lock_open';
                    // 曲線オブジェクトに反映
                    if (this.curves[id]) this.curves[id].locked = willLock;
                });
            }
        } catch (e) {
            // ignore UI binding errors
        }

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
                    .text(curve.latexEquations[0].domain.start.replace(/\.(00|0)$/, ''));
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
                        .text(eq.domain.end.replace(/\.(00|0)$/, ''));

                    // Render equation with KaTeX (prefer structured latex, fall back to formula)
                    setTimeout(() => {
                        const displayFormula = (eq && (eq.latex || eq.formula)) ? (eq.latex || eq.formula) : '';
                        try {
                            katex.render(displayFormula, katexContainer.node(), {
                                throwOnError: false,
                                displayMode: true
                            });

                            copyButton.on('click', (event) => {
                                event.stopPropagation();
                                this.copyEquationToClipboard(eq, copyButton.node());
                            });

                            // EquationHighlighterを使って数式ハイライト機能を追加
                            equationContent
                                .on('mouseenter', () => this.highlightFunction(id, i, eq))
                                .on('mouseleave', () => this.unhighlightFunction())

                        } catch (e) {
                            console.error('KaTeX rendering failed:', e);
                            katexContainer.text(displayFormula);

                            copyButton.on('click', (event) => {
                                event.stopPropagation();
                                this.copyEquationToClipboard(eq, copyButton.node());
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

            // 特定の要素（.ignore-selection）が押された場合は選択処理を無視
            if (event.target.closest('.ignore-selection')) {
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

        // ボタン類のクリックはここで委譲処理する（jump/details/delete/visibility）
        curveSetting.on('click', (event) => {
            // ジャンプボタン
            const jumpBtn = event.target.closest('.jump-to-curve-btn');
            if (jumpBtn) {
                event.stopPropagation();
                const cid = Number(jumpBtn.getAttribute('data-id'));
                window.GraPen.jumpToCurve(cid, { animate: true });
                return;
            }

            // 詳細表示切替ボタン
            const detailsBtn = event.target.closest('.details-dropdown');
            if (detailsBtn) {
                event.stopPropagation();
                const did = Number(detailsBtn.getAttribute('data-id'));
                this.toggleDetailVisibility(did);
                return;
            }

            // 削除ボタン
            const delBtn = event.target.closest('.delete-btn');
            if (delBtn) {
                event.stopPropagation();
                const did = Number(delBtn.getAttribute('data-id'));
                this.deleteCurve({ target: { dataset: { id: did } } });
                return;
            }

            // 色アイコン（表示/非表示切替）
            const colorBtn = event.target.closest('.color-icon');
            if (colorBtn) {
                event.stopPropagation();
                const cid2 = Number(colorBtn.getAttribute('data-id'));
                try {
                    this.toggleCurveVisibility(cid2);
                } catch (e) {
                    if (typeof window !== 'undefined' && window.GraPen && typeof window.GraPen.toggleCurveVisibility === 'function') {
                        window.GraPen.toggleCurveVisibility(cid2);
                    }
                }
                return;
            }
        });
        // --- ここまでクリック/ドラッグ判定 ---

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

                // インジケーター更新
                this._updateDragIndicator(pos);
            } catch (err) {
                console.error('ドラッグ移動エラー:', err);
            }
        });
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

            // Note: dropping onto the former trash area no longer deletes the curve.
            if (this._dragInsertIndex !== undefined && this._draggedCurveId !== null) {
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

        if (!this.curves[id]) return;

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
        // 選択解除: UI と内部状態を元に戻す
        if (this.uiManager && this.uiManager.penToolManager && typeof this.uiManager.penToolManager.resetToDefault === 'function') {
            this.uiManager.penToolManager.resetToDefault();
        }
        d3.selectAll('.curve-item').classed('selected', false);
        this.delEmphasisCurve();
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

        // Guard against missing curve (could be placeholder removed)
        if (!this.curves[id]) return;

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
        if (!curve) return;
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
                this.addCurveToList(index, curve.color, curve.size, curve.hidden, this.approximatorSettings, curve.type);
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

            this.emphasisTargetCurveId = id;

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
            this.emphasisTargetCurveId = null;
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
     * 強調表示中の曲線のパスを最新の形状に同期する
     * @param {number|string} curveId - 曲線リスト上のID
     * @param {string} graphCurveId - GraphCalculator上の曲線ID
     * @param {string} pathData - 新しいSVGパスデータ
     */
    syncEmphasisCurvePath(curveId, graphCurveId, pathData) {
        if (!pathData) return;

        const matchesTarget = this.emphasisTargetCurveId !== null
            ? String(this.emphasisTargetCurveId) === String(curveId)
            : false;

        if (!matchesTarget) {
            return;
        }

        if (this.emphasisPath) {
            this.emphasisPath.attr('d', pathData);
        }

        if (this.graphCalculator && this.emphasisGraphCurveId && graphCurveId) {
            const expectedId = `emphasis-${graphCurveId}`;
            if (this.emphasisGraphCurveId === expectedId) {
                this.graphCalculator.updateCurve(this.emphasisGraphCurveId, {
                    path: pathData
                });
            }
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

        this.emphasisTargetCurveId = null;
    }

    /**
     * 曲線の色の更新
     * @param {string} color - 新しい色
     */
    updateCurveColor(color) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            const curve = this.curves[id];
            if (!curve) return;

            const previousColor = curve.color;
            const normalizedPrevious = typeof previousColor === 'string' ? previousColor.toUpperCase() : previousColor;
            const normalizedNext = typeof color === 'string' ? color.toUpperCase() : color;

            if (curve._pendingColorHistory === undefined && normalizedPrevious !== normalizedNext) {
                curve._pendingColorHistory = previousColor;
            }

            if (normalizedPrevious === normalizedNext) {
                return;
            }

            // D3パスの色を更新
            curve.path.attr('stroke', color);
            d3.select(`.color-icon[data-id='${id}']`).style('background-color', color);
            this.updateEmphasisCurveColor(color);

            if (this.uiManager && this.uiManager.penToolManager) {
                this.uiManager.penToolManager.updateColorDisplayMini(color);
            }

            // GraphCalculatorの曲線も更新
            if (this.graphCalculator && curve.graphCurve) {
                const graphCalcCurve = curve.graphCurve;
                this.graphCalculator.updateCurve(graphCalcCurve.id, { color: color });
            }

            curve.color = color;
            this.settings.currentColor = color;

        }
    }

    /**
     * 曲線の線の太さの更新
     * @param {number} size - 新しい太さ
     */
    updateCurveSize(size) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            const curve = this.curves[id];
            if (!curve) return;

            const numericSize = Number(size);
            if (Number.isNaN(numericSize)) return;

            const previousSize = Number(curve.size);
            if (curve._pendingSizeHistory === undefined && previousSize !== numericSize) {
                curve._pendingSizeHistory = previousSize;
            }

            if (previousSize === numericSize) {
                return;
            }

            // D3パスの太さを更新
            curve.path.attr('stroke-width', numericSize);
            this.updateEmphasisCurveSize(numericSize);

            // GraphCalculatorの曲線も更新
            if (this.graphCalculator && curve.graphCurve) {
                const graphCalcCurve = curve.graphCurve;
                this.graphCalculator.updateCurve(graphCalcCurve.id, { width: numericSize });
            }

            if (this.uiManager && this.uiManager.penToolManager) {
                this.uiManager.penToolManager.updateSizeDisplayMini(numericSize);
            }

            curve.size = numericSize;
            this.settings.currentSize = numericSize;
        }
    }

    /**
     * サイズ変更を履歴に記録
     * @param {number} newSize - 新しい太さ
     */
    recordSizeChange(newSize, oldSizeOverride = null) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            const curve = this.curves[id];
            if (!curve) return;
            const numericNewSize = Number(newSize);
            if (Number.isNaN(numericNewSize)) {
                delete curve._pendingSizeHistory;
                return;
            }

            const fallbackOldSize = oldSizeOverride ?? curve._pendingSizeHistory;
            const oldSize = (typeof fallbackOldSize === 'number') ? Number(fallbackOldSize) : Number(curve.size);

            // 履歴に記録
            if (oldSize !== numericNewSize) {
                this.historyManager.addAction({
                    type: 'size',
                    id: id,
                    oldSize: oldSize,
                    newSize: numericNewSize
                });
            }

            delete curve._pendingSizeHistory;
        }
    }

    /**
     * 色変更を履歴に記録
     * @param {string} newColor - 新しい色
     */
    recordColorChange(newColor, oldColorOverride = null) {
        if (this.settings.selectCurveId !== null) {
            const id = this.settings.selectCurveId;
            const curve = this.curves[id];
            if (!curve) return;

            const fallbackOldColor = oldColorOverride ?? curve._pendingColorHistory;
            const oldColorValue = (typeof fallbackOldColor === 'string') ? fallbackOldColor : curve.color;
            const normalizedOldColor = typeof oldColorValue === 'string' ? oldColorValue.toUpperCase() : oldColorValue;
            const normalizedNewColor = typeof newColor === 'string' ? newColor.toUpperCase() : newColor;

            // 履歴に記録
            if (normalizedOldColor !== normalizedNewColor) {
                this.historyManager.addAction({
                    type: 'color',
                    id: id,
                    oldColor: oldColorValue,
                    newColor: newColor
                });
            }

            if (typeof newColor === 'string') {
                curve.color = newColor;
                this.settings.currentColor = newColor;
            }

            delete curve._pendingColorHistory;
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
                // Toggle collapsed state on the parent .curve-item for animated collapse/expand
                curveItem.classed('collapsed', !detailShown);
                // Keep the details/options visibility classes in sync for legacy checks if needed
                curveItem.select('.curve-details').classed('hidden', false);
                curveItem.select('.curve-options').classed('hidden', false);
                // Match color-picker behavior: rotate when collapsed, so keep rotated in sync with !detailShown
                curveItem.select('.details-dropdown').classed('rotated', !detailShown);
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
     * @param {string} eq - 数式オブジェクト
     * @param {HTMLElement} buttonElement - コピーボタン要素
     */
    copyEquationToClipboard(eq, buttonElement) {
        try {
            const rawSource = (eq.latex || eq.formula || '').toString();
            // Avoid double-inserting \left / \right if they already exist.
            const LEFT_PLACEHOLDER = '__LEFT_PLACEHOLDER__';
            const RIGHT_PLACEHOLDER = '__RIGHT_PLACEHOLDER__';
            let source = rawSource.replace(/\\left\(/g, LEFT_PLACEHOLDER).replace(/\\right\)/g, RIGHT_PLACEHOLDER);
            let formatted = source.replace(/\(/g, '\\left(').replace(/\)/g, '\\right)');
            formatted = formatted.replace(new RegExp(LEFT_PLACEHOLDER, 'g'), '\\left(').replace(new RegExp(RIGHT_PLACEHOLDER, 'g'), '\\right)');
            const axis = (eq.domainAxis || (eq.type === 'vertical' ? 'y' : 'x')) || 'x';
            const hasDomain = eq.domain && eq.domain.start != null && eq.domain.end != null;
            const cleanFormula = hasDomain
                ? `${formatted} \\left\\{${eq.domain.start} \\le ${axis} \\le ${eq.domain.end}\\right\\}`
                : formatted;

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
            const fallback = (eq && (eq.latex || eq.formula)) ? (eq.latex || eq.formula) : '';
            this.fallbackCopyToClipboard(fallback, buttonElement);
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
     * @param {Object} descriptor - 曲線の記述子 { id, domainPath, color, size, useAdvancedMode, approximatorSettings }
     * @returns {Object} 追加結果 {success: boolean, message: string, curve: Object}
     */
    addHandDrawnCurve(descriptor) {
        let result = { success: false, message: '', curve: null };

        if (!descriptor || typeof descriptor !== 'object') {
            result.message = 'addHandDrawnCurve requires a descriptor object';
            return result;
        }

        const id = descriptor.id;
        const domainPath = descriptor.domainPath || descriptor.points || [];
        const color = descriptor.color;
        const size = descriptor.size;
        const useAdvancedMode = descriptor.useAdvancedMode;
        const approximatorSettings = descriptor.approximatorSettings || this.approximatorSettings;

        // --- placeholder 戦略: 早期に this.curves[id] を確保して UI が参照できるようにする ---
        // 既に存在する場合は上書きしない
        if (!this.curves[id]) {
            const placeholder = {
                id: id,
                type: 'unknown',
                path: null,
                color: color || (approximatorSettings && approximatorSettings.color) || '#000',
                size: size || (approximatorSettings && approximatorSettings.size) || 1,
                isHidden: false,
                isDetailShown: true,
                // 曲線追加直後は移動可能（locked: false）
                locked: false,
                // 節点表示フラグ（曲線ごとに保持）
                showKnots: (approximatorSettings && typeof approximatorSettings.showKnotsDefault !== 'undefined') ? !!approximatorSettings.showKnotsDefault : true,
                graphCurve: null,
                latexEquations: [],
                preKnots: [],
                knotCount: 0,
                originalPoints: Array.isArray(domainPath) ? domainPath.slice() : [],
            };
            // 配列の該当 index にセット（splice を使わず直接代入して参照を壊さない）
            this.curves[id] = placeholder;
            // 先にサイドバーのプレースホルダ要素を追加（内容は近似後に更新される）
            try {
                this.addCurveToList(id, placeholder.color, placeholder.size, true, approximatorSettings || this.approximatorSettings, placeholder.type);
            } catch (e) {
                // UI が未初期化の場合は無視
            }
        }

        // GraphCalculatorの曲線を追加
        let graphCurve = null;
        let latexEquations = []; // LaTeX方程式を保存用の変数を追加

        this.setApproximatorSettings(approximatorSettings);

        const domainInfo = this.graphCalculator && typeof this.graphCalculator.getDomain === 'function'
            ? this.graphCalculator.getDomain()
            : null;

        const attempts = [];
        const getErrorScore = (approximation) => {
            if (!approximation || !approximation.success) {
                return Number.POSITIVE_INFINITY;
            }
            if (approximation.diagnostics && Number.isFinite(approximation.diagnostics.rmsError)) {
                return Math.abs(approximation.diagnostics.rmsError);
            }
            if (typeof approximation.averageLinearity === 'number') {
                return Math.max(0, 1 - approximation.averageLinearity);
            }
            if (Array.isArray(approximation.segments)) {
                const segmentErrors = approximation.segments
                    .map(seg => (seg && Number.isFinite(seg.rmsError)) ? Math.abs(seg.rmsError) : null)
                    .filter(val => val !== null);
                if (segmentErrors.length) {
                    return segmentErrors.reduce((sum, val) => sum + val, 0) / segmentErrors.length;
                }
            }
            return Number.POSITIVE_INFINITY;
        };

        const registerAttempt = (label, approximation, priority) => {
            const error = getErrorScore(approximation);
            attempts.push({ label, approximation, priority, error });
        };

        const piecewiseResult = this.piecewiseLinearApproximator.approximate(domainPath, domainInfo);
        registerAttempt('piecewiseLinear', piecewiseResult, 0);

        const linearResult = this.linearApproximator.approximate(domainPath, domainInfo);
        const linearPriority = (linearResult && linearResult.success && linearResult.type === 'constant') ? 1 : 2;
        const linearLabel = (linearResult && linearResult.success && linearResult.type === 'vertical') ? 'linearVertical' : 'linear';
        registerAttempt(linearLabel, linearResult, linearPriority);

        const singleQuadraticResult = this.singleQuadraticApproximator
            ? this.singleQuadraticApproximator.approximate(domainPath, domainInfo, this.approximatorSettings)
            : null;
        registerAttempt('singleQuadratic', singleQuadraticResult, 3);

        const singleCircleResult = this.singleCircleApproximator
            ? this.singleCircleApproximator.approximate(domainPath, domainInfo, this.approximatorSettings)
            : null;
        registerAttempt('singleCircle', singleCircleResult, 4);

        const quadraticBSplineResult = this.quadraticApproximator.approximate(
            domainPath,
            domainInfo,
            this.approximatorSettings
        );
        registerAttempt('quadraticBSpline', quadraticBSplineResult, 5);

        // const quadraticChainResult = this.quadraticBezierChainApproximator
        //     ? this.quadraticBezierChainApproximator.approximate(domainPath, domainInfo, this.approximatorSettings)
        //     : null;
        // registerAttempt('quadraticChain', quadraticChainResult, 6);

        const selectiveResult = this.selectiveCurveApproximator
            ? this.selectiveCurveApproximator.approximate(
                domainPath,
                domainInfo,
                this.approximatorSettings?.selective || {}
            )
            : null;
        registerAttempt('selectiveHybrid', selectiveResult, 7);

        const successfulAttempts = attempts.filter(entry => entry.approximation && entry.approximation.success);

        let bestAttempt = null;
        if (successfulAttempts.length > 0) {
            successfulAttempts.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                const errorA = Number.isFinite(a.error) ? a.error : Number.POSITIVE_INFINITY;
                const errorB = Number.isFinite(b.error) ? b.error : Number.POSITIVE_INFINITY;
                if (errorA !== errorB) {
                    return errorA - errorB;
                }
                return a.label.localeCompare(b.label);
            });
            bestAttempt = successfulAttempts[0];
        }

        const attemptDiagnostics = attempts.map(entry => ({
            label: entry.label,
            type: entry.approximation ? entry.approximation.type : null,
            success: !!(entry.approximation && entry.approximation.success),
            priority: entry.priority,
            error: Number.isFinite(entry.error) ? entry.error : null
        }));

        if (bestAttempt) {
            const approximation = bestAttempt.approximation;

            if (!approximation.diagnostics) {
                approximation.diagnostics = {};
            }
            approximation.diagnostics.selectedApproximator = bestAttempt.label;
            approximation.diagnostics.approximatorPriority = bestAttempt.priority;
            approximation.diagnostics.alternatives = attemptDiagnostics;
            // Debug: which approximator was chosen for this stroke
            try {
                console.log(`[Approximator] selected: ${bestAttempt.label}`, {
                    priority: bestAttempt.priority,
                    error: bestAttempt.error,
                    diagnostics: approximation.diagnostics
                });
            } catch (e) {
                // ignore console errors in constrained environments
            }
            result.diagnostics = approximation.diagnostics;

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
            // Precompute RPN tokens for each equation where applicable
            try {
                if (Array.isArray(latexEquations)) {
                    latexEquations.forEach(eq => {
                        if (eq && eq.formula && typeof eq.formula === 'string') {
                            try {
                                eq.rpn = toRPN(eq.formula);
                            } catch (e) {
                                eq.rpn = null;
                            }
                        }
                    });
                }
            } catch (e) {
                // ignore any RPN computation errors
            }

            // 節点座標を取得して保存
            const knotPoints = Array.isArray(approximation.knots)
                ? approximation.knots
                    .filter(knot => Array.isArray(knot) && knot.length >= 2)
                    .map(knot => ({ x: knot[0], y: knot[1] }))
                : [];

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
                    savedKnots.push({ x: knot.x, y: knot.y });
                    // 曲線ごとの節点表示フラグを尊重して DOM を非表示にする
                    const c = this.curves[id];
                    if (c && c.showKnots === false && point.group && point.group.style) {
                        point.group.style.display = 'none';
                    }
                }
            });

            // 曲線を追加（節点データも含めて）
            this.addCurve({
                id: id,
                type: type,
                path: d3.select(graphCurve.path),
                color: color,
                size: size,
                graphCurve: graphCurve,
                latexEquations: latexEquations,
                approximatorSettings: approximatorSettings,
                preKnots: preKnots,
                minKnots: 2,
                maxKnots: this.approximatorSettings.maxKnots,
                originalPoints: domainPath,
                approximationType: approximation.type,
                approximationData: approximation.exportData || null,
                approximationDiagnostics: approximation.diagnostics || null,
                selectedApproximator: bestAttempt.label,
                approximatorPriority: bestAttempt.priority
            });

            // 節点表示のデフォルトが false の場合、既に追加した点を非表示にする
            if (approximatorSettings && approximatorSettings.showKnotsDefault === false) {
                const c = this.curves[id];
                if (c && this.graphCalculator) {
                    const gc = this.graphCalculator.getCurve(c.graphCurve?.id || c.graphCurve || id);
                    if (gc && Array.isArray(gc.points)) {
                        gc.points.forEach(p => { if (p && p.group && p.group.style) p.group.style.display = 'none'; });
                    }
                }
            }

            // 節点データを保存（placeholder戦略のため、追加されたIDで参照）
            const curve = this.curves[id];
            if (curve) {
                curve.knotPoints = savedKnots;
                curve.originalPoints = Array.isArray(domainPath) ? domainPath.slice() : curve.originalPoints;
                curve.selectedApproximator = bestAttempt.label;
                curve.approximatorPriority = bestAttempt.priority;
                curve.approximationDiagnostics = approximation.diagnostics;
                curve.approximationType = approximation.type;
                curve.approximationData = approximation.exportData || null;
            }

            result.success = true;
            result.message = (approximation.type || bestAttempt.label) + 'として近似しました';
            result.curve = graphCurve;
            return result;
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
                this.addCurve({
                    id: id,
                    type: 'parametric',
                    path: d3.select(graphCurve.path),
                    color: color,
                    size: size,
                    graphCurve: graphCurve,
                    latexEquations: [],
                    approximatorSettings: approximatorSettings,
                    originalPoints: domainPath
                });

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
        result.diagnostics = {
            selectedApproximator: null,
            approximatorPriority: null,
            alternatives: attemptDiagnostics
        };

        try {
            if (this.curves[id] && (!this.curves[id].graphCurve || this.curves[id].type === 'unknown')) {
                // null を代入して参照切断
                this.curves[id] = null;
            }

            const elem = document.querySelector(`.curve-item[data-id="${id}"]`);
            if (elem && elem.parentNode) elem.parentNode.removeChild(elem);
        } catch (e) {
            // UI がまだない場合などは無視
        }

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


        // 値変更時のハンドラ（即時表示は input で、確定は change で履歴に記録）
        let timeout = null;
        let oldValueForHistory = currentKnotCount;

        // インタラクション開始時の古い値を保存
        const node = slider.node();
        if (node) {
            node.addEventListener('pointerdown', () => { oldValueForHistory = Number(node.value); });
            node.addEventListener('change', (ev) => {
                const newValue = parseInt(ev.target.value);
                // 履歴に記録（古い値と異なる場合）
                try {
                    if (this.historyManager && oldValueForHistory !== newValue) {
                        this.historyManager.addAction({
                            type: 'knotCountChanged',
                            id: curveId,
                            oldValue: oldValueForHistory,
                            newValue: newValue
                        });
                    }
                } catch (e) {
                    // ignore
                }

                // 最終的な適用を行う
                this.setKnotCount(curveId, newValue);
            });
        }

        slider.on('input', (event) => {
            const value = parseInt(event.target.value);
            valueDisplay.text(value); // 即座に表示を更新

            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                // 部分更新（input のデバウンスによる近似再計算）
                this.setKnotCount(curveId, value, /*suppressHistory*/ true);
            }, 100);
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

        const domain = this.graphCalculator && typeof this.graphCalculator.getDomain === 'function'
            ? this.graphCalculator.getDomain()
            : null;
        const mergedOptions = { ...this.approximatorSettings, ...options };

        switch (type) {
            case 'constant':
            case 'vertical':
            case 'linear':
                // 一次関数近似
                return this.linearApproximator.approximate(points, domain);

            case 'quadratic':
                // 二次Bスプライン近似
                return this.quadraticApproximator.approximate(
                    points,
                    domain,
                    mergedOptions
                );
            case 'piecewiseLinear':
                // 折れ線近似
                return this.piecewiseLinearApproximator.approximate(points, domain);
            case 'singleQuadratic':
                return this.singleQuadraticApproximator
                    ? this.singleQuadraticApproximator.approximate(points, domain, mergedOptions)
                    : null;
            case 'singleCircle':
                return this.singleCircleApproximator
                    ? this.singleCircleApproximator.approximate(points, domain, mergedOptions)
                    : null;
            case 'quadraticChain':
                return this.quadraticBezierChainApproximator
                    ? this.quadraticBezierChainApproximator.approximate(points, domain, mergedOptions)
                    : null;
            case 'selectiveHybrid': {
                const baseSelective = this.approximatorSettings?.selective || {};
                const overrideSource = (options && typeof options === 'object')
                    ? (options.selective && typeof options.selective === 'object' ? options.selective : options)
                    : {};
                const selectiveOverrides = {
                    ...baseSelective,
                    ...(overrideSource && typeof overrideSource === 'object' ? overrideSource : {})
                };
                return this.selectiveCurveApproximator
                    ? this.selectiveCurveApproximator.approximate(points, domain, selectiveOverrides)
                    : null;
            }
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

        // 軽量更新: 既存DOMがあれば式のみ更新（DOM再構築しない）
        if (equations && Array.isArray(equations) && equations.length > 0) {
            const timeline = container.querySelector('.equations-timeline');

            // 既存構造があり、式数が一致する場合は差分更新
            const contents = timeline ? timeline.querySelectorAll(`.equation-content[data-curve-id="${curveId}"]`) : null;
            if (timeline && contents && contents.length === equations.length) {
                // KaTeX とイベントのみ更新（domain-marker は原則触らない）
                for (let i = 0; i < equations.length; i++) {
                    const eq = equations[i];
                    if (!eq || (!eq.formula && !eq.latex) || !eq.domain) continue;
                    const content = timeline.querySelector(`.equation-content[data-section-index="${i}"][data-curve-id="${curveId}"]`);
                    if (!content) continue;
                    const katexContainer = content.querySelector('.katex-display');
                    if (katexContainer) {
                        const displayFormula = eq.latex || eq.formula || '';
                        try {
                            katex.render(displayFormula, katexContainer, { throwOnError: false, displayMode: true });
                        } catch (e) {
                            katexContainer.textContent = displayFormula;
                        }
                    }
                    const copyButton = content.querySelector('.equation-copy-btn');
                    if (copyButton) {
                        copyButton.onclick = (event) => {
                            event.stopPropagation();
                            this.copyEquationToClipboard(eq, copyButton);
                        };
                    }
                    // ハイライト更新
                    content.onmouseenter = () => this.highlightFunction(curveId, i, eq);
                    content.onmouseleave = () => this.unhighlightFunction();
                }

                // domain-marker は値が変わったときのみ innerHTML を更新（スタイル保持のため）
                try {
                    const markers = timeline.querySelectorAll('.domain-marker');
                    const hasStart = equations[0] && equations[0].domain;
                    const expected = hasStart ? (equations.length + 1) : 0;
                    if (markers && markers.length === expected && hasStart) {
                        const fmt = (v) => String(v).replace(/\.(00|0)$/, '');
                        const startText = fmt(equations[0].domain.start);
                        if (markers[0].innerText !== startText) {
                            // スタイルを残すためinnerHTMLで更新
                            markers[0].innerHTML = startText;
                        }
                        for (let i = 0; i < equations.length; i++) {
                            const endText = fmt(equations[i].domain.end);
                            const idx = i + 1;
                            if (markers[idx] && markers[idx].innerText !== endText) {
                                markers[idx].innerHTML = endText;
                            }
                        }
                    }
                } catch (_) { /* noop */ }

                return; // 差分更新完了
            }

            // 構造が無い、または一致しない場合は最小限の再構築
            let html = '<div class="equations-timeline">';
            if (typeof equations[0] === 'object' && equations[0].domain) {
                html += `<div class=\"domain-marker\">${equations[0].domain.start.replace(/\.(00|0)$/, '')}</div>`;
            }
            equations.forEach((eq, i) => {
                if (typeof eq === 'object' && (eq.formula || eq.latex) && eq.domain) {
                    html += `
            <div class=\"equation-item\" data-section-index=\"${i}\" data-curve-id=\"${curveId}\"> 
              <div class=\"equation-content\" data-section-index=\"${i}\" data-curve-id=\"${curveId}\"> 
                <button class=\"equation-copy-btn\" title=\"数式をコピー\"> 
                  <i class=\"material-symbols-rounded\">content_copy</i> 
                </button> 
                <div class=\"katex-display\"></div> 
              </div> 
            </div> 
            <div class=\"domain-marker\">${eq.domain.end.replace(/\.(00|0)$/, '')}</div>`;
                }
            });
            html += '</div>';
            container.innerHTML = html;

            // KaTeX描画とイベント再設定
            equations.forEach((eq, i) => {
                if (typeof eq === 'object' && eq.formula && eq.domain) {
                    const equationContent = container.querySelector(`.equation-content[data-section-index=\"${i}\"][data-curve-id=\"${curveId}\"]`);
                    const katexDisplay = equationContent && equationContent.querySelector('.katex-display');
                    if (katexDisplay) {
                        const displayFormula = eq.latex || eq.formula || '';
                        try {
                            katex.render(displayFormula, katexDisplay, { throwOnError: false, displayMode: true });
                        } catch (e) {
                            katexDisplay.textContent = displayFormula;
                        }
                    }
                    const copyButton = equationContent && equationContent.querySelector('.equation-copy-btn');
                    if (copyButton) {
                        copyButton.onclick = (event) => {
                            event.stopPropagation();
                            this.copyEquationToClipboard(eq, copyButton);
                        };
                    }
                    if (equationContent) {
                        equationContent.onmouseenter = () => this.highlightFunction(curveId, i, eq);
                        equationContent.onmouseleave = () => this.unhighlightFunction();
                    }
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

    /**
     * 汎用的な曲線オプションボタンを作成
     * @param {d3.Selection} container - ボタンを追加するコンテナ要素
     * @param {number} curveId - 曲線ID
     * @param {Object} options - ボタン設定オプション
     * @param {string} options.iconName - Google Iconsのアイコン名
     * @param {boolean} options.initialActive - 初期状態でアクティブかどうか
     * @param {string} options.title - ボタンのツールチップテキスト
     * @param {Function} options.onClick - クリック時の処理関数 (curveId, isActive, buttonElement) => void
     * @param {string} [options.className] - 追加のCSSクラス名
     * @returns {d3.Selection} 作成されたボタン要素
     */
    createCurveOptionButton(container, curveId, options) {
        const {
            iconName,
            initialActive = false,
            title = '',
            onClick,
            className = ''
        } = options;

        const button = container.append('button')
            .attr('class', `curve-option-btn ${className}`)
            .attr('title', title)
            .attr('data-id', curveId)
            .html(`<i class="material-symbols-rounded">${iconName}</i>`);

        // 初期状態の設定
        if (initialActive) {
            button.classed('active', true);
        }

        // クリックイベントの設定
        button.on('click', (event) => {
            event.stopPropagation();
            const btn = event.currentTarget;
            const wasActive = btn.classList.contains('active');
            const isActive = !wasActive;

            btn.classList.toggle('active');

            if (onClick && typeof onClick === 'function') {
                onClick(curveId, isActive, btn);
            }
        });

        return button;
    }

    /**
     * SVGアイコンを返す（typeで切り替え）
     * @param {string} iconType - アイコンの種類
     * @param {string} color - 線の色（例: 'white'）
     * @returns {string} SVGタグ文字列
     */
    getColorIconSVG(iconType = 'linear', color = 'white') {
        switch (iconType) {
            case 'piecewiseLinear':
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <polyline points="4,14 7,8 11,12 15,7" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            case 'quadratic':
            case 'quadraticBezier':
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <path d="M4,13 Q10,4 16,13" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
                </svg>`;
            case 'singleQuadratic':
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <path d="M3,15 Q10,3 17,15" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="10" cy="5" r="1.5" fill="none" stroke="${color}" stroke-width="1.4"/>
                </svg>`;
            case 'quadraticChain':
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <path d="M2,14 Q6.5,5 10,10" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M10,10 Q13.5,17 18,7" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            case 'singleCircle':
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <circle cx="10" cy="10" r="5.5" fill="none" stroke="${color}" stroke-width="2.4"/>
                </svg>`;
            case 'selectiveHybrid':
            case 'mixedHybrid':
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <polyline points="3,15 7,9.5 10,12" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M10,12 Q13,5.5 17,8" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            case 'linear':
            case 'constant':
            case 'vertical':
            default:
                return `<svg viewBox="0 0 20 20" width="100%" height="100%" style="pointer-events:none;">
                    <line x1="6" y1="14" x2="14" y2="6" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
                </svg>`;
        }
    }

}
