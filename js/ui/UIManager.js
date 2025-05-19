/**
 * UI管理クラス
 * ユーザーインターフェースと各種イベントを担当
 */
import { GraphCalculatorUtils } from '../graph/GraphCalculatorUtils.js';
import { SettingsManager } from './SettingsManager.js';
import { PenToolManager } from './PenToolManager.js';
import { ExportManager } from './ExportManager.js';
import { ApproximatorManager } from '../approximator/ApproximatorManager.js';
import { AdvancedModeManager } from './AdvancedModeManager.js';
import { AlertModal } from '../modal/AlertModal.js';
import { LanguageManager } from '../i18n/LanguageManager.js';

export class UIManager {
    // curveMovementHandlerを引数に追加
    constructor(settings, graphCalculator, curveManager, historyManager, curveMovementHandler = null) {
        this.settings = settings;
        this.graphCalculator = graphCalculator;
        this.curveManager = curveManager;
        this.historyManager = historyManager;
        this.curveMovementHandler = curveMovementHandler;

        // CurveManagerにGraphCalculatorを渡す
        this.curveManager.graphCalculator = this.graphCalculator;

        // PenToolManagerの初期化
        this.penToolManager = new PenToolManager(settings, this.curveManager);

        // GraphCalculatorUtilsの初期化
        this.graphUtils = new GraphCalculatorUtils(graphCalculator);

        // ApprocimatorManagerの初期化
        this.ApproximatorManager = new ApproximatorManager(curveManager);

        // SettingsManagerの初期化
        this.settingsManager = new SettingsManager(graphCalculator, curveManager, historyManager);

        // ExportManagerの初期化
        this.exportManager = new ExportManager(graphCalculator, this.settingsManager);

        // グラフ計算機があれば、曲線管理クラスにグラフ要素を設定
        if (this.graphCalculator) {
            // SVGのg要素を取得または作成
            const svg = d3.select(this.graphCalculator.container).select('svg');
            const g = svg.select('g.curves-container');
            if (g.empty()) {
                // 曲線コンテナがない場合は作成
                const newG = svg.append('g').attr('class', 'curves-container');
                this.curveManager.setGraphElement(newG);
            } else {
                this.curveManager.setGraphElement(g);
            }
        }

        // スライダーの初期値を取得して設定に反映
        const sizeSlider = document.getElementById('size');
        if (sizeSlider) {
            this.settings.currentSize = Number(sizeSlider.value);
            this.settings.prevSize = Number(sizeSlider.value);
        }

        // HistoryManagerに曲線の詳細表示状態へのアクセスを提供
        this.setupHistoryManager();

        // CurveManagerにUIManagerへの参照を渡す
        this.curveManager.setUIManager(this);

        // 初期状態でごみ箱ボタンの状態を更新
        this.updateClearButtonState();

        this.advancedModeManager = new AdvancedModeManager();

        this.alertModal = new AlertModal();
        // this.settingに入れる 近似失敗した後のモーダルウィンドウを表示非表示のプロパティ
        this.settings.showApproximationErrorModal = true;

        this.languageManager = null;
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // スライダーの初期値を再確認（DOMがロードされた後の確実な取得）
        const sizeSlider = document.getElementById('size');
        if (sizeSlider) {
            this.settings.currentSize = Number(sizeSlider.value);
            this.settings.prevSize = Number(sizeSlider.value);
        }

        document.getElementById('size').addEventListener('input', (event) => {
            this.settings.currentSize = Number(event.target.value);
        });

        this.setupDrawingEvents();
        this.setupToolbarEvents();
        this.setupResizeEvents();

        // Undo/Redoボタンの初期状態を確認
        this.updateHistoryButtons();
        this.updateClearButtonState();
    }

    /**
     * 描画イベントの設定
     */
    setupDrawingEvents() {
        if (!this.graphCalculator) return;

        // グラフ計算機のSVG要素を取得
        const svg = d3.select(this.graphCalculator.container).select('svg');
        const isDragging = this.curveMovementHandler.isMovementEnabled();

        // マウスダウンイベント
        svg.on('mousedown touchstart', (event) => {
            if (this.settings.currentTool === 'pen' && !isDragging) {
                this.startDrawing(event);
            }
        });

        // マウス移動イベント
        d3.select(document).on('mousemove touchmove', (event) => {
            if (this.settings.currentTool === 'pen' && this.isDrawing && !isDragging) {
                this.draw(event);
            }
        });

        // マウスアップイベント
        d3.select(document).on('mouseup touchend', () => {
            if (this.settings.currentTool === 'pen' && this.isDrawing && !isDragging) {
                this.endDrawing();
            }
        });

        // 曲線クリックイベントの設定
        this.setupCurveClickEvents();
    }

    /**
     * 曲線クリックイベントの設定
     */
    setupCurveClickEvents() {
        if (!this.graphCalculator) return;

        // グラフ計算機のSVG要素にクリックイベントを設定
        const svg = this.graphCalculator.getSvg();

        // d3イベントでpointerdownに統一（名前空間: .uiCurve）
        d3.select(svg).on('pointerdown.uiCurve', (event) => {
            // 曲線移動モードが有効な場合はクリックでの選択を処理しない
            if (this.curveMovementHandler && this.curveMovementHandler.isMovementEnabled() &&
                this.curveMovementHandler.dragState && this.curveMovementHandler.dragState.isDragging) {
                return;
            }

            // カーソルツールがアクティブな場合のみ曲線選択を有効に
            if (this.settings.currentTool !== 'cursor') return;

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
            if (hitArea && this.curveMovementHandler.dragState.isDragging) {
                const curveId = hitArea.getAttribute('data-curve-id');
                if (curveId) {
                    // カーブマネージャーの対応する曲線を選択
                    this.curveManager.selectCurveByGraphCurveId(curveId);
                }
            } else {
                // 背景クリックで選択解除
                // グラフの背景要素として認識する要素の判定
                const isBackground =
                    target === svg ||
                    target.tagName === 'g' ||
                    target.tagName === 'svg' ||
                    (target.classList && (
                        target.classList.contains('micro-grid-line') ||
                        target.classList.contains('sub-grid-line') ||
                        target.classList.contains('grid-line') ||
                        target.classList.contains('axis-tick') ||
                        target.classList.contains('axis-label') ||
                        target.classList.contains('graph')
                    ));

                if (isBackground && this.settings.selectCurveId !== null) {
                    // 選択解除の処理
                    this.curveManager.delEmphasisCurve();
                    this.curveManager.deselectCurve();
                    d3.selectAll('.curve-item').classed('selected', false);

                    // カラー表示も更新
                    this.penToolManager.resetToDefaultColor();
                }
            }
        });
    }

    /**
     * 描画開始処理
     */
    startDrawing(event) {
        if (!this.graphCalculator) return;

        this.isDrawing = true;
        const svg = d3.select(this.graphCalculator.container).select('svg');

        let coords;
        if (event.touches && event.touches.length > 0) {
            coords = d3.pointer(event.touches[0], svg.node());
        } else if (event instanceof MouseEvent) {
            coords = d3.pointer(event, svg.node());
        } else {
            console.error("予期しないイベントタイプ", event);
            return; // または適切なエラー処理
        }

        // 現在のパスを初期化
        this.currentPath = [];
        this.currentPath.push(coords);

        // 描画プレビュー用の一時的なパスをグラフ計算機のSVGに直接作成
        this.previewPath = svg.append('path')
            .attr('fill', 'none')
            .attr('stroke', this.settings.currentColor)
            .attr('stroke-width', this.settings.currentSize)
            .attr('stroke-linecap', 'round')
            .attr('stroke-dasharray', '0')  // 実線
            .attr('class', 'drawing-preview')
            .attr('d', this.getPathData(this.currentPath));

        // CurveManager用のパスも作成（最終的な曲線として使用）
        this.drawingPath = this.curveManager.g.append('path')
            .attr('fill', 'none')
            .attr('stroke', this.settings.currentColor)
            .attr('stroke-width', this.settings.currentSize)
            .attr('stroke-linecap', 'round')
            .attr('d', this.getPathData(this.currentPath))
            .style('display', 'none'); // 非表示にしておく
    }

    /**
     * 描画処理
     */
    draw(event) {
        if (!this.isDrawing || !this.graphCalculator) return;

        const svg = d3.select(this.graphCalculator.container).select('svg');

        let coords;
        if (event.touches && event.touches.length > 0) {
            coords = d3.pointer(event.touches[0], svg.node());
        } else if (event instanceof MouseEvent) {
            coords = d3.pointer(event, svg.node());
        } else {
            console.error("予期しないイベントタイプ", event);
            return; // または適切なエラー処理
        }

        // 現在のパスにSVG座標を追加
        this.currentPath.push(coords);

        // SVGパス文字列を取得（SVG座標のまま）
        const pathData = this.getPathData(this.currentPath);

        // プレビューパスを更新
        this.previewPath.attr('d', pathData);

        // 非表示のCurveManagerパスも更新
        this.drawingPath.attr('d', pathData);
    }

    /**
     * 描画終了処理
     */
    endDrawing() {
        if (!this.isDrawing) return;

        // プレビューパスを削除
        if (this.previewPath) {
            this.previewPath.remove();
            this.previewPath = null;
        }

        // 点が少なすぎる場合は描画をキャンセル
        if (this.currentDomainPath === undefined || this.currentDomainPath.length < 2) {
            // 描画状態をリセット
            this.isDrawing = false;
            this.currentPath = null;
            this.currentDomainPath = [];
            return;
        }

        // 高度な近似モードの状態を取得
        const useAdvancedMode = this.advancedModeManager.isAdvancedModeEnabled();

        // 曲線の追加処理をCurveManagerに委譲
        const curveId = this.settings.nextCurveId;
        const curveResult = this.curveManager.addHandDrawnCurve(
            curveId,
            this.currentDomainPath,
            this.settings.currentColor,
            this.settings.currentSize,
            useAdvancedMode,
            this.ApproximatorManager.getSettings()
        );

        if (curveResult.success) {
            // IDをインクリメント（ここではUIManagerが管理）
            this.settings.nextCurveId++;
        } else {
            // 一価関数で書いてくださいのメッセージを表示
            if (this.settings.showApproximationErrorModal) {
                this._showApproximationAlert();
            } else {
                this.alertModal.show('近似処理に失敗しました', {
                    type: 'error',
                    position: 'center-top',
                    i18nKey: 'alert.approximation_failed',
                    link: {
                        text: '詳細',
                        i18nKey: 'alert.details',
                        onClick: () => {
                            this.settings.showApproximationErrorModal = true;
                            this._showApproximationAlert();
                        }
                    }
                });
            }
        }

        // 描画状態をリセット
        this.isDrawing = false;
        this.currentPath = null;
        this.currentDomainPath = [];
    }

    /**
     * パスデータの取得（スムージングを追加）
     */
    getPathData(points) {
        if (!points || points.length < 2) return '';

        // GraphCalculatorのヘルパーメソッドが利用可能かチェック
        if (this.graphCalculator && typeof this.graphCalculator.createSmoothPathFromPoints === 'function') {
            // SVG座標をドメイン座標に変換
            const domainPoints = points.map(point => {
                // SVG座標からドメイン座標に変換
                const svgRect = this.graphCalculator.svg.getBoundingClientRect();
                const screenX = point[0];
                const screenY = point[1];
                return this.graphCalculator.screenToDomain(screenX, screenY);
            });

            // domainPointsを[[x,y], [x,y]]形式に変換
            const formattedPoints = domainPoints.map(point => [point.x, point.y]);

            // 曲線データとして保存（後で曲線を再構築できるように）
            this.currentDomainPath = formattedPoints;
        }

        // 基本的なパス文字列の作成（最初の点へのMove）
        let d = `M ${points[0][0]} ${points[0][1]}`;

        // 点が多い場合はスムージングを適用
        if (points.length > 2) {
            // 各点間を滑らかに繋ぐベジェ曲線を追加
            for (let i = 1; i < points.length - 1; i++) {
                const p0 = points[i - 1];
                const p1 = points[i];
                const p2 = points[i + 1];

                // 制御点の計算
                const x1 = p1[0];
                const y1 = p1[1];
                const x2 = (p1[0] + p2[0]) / 2;
                const y2 = (p1[1] + p2[1]) / 2;

                // 二次ベジェ曲線の追加
                d += ` Q ${x1},${y1} ${x2},${y2}`;
            }

            // 最後の点への直線を追加
            const lastPoint = points[points.length - 1];
            d += ` L ${lastPoint[0]},${lastPoint[1]}`;
        } else {
            // 点が少ない場合は直線を引く
            for (let i = 1; i < points.length; i++) {
                d += ` L ${points[i][0]} ${points[i][1]}`;
            }
        }

        return d;
    }

    /**
     * ツールバーイベントの設定
     */
    setupToolbarEvents() {
        d3.select('#pen-tool').on('click', () => this.setActiveTool('pen'));
        d3.select('#cursor-tool').on('click', () => this.setActiveTool('cursor'));
        d3.select('#home-button').on('click', () => this.graphUtils.resetView());
        d3.select('#clear-canvas').on('click', () => this.toggleDeleteMode());

        // 拡大縮小ボタンのイベントリスナーを追加
        d3.select('#zoom-in-button').on('click', () => this.zoomIn());
        d3.select('#zoom-out-button').on('click', () => this.zoomOut());

        d3.select('#undo').on('click', () => {
            if (this.penToolManager.isOpen) return; // ペンツールが開いている場合は無視
            if (!d3.select('#undo').classed('disabled')) {
                this.undo();
                this.updateHistoryButtons();
                this.updateClearButtonState();
            }
        });

        d3.select('#redo').on('click', () => {
            if (this.penToolManager.isOpen) return; // ペンツールが開いている場合は無視
            if (!d3.select('#redo').classed('disabled')) {
                this.redo();
                this.updateHistoryButtons();
                this.updateClearButtonState();
            }
        });

        // アクション実行後の状態更新用にHistoryManagerを拡張
        const originalAddAction = this.historyManager.addAction.bind(this.historyManager);
        this.historyManager.addAction = (...args) => {
            originalAddAction(...args);
            this.updateHistoryButtons();
            this.updateClearButtonState();
        };

        // 曲線移動トグルボタンの連携
        const moveToggleBtn = document.getElementById('curve-move-toggle');
        if (moveToggleBtn && this.curveMovementHandler) {
            // 状態を同期
            moveToggleBtn.classList.toggle('active', this.curveMovementHandler.isMovementEnabled());
            moveToggleBtn.addEventListener('click', () => {
                // CurveMovementHandler側で状態が切り替わるので、UI側も同期
                moveToggleBtn.classList.toggle('active', this.curveMovementHandler.isMovementEnabled());
                // 必要なら他のUI状態もここで制御
            });
        }
    }

    /**
     * 削除モードの切り替え
     */
    toggleDeleteMode() {
        const curveList = document.getElementById('curve-list');
        const isDeleteMode = curveList.classList.toggle('delete-mode');

        // Create or show/hide overlay
        let overlay = document.getElementById('delete-mode-overlay');
        if (!overlay && isDeleteMode) {
            overlay = document.createElement('div');
            overlay.id = 'delete-mode-overlay';
            document.getElementById('graph-container').appendChild(overlay);
        }

        if (overlay) {
            overlay.style.display = isDeleteMode ? 'block' : 'none';
        }

        // ゴミ箱アイコンの状態を更新
        d3.select('#clear-canvas').classed('active', isDeleteMode);

        if (isDeleteMode) {
            // カラーアイコンのクリックを無効化
            const colorIcons = document.querySelectorAll('.color-icon');
            colorIcons.forEach(icon => {
                // 既存のイベントリスナーを一時的に無効化
                icon.style.pointerEvents = 'none';
            });

            // 他のパネルを閉じる
            if (this.penToolManager) {
                this.penToolManager.hideColorPicker();
            }
            if (this.settingsManager) {
                this.settingsManager.hidePanel();
            }

            // 曲線が選択されていた場合は選択解除
            if (this.settings.selectCurveId !== null) {
                this.curveManager.delEmphasisCurve();
                this.curveManager.deselectCurve();
                d3.selectAll('.curve-item').classed('selected', false);
            }

            // Escキーイベントの設定
            this.handleEscKey = (e) => {
                if (e.key === 'Escape') {
                    this.exitDeleteMode();
                }
            };
            document.addEventListener('keydown', this.handleEscKey);
            this.showDeleteModeNotification(true);
        } else {
            // カラーアイコンのクリックを再有効化
            const colorIcons = document.querySelectorAll('.color-icon');
            colorIcons.forEach(icon => {
                icon.style.pointerEvents = 'auto';
            });

            document.removeEventListener('keydown', this.handleEscKey);
            this.showDeleteModeNotification(false);

            if (overlay) {
                overlay.remove();
            }
        }
    }

    /**
     * 削除モードを終了
     */
    exitDeleteMode() {
        const curveList = document.getElementById('curve-list');
        curveList.classList.remove('delete-mode');

        const overlay = document.getElementById('delete-mode-overlay');
        if (overlay) {
            overlay.remove();
        }

        // カラーアイコンのクリックを再有効化
        const colorIcons = document.querySelectorAll('.color-icon');
        colorIcons.forEach(icon => {
            icon.style.pointerEvents = 'auto';
        });

        d3.select('#clear-canvas').classed('active', false);
        document.removeEventListener('keydown', this.handleEscKey);
        this.showDeleteModeNotification(false);
    }

    /**
     * 削除モード通知の表示/非表示
     */
    showDeleteModeNotification(show) {
        if (!this.languageManager) {
            this.languageManager = new LanguageManager();
        }

        let notification = document.querySelector('.delete-mode-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'delete-mode-notification';
            notification.innerHTML = `
                <i class="material-symbols-rounded">warning</i>
                <span data-i18n="delete_mode.notification">削除モード: 削除したい曲線の×ボタンをクリックしてください</span>
                <button class="exit-delete-mode-btn" data-i18n="delete_mode.exit">削除モード終了</button>
            `;
            document.body.appendChild(notification);

            // 終了ボタンにイベントリスナーを追加
            notification.querySelector('.exit-delete-mode-btn').addEventListener('click', () => {
                this.exitDeleteMode();
                this.updateClearButtonState();
            });
        }
        // i18n適用: 毎回適用
        const i18nElements = notification.querySelectorAll('[data-i18n]');
        i18nElements.forEach(el => {
            this.languageManager.updateSpecificElement(el);
        });
        notification.classList.toggle('visible', show);
    }

    /**
     * 履歴ボタンの状態を更新
     */
    updateHistoryButtons() {
        const undoBtn = d3.select('#undo');
        const redoBtn = d3.select('#redo');

        // 履歴の状態に応じてdisabledクラスを切り替え
        if (this.historyManager.isUndoStackEmpty()) {
            undoBtn.classed('disabled', true);
        } else {
            undoBtn.classed('disabled', false);
        }

        if (this.historyManager.isRedoStackEmpty()) {
            redoBtn.classed('disabled', true);
        } else {
            redoBtn.classed('disabled', false);
        }
    }

    /**
     * リサイズイベントの設定
     */
    setupResizeEvents() {
        let dragOffset = 0; // マウスクリック位置とdivider左端のオフセット

        const drag = d3.drag()
            .on('start', (event) => {
                // dividerの左端位置
                const dividerLeft = d3.select('#divider').node().getBoundingClientRect().left;

                // マウス位置とdivider左端の差分を記録
                dragOffset = event.x - dividerLeft;
            })
            .on('drag', (event) => {
                if (window.innerWidth <= 610) return;

                const container = d3.select('.container');
                const sidebar = d3.select('#sidebar');
                const canvasContainer = d3.select('#canvas-container');
                const containerWidth = container.node().getBoundingClientRect().width;

                // オフセットを考慮した正確な位置を計算
                const adjustedX = event.x - dragOffset;
                const sidebarWidth = Math.max(300, Math.min(adjustedX, containerWidth - 300 - 10));
                const canvasWidth = containerWidth - sidebarWidth - 10;

                sidebar.style('flex', `0 0 ${sidebarWidth}px`);
                canvasContainer.style('flex', `0 0 ${canvasWidth}px`);
            });

        d3.select('#divider').call(drag);

        const resizeWindow = () => {
            if (window.innerWidth <= 610) {
                d3.select('#sidebar').style('flex', 'none');
                return;
            }

            const container = d3.select('.container');
            const sidebar = d3.select('#sidebar');
            const canvasContainer = d3.select('#canvas-container');
            const containerWidth = container.node().getBoundingClientRect().width;

            // サイドバーとキャンバスの幅を再計算
            const sidebarWidth = Math.max(300, Math.min(sidebar.node().getBoundingClientRect().width, containerWidth - 300 - 10));
            const canvasWidth = containerWidth - sidebarWidth - 10;

            sidebar.style('flex', `0 0 ${sidebarWidth}px`);
            canvasContainer.style('flex', `0 0 ${canvasWidth}px`);
        }
        window.addEventListener('resize', resizeWindow);
    }

    /**
     * アクティブツールの設定
     */
    setActiveTool(tool) {
        this.settings.currentTool = tool;
        this.curveMovementHandler.setPenToolState(tool);
        document.querySelectorAll('.tool-button').forEach(button => button.classList.remove('active'));
        document.getElementById(`${tool}-tool`).classList.add('active');
        // グラフ計算機のSVG要素のカーソルを変更
        const svg = d3.select(this.graphCalculator.container).select('svg');

        // グラフ計算機があれば、ツールに応じてズームとキャンバス操作を切り替え
        if (this.graphCalculator) {
            if (tool === 'pen') {
                // ペンツールの場合は描画を優先するためキャンバス移動を無効化
                this.graphCalculator.enableZoom(true);
                this.graphCalculator.enableCanvas(false);
                svg.style('cursor', 'crosshair');
                this.curveMovementHandler.updatePenToolState('pen');
            } else if (tool === 'cursor') {
                // カーソルツールの場合はズームとキャンバス移動を有効化
                this.graphCalculator.enableZoom(true);
                this.graphCalculator.enableCanvas(true);
                svg.style('cursor', 'move');
                this.curveMovementHandler.updatePenToolState('cursor');
            }
        }
    }

    /**
     * 元に戻す処理
     */
    undo() {
        this.historyManager.undo();
        this.updateHistoryButtons();
    }

    /**
     * やり直し処理
     */
    redo() {
        this.historyManager.redo();
        this.updateHistoryButtons();
    }

    /**
     * 曲線リスト項目にイベントリスナーを追加
     * @param {HTMLElement} curveItem - 曲線リスト項目のDOM要素
     * @param {number} id - 曲線ID
     */
    addCurveItemEventListeners(curveItem, id) {
        // 項目全体のクリックイベント - 曲線選択
        d3.select(curveItem).on('pointerdown.uiCurveList', () => {
            const domItem = d3.select(curveItem);
            this.curveManager.selectCurve(domItem, id);
        });

        // 表示・非表示切り替え
        const colorIcon = curveItem.querySelector(`.color-icon[data-id="${id}"]`);
        if (colorIcon) {
            d3.select(colorIcon).on('pointerdown.uiCurveList', (event) => {
                event.stopPropagation();
                this.curveManager.toggleCurveVisibility(id);
            });
        }

        // 詳細表示切り替え
        const detailsBtn = curveItem.querySelector(`.details-dropdown[data-id="${id}"]`);
        if (detailsBtn) {
            d3.select(detailsBtn).on('pointerdown.uiCurveList', (event) => {
                event.stopPropagation();
                this.curveManager.toggleDetailVisibility(id);
            });
        }

        // 削除ボタン
        const deleteBtn = curveItem.querySelector(`.delete-btn[data-id="${id}"]`);
        if (deleteBtn) {
            d3.select(deleteBtn).on('pointerdown.uiCurveList', (event) => {
                event.stopPropagation();
                this.curveManager.deleteCurve({ target: { dataset: { id } } });
            });
        }

        // サイズスライダー
        const sizeSlider = curveItem.querySelector(`.size-slider`);
        if (sizeSlider) {
            d3.select(sizeSlider).on('input.uiCurveList', (event) => {
                event.stopPropagation();
                const size = parseInt(event.target.value);
                if (this.curveManager.curves[id]) {
                    this.curveManager.updateCurveSize(size);
                }
            });
            d3.select(sizeSlider).on('change.uiCurveList', (event) => {
                event.stopPropagation();
                const size = parseInt(event.target.value);
                if (this.curveManager.curves[id]) {
                    this.curveManager.recordSizeChange(size);
                }
            });
        }
    }

    /**
     * HistoryManagerに曲線の詳細表示状態を提供
     */
    setupHistoryManager() {
        // HistoryManagerがCurveManagerの状態にアクセスできるようにする
        this.historyManager.getCurveDetailState = (id) => {
            return this.curveManager.getCurveDetailState(id);
        };
    }

    /**
     * 拡大ボタンのクリックハンドラ
     */
    zoomIn() {
        if (this.graphCalculator) {
            this.graphCalculator.zoomIn();
        }
    }

    /**
     * 縮小ボタンのクリックハンドラ
     */
    zoomOut() {
        if (this.graphCalculator) {
            this.graphCalculator.zoomOut();
        }
    }

    /**
     * ごみ箱ボタンの状態を更新
     */
    updateClearButtonState() {
        const curveList = document.getElementById('curve-list');
        const clearButton = document.getElementById('clear-canvas');

        if (!curveList || !clearButton) return;

        const hasCurves = curveList.children.length > 0;

        clearButton.disabled = !hasCurves;
        clearButton.style.opacity = hasCurves ? '1' : '0.5';
        clearButton.style.pointerEvents = hasCurves ? 'auto' : 'none';
        clearButton.style.cursor = hasCurves ? 'pointer' : 'not-allowed';
    }

    /**
     * 近似不可能アラートの表示
     * @private
     */
    _showApproximationAlert() {
        // モーダルウィンドウスタイルのアラート作成
        const alertOverlay = document.createElement('div');
        alertOverlay.className = 'modal-overlay';

        const alertBox = document.createElement('div');
        alertBox.className = 'modal-content approximation-alert';
        alertBox.innerHTML = `
            <div class="modal-header">
                <i class="material-symbols-rounded">warning</i>
                <h3 data-i18n="approximator_alert.title">近似できません</h3>
                <button class="close-modal-btn">&times;</button>
            </div>
            <div class="modal-body">
                <p data-i18n="approximator_alert.message.1">曲線が一価関数ではありません。</p>
                <p data-i18n="approximator_alert.message.2">左から右へ一方向に描いてください。</p>
                <p data-i18n="approximator_alert.message.3">表現できない曲線例: 円やらせん状の曲線</p>
            </div>
            <div class="modal-footer">
                <button class="modal-button advanced-mode-btn" disabled style="opacity: 0.5; cursor: not-allowed;" data-i18n="approximator_alert.advanced">拡張モードを有効にする</button>
                <button class="modal-button close-btn" data-i18n="approximator_alert.close">閉じる</button>
            </div>
            <div class="alert-info">
                <i class="material-symbols-rounded" style="color: #3498db;">info</i>
                <span style="font-size: 0.8em; color: #666;" data-i18n="approximator_alert.advanced_mode_message">拡張モードは現在開発中です。</span>
            </div>
            <div class="alert-info">
                <label class="dont-show-again">
                    <input type="checkbox" id="dontShowAgain">
                    <span data-i18n="approximator_alert.dont_show_again">今後このメッセージを表示しない</span>
                </label>
            </div>
            `;

        document.body.appendChild(alertOverlay);
        alertOverlay.appendChild(alertBox);

        // 翻訳を適用する
        const elements = alertBox.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            this.languageManager.updateSpecificElement(el);
        });

        // イベントリスナー追加
        const closeBtn = alertBox.querySelector('.close-btn');
        const closeModalBtn = alertBox.querySelector('.close-modal-btn');
        const advancedModeBtn = alertBox.querySelector('.advanced-mode-btn');

        // 閉じるボタン
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(alertOverlay);
        });

        // モーダル閉じるボタン
        closeModalBtn.addEventListener('click', () => {
            document.body.removeChild(alertOverlay);
        });

        // 拡張モードボタン
        advancedModeBtn.addEventListener('click', () => {
            // 拡張モードを有効化
            this.advancedModeManager.enableAdvancedMode(true);
            // モーダルを閉じる
            document.body.removeChild(alertOverlay);
        });

        // オーバーレイをクリックしても閉じる
        alertOverlay.addEventListener('click', (e) => {
            if (e.target === alertOverlay) {
                document.body.removeChild(alertOverlay);
            }
        });

        // チェックボックスの変更イベントリスナーを追加
        const checkbox = alertBox.querySelector('#dontShowAgain');
        checkbox.addEventListener('change', (e) => {
            this.settings.showApproximationErrorModal = !e.target.checked;
        });
    }
}