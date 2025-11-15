/**
 * Settings Manager Class
 * グラフ表示設定と環境設定を管理
 */
import { importJSONFile, loadFromJSON } from '../graph/GraphSaveUtils.js';

export class SettingsManager {
    constructor(graphCalculator, curveManager = null, historyManager = null, approximatorManager = null) {
        this.graphCalculator = graphCalculator;
        this.curveManager = curveManager;
        this.historyManager = historyManager;
        // this.approximatorManager = approximatorManager;
        this.panel = document.getElementById('settings-panel');

        // デフォルト設定
        this.settings = {
            showMainGrid: true,
            showSubGrid: true,
            showMicroGrid: true,
            showXAxis: true,
            showYAxis: true,
            showTickLabels: true,
            advancedMode: false
        };

        this.initialized = false;
        this.isOpen = false;

        // 自動的に初期化を実行
        this.initialize();
    }

    /**
     * 設定パネルと設定の初期化
     */
    initialize() {
        if (this.initialized) return;

        // 設定パネルがなければ作成
        if (!this.panel) {
            this.createSettingsPanel();
        }

        // 設定コントロールのイベントリスナーを設定
        this.setupEventListeners();

        this.initialized = true;
    }

    /**
     * 設定パネルのHTML構造を作成
     */
    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'settings-panel';
        panel.className = 'settings-panel';

        panel.innerHTML = `
            <div class="settings-header">
                <i class="material-symbols-rounded">build</i>
                <span><strong data-i18n="settings_panel.title">グラフ設定</strong></span>
                <button id="close-settings" class="close-btn">&times;</button>
            </div>
            <div class="settings-body">
                <div class="settings-group">
                <div class="settings-item main-setting">
                    <label class="settings-checkbox">
                    <input type="checkbox" id="show-main-grid" checked>
                    <span class="checkbox-custom"></span>
                    <i class="material-symbols-rounded">window</i>
                    <span data-i18n="settings_panel.grid.main">主メモリ線</span>
                    </label>
                </div>
                <div class="settings-subgroup">
                    <div class="settings-item sub-grid-item">
                    <label class="settings-checkbox">
                        <input type="checkbox" id="show-sub-grid" checked>
                        <span class="checkbox-custom"></span>
                        <i class="material-symbols-rounded">view_module</i>
                        <span data-i18n="settings_panel.grid.sub">副メモリ線</span>
                    </label>
                    </div>
                    <div class="settings-item micro-grid-item">
                    <label class="settings-checkbox">
                        <input type="checkbox" id="show-micro-grid" checked>
                        <span class="checkbox-custom"></span>
                        <i class="material-symbols-rounded">view_compact</i>
                        <span data-i18n="settings_panel.grid.micro">マイクロメモリ線</span>
                    </label>
                    </div>
                </div>
                <!-- X軸設定 -->
                <div class="settings-item axis-item">
                    <label class="settings-checkbox">
                    <input type="checkbox" id="show-x-axis" checked>
                    <span class="checkbox-custom"></span>
                    <i class="material-symbols-rounded">arrow_range</i>
                    <span data-i18n="settings_panel.axes.x">X軸</span>
                    </label>
                </div>
                <!-- X軸ドメイン設定 (LaTeX形式) -->
                <div class="settings-item domain-range-section x-domain-section">
                    <div class="latex-domain-row">
                    <input type="number" id="x-min-input" class="domain-input" step="any">
                    <span class="latex-symbol">≤</span>
                    <span class="latex-variable">x</span>
                    <span class="latex-symbol">≤</span>
                    <input type="number" id="x-max-input" class="domain-input" step="any">
                    </div>
                </div>
                
                <!-- Y軸設定 -->
                <div class="settings-item axis-item">
                    <label class="settings-checkbox">
                    <input type="checkbox" id="show-y-axis" checked>
                    <span class="checkbox-custom"></span>
                    <i class="material-symbols-rounded">height</i>
                    <span data-i18n="settings_panel.axes.y">Y軸</span>
                    </label>
                </div>
                <!-- Y軸ドメイン表示 (読み取り専用) (LaTeX形式) -->
                <div class="settings-item domain-range-section y-domain-section">
                    <div class="latex-domain-row">
                    <input type="number" id="y-min-input" class="domain-input" disabled step="any">
                    <span class="latex-symbol">≤</span>
                    <span class="latex-variable">y</span>
                    <span class="latex-symbol">≤</span>
                    <input type="number" id="y-max-input" class="domain-input" disabled step="any">
                    </div>
                </div>
                
                <div class="settings-item">
                    <label class="settings-checkbox">
                    <input type="checkbox" id="show-tick-labels" checked>
                    <span class="checkbox-custom"></span>
                    <i class="material-symbols-rounded">pin</i>
                    <span data-i18n="settings_panel.tick_labels">目盛りラベル</span>
                    </label>
                </div>
                <div class="settings-item">
                    <label class="settings-checkbox">
                    <input type="checkbox" id="advanced-mode">
                    <span class="checkbox-custom"></span>
                    <i class="material-symbols-rounded">construction</i>
                    <span data-i18n="settings_panel.advanced_mode">拡張モード</span>
                    </label>
                </div>
                <hr class="settings-divider">
                <div class="settings-item">
                    <button id="import-json-btn" class="export-btn import-btn">
                    <i class="material-symbols-rounded">upload_file</i>
                    <span data-i18n="settings_panel.import_json">JSONをインポート</span>
                    </button>
                </div>
            </div>
            `;

        document.body.appendChild(panel);
        this.panel = panel;

        // インポートボタン用のスタイルを追加
        this.addImportStyles();
    }

    /**
     * インポートボタン用のスタイルを追加
     */
    addImportStyles() {
        // スタイルが既に存在するか確認
        if (document.getElementById('import-styles')) return;

        const style = document.createElement('style');
        style.id = 'import-styles';
        style.textContent = `
      .settings-divider {
        margin: 15px 0;
        border: 0;
        border-top: 1px solid var(--border-color, #ddd);
      }
      
      .export-btn, .import-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 10px 15px;
        border: 1px solid var(--border-color, #ddd);
        border-radius: 5px;
        background-color: var(--panel-bg, #f8f9fa);
        color: var(--text-color, #333);
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;
      }
      
      .export-btn:hover, .import-btn:hover {
        background-color: var(--hover-color, #e9ecef);
      }
      
      .export-btn i, .import-btn i {
        margin-right: 10px;
        font-size: 16px;
      }
      
      .import-btn {
        background-color: var(--secondary-bg, #f1f8ff);
        border-color: var(--secondary-border, #c8e1ff);
      }
      
      .import-btn:hover {
        background-color: var(--secondary-hover, #dbedff);
      }
    `;

        document.head.appendChild(style);
    }

    /**
     * 設定パネルと設定コントロールのイベントリスナーを設定
     */
    setupEventListeners() {
        const settingsBtn = document.getElementById('settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.togglePanel();
            });
        }

        // 閉じるボタン
        const closeBtn = document.getElementById('close-settings');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePanel());
        }

        // チェックボックスに変更イベントリスナーを追加（リアルタイム更新）
        const mainGridCheckbox = document.getElementById('show-main-grid');
        const subGridCheckbox = document.getElementById('show-sub-grid');
        const microGridCheckbox = document.getElementById('show-micro-grid');
        const xAxisCheckbox = document.getElementById('show-x-axis');
        const yAxisCheckbox = document.getElementById('show-y-axis');
        const tickLabelsCheckbox = document.getElementById('show-tick-labels');
        const advancedModeCheckbox = document.getElementById('advanced-mode');

        // メイングリッドの変更イベント
        if (mainGridCheckbox) {
            mainGridCheckbox.addEventListener('change', (e) => {
                this.settings.showMainGrid = e.target.checked;
                this.updateGraphVisibility();
            });
        }

        // 副メモリ線の変更イベント
        if (subGridCheckbox) {
            subGridCheckbox.addEventListener('change', (e) => {
                this.settings.showSubGrid = e.target.checked;
                this.updateGraphVisibility();
            });
        }

        // マイクロメモリ線の変更イベント
        if (microGridCheckbox) {
            microGridCheckbox.addEventListener('change', (e) => {
                this.settings.showMicroGrid = e.target.checked;
                this.updateGraphVisibility();
            });
        }

        // X軸の変更イベント
        if (xAxisCheckbox) {
            xAxisCheckbox.addEventListener('change', (e) => {
                this.settings.showXAxis = e.target.checked;
                this.updateGraphVisibility();
            });
        }

        // Y軸の変更イベント
        if (yAxisCheckbox) {
            yAxisCheckbox.addEventListener('change', (e) => {
                this.settings.showYAxis = e.target.checked;
                this.updateGraphVisibility();
            });
        }

        // 目盛りラベルの変更イベント
        if (tickLabelsCheckbox) {
            tickLabelsCheckbox.addEventListener('change', (e) => {
                this.settings.showTickLabels = e.target.checked;
                this.updateGraphVisibility();
            });
        }

        // 高度な編集モードの変更イベント
        if (advancedModeCheckbox) {
            // 拡張モードの切替: 状態を保存してイベント通知
            advancedModeCheckbox.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                this.settings.advancedMode = enabled;
                localStorage.setItem('grapen-advanced-mode', JSON.stringify(enabled));
                localStorage.setItem('advancedMode', enabled ? 'true' : 'false');
                document.dispatchEvent(new CustomEvent('advancedModeChanged', { detail: { enabled } }));
            });
        }

        // 外部から拡張モードが変更された場合にチェックボックスを同期
        // AdvancedModeManager など外部コンポーネントが現在の状態を通知したときに同期
        // 外部から拡張モードが変更された場合にチェックボックスを同期
        document.addEventListener('advancedModeStateChanged', (ev) => {
            const enabled = !!(ev && ev.detail && ev.detail.enabled);
            if (advancedModeCheckbox) advancedModeCheckbox.checked = enabled;
            this.settings.advancedMode = enabled;
        });

        // 初期状態をAdvancedModeManager または localStorage から取得して反映
        // 初期値をストレージから読み込む（grapen-advanced-mode を優先）
        const storedAdvanced = localStorage.getItem('grapen-advanced-mode');
        if (storedAdvanced !== null) {
            const v = storedAdvanced === '1' || storedAdvanced === 'true';
            if (advancedModeCheckbox) advancedModeCheckbox.checked = v;
            this.settings.advancedMode = v;
        } else {
            const stored = localStorage.getItem('advancedMode');
            if (stored !== null) {
                const v = stored === '1' || stored === 'true';
                if (advancedModeCheckbox) advancedModeCheckbox.checked = v;
                this.settings.advancedMode = v;
            }
        }

        // パネル外をクリックした時に閉じる
        document.addEventListener('click', (e) => {
            // settings ボタンのクリックは無視する
            if (e.target.id === 'settings' || e.target.closest('#settings')) {
                return;
            }

            if (this.isOpen && !this.panel.contains(e.target)) {
                this.hidePanel();
            }
        });

        // escキーでパネルを閉じる
        document.addEventListener('keydown', (e) => {
            if (this.isOpen && e.key === 'Escape') {
                this.hidePanel();
            }
        });

        // ウィンドウリサイズ時にパネルを閉じる
        window.addEventListener('resize', () => { if (this.isOpen) this.hidePanel(); });

        // チェックボックスの状態を初期化
        this.updateCheckboxes();

        // JSONインポートボタン
        const importJsonBtn = document.getElementById('import-json-btn');
        if (importJsonBtn) {
            importJsonBtn.addEventListener('click', () => {
                if (this.graphCalculator) {
                    this.importJSON();
                } else {
                    console.error('グラフ計算機が初期化されていません');
                }
                this.hidePanel();
            });
        }

        // ドメイン範囲入力のイベントリスナー
        const xMinInput = document.getElementById('x-min-input');
        const xMaxInput = document.getElementById('x-max-input');

        if (xMinInput && xMaxInput) {
            // 現在のドメインを取得して表示
            this.updateDomainInputs();

            // X軸範囲入力時の処理（inputイベントで即時反映）
            xMinInput.addEventListener('input', () => this.handleDomainChange());
            xMaxInput.addEventListener('input', () => this.handleDomainChange());
        }

        // Y軸入力は読み取り専用なので、イベントリスナーは設定しない
    }

    /**
     * 設定パネルを表示
     */
    showPanel() {
        if (!this.initialized) {
            this.initialize();
        }

        this.updateCheckboxes();

        // 設定ボタンの位置を基準にパネルを配置
        const settingsBtn = document.getElementById('settings');
        if (settingsBtn) {
            const rect = settingsBtn.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const panelHeight = this.panel.offsetHeight || 300; // 推定値

            // パネルの位置を計算
            let top = rect.bottom + 5; // ボタンの下に5pxのスペース

            // 画面下部に収まるかチェック
            if (top + panelHeight > viewportHeight) {
                // 収まらない場合はボタンの上に表示
                top = rect.top - panelHeight - 5;
            }

            this.panel.style.top = `${top}px`;
            this.panel.style.right = '20px'; // ヘッダーのpadding分を考慮
        }

        this.panel.classList.add('visible');
        this.isOpen = true;

        // ドメイン入力フィールドの値を更新
        this.updateDomainInputs();
    }

    /**
     * 設定パネルを非表示
     */
    hidePanel() {
        this.panel.classList.remove('visible');
        this.isOpen = false;
    }

    /**
     * パネルの表示状態を切り替え
     */
    togglePanel() {
        if (this.isOpen) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }

    /**
     * 現在の設定に基づいてチェックボックスの状態を更新
     */
    updateCheckboxes() {
        const mainGridCheckbox = document.getElementById('show-main-grid');
        const subGridCheckbox = document.getElementById('show-sub-grid');
        const microGridCheckbox = document.getElementById('show-micro-grid');
        const xAxisCheckbox = document.getElementById('show-x-axis');
        const yAxisCheckbox = document.getElementById('show-y-axis');
        const tickLabelsCheckbox = document.getElementById('show-tick-labels');
        const advancedModeCheckbox = document.getElementById('advanced-mode');

        if (mainGridCheckbox) mainGridCheckbox.checked = this.settings.showMainGrid;
        if (subGridCheckbox) subGridCheckbox.checked = this.settings.showSubGrid;
        if (microGridCheckbox) microGridCheckbox.checked = this.settings.showMicroGrid;
        if (xAxisCheckbox) xAxisCheckbox.checked = this.settings.showXAxis;
        if (yAxisCheckbox) yAxisCheckbox.checked = this.settings.showYAxis;
        if (tickLabelsCheckbox) tickLabelsCheckbox.checked = this.settings.showTickLabels;
        if (advancedModeCheckbox) advancedModeCheckbox.checked = this.settings.advancedMode;
    }

    /**
     * 現在の設定をグラフに適用
     */
    updateGraphVisibility() {
        if (!this.graphCalculator) return;

        // GraphCalculatorに設定を適用
        // 主メモリ線の設定
        this.graphCalculator.setMainGridVisibility(this.settings.showMainGrid);

        // 副メモリ線とマイクロメモリ線の設定（主メモリ線に依存）
        if (this.settings.showMainGrid) {
            this.graphCalculator.setSubGridVisibility(this.settings.showSubGrid);
            this.graphCalculator.setMicroGridVisibility(this.settings.showMicroGrid);
        } else {
            this.graphCalculator.setSubGridVisibility(false);
            this.graphCalculator.setMicroGridVisibility(false);
        }

        // X軸とY軸の表示/非表示を設定
        this.graphCalculator.setXAxisVisibility(this.settings.showXAxis);
        this.graphCalculator.setYAxisVisibility(this.settings.showYAxis);

        // 目盛りラベルの表示/非表示を設定
        this.graphCalculator.setTickLabelsVisibility(this.settings.showTickLabels);
    }

    /**
     * 設定を適用する（JSONからの復元時などに使用）
     * @param {Object} settings - 適用する設定オブジェクト
     */
    applySettings(settings) {
        // 渡された設定値を現在の設定に適用
        if (!settings) return;

        // 設定の更新
        if (settings.showMainGrid !== undefined) this.settings.showMainGrid = settings.showMainGrid;
        if (settings.showSubGrid !== undefined) this.settings.showSubGrid = settings.showSubGrid;
        if (settings.showMicroGrid !== undefined) this.settings.showMicroGrid = settings.showMicroGrid;
        if (settings.showXAxis !== undefined) this.settings.showXAxis = settings.showXAxis;
        if (settings.showYAxis !== undefined) this.settings.showYAxis = settings.showYAxis;
        if (settings.showTickLabels !== undefined) this.settings.showTickLabels = settings.showTickLabels;
        if (settings.advancedMode !== undefined) this.settings.advancedMode = settings.advancedMode;

        // チェックボックスの状態を更新
        this.updateCheckboxes();

        // 曲線近似設定を更新
        // this.approximatorManager.loadSettings(settings.approximatorSettings || {});
        // this.approximatorManager.applySettings();

        // グラフに設定を適用
        this.updateGraphVisibility();
    }

    /**
     * JSONファイルをインポートする
     */
    importJSON() {
        // ファイル選択ダイアログを表示
        importJSONFile((jsonData) => {
            if (!jsonData) {
                console.error('JSONデータが空です');
                return;
            }

            try {
                // JSONをパース（文字列の場合）
                const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
                console.log('JSONデータを読み込みました:', data);

                // グラフデータのロード処理を実行
                this.loadGraphFromJSON(data);
            } catch (error) {
                console.error('JSONデータの処理中にエラーが発生しました:', error);
                console.log('エラーが発生したJSONデータ:', jsonData);
                alert('グラフデータの読み込みに失敗しました。');
            }
        });
    }

    /**
     * JSON形式のデータからグラフを復元する
     * URLハッシュパラメータや外部ファイルからの読み込みで利用可能
     * @param {Object} jsonData - JSONデータオブジェクト
     * @param {boolean} resetHistory - 履歴をリセットするかどうか
     * @returns {Promise<boolean>} 復元に成功したかどうか
     */
    async loadGraphFromJSON(jsonData, resetHistory = true) {
        if (!jsonData) {
            console.error('JSONデータが空です');
            return false;
        }

        try {
            // GraphCalculatorのステートを復元
            const result = loadFromJSON(this.graphCalculator, jsonData,
                // 設定復元コールバック
                (settingsData) => {
                    if (settingsData) {
                        this.settings = { ...this.settings, ...settingsData };
                        this.applySettings(settingsData);
                    }
                }
            );

            // 復元に成功した場合、CurveManagerのUIを復元
            if (result && result.success && this.curveManager) {
                // 曲線リストをクリア
                this.curveManager.curves = [];
                
                // UIManagerがアクセス可能な場合は設定も更新
                if (this.curveManager.uiManager) {
                    this.curveManager.uiManager.settings.nextCurveId = 0;
                }

                // 復元された曲線データを処理
                result.curves.forEach((curveData) => {
                    // 強調表示曲線はスキップ
                    if (curveData.id && curveData.id.toString().startsWith('emphasis-')) {
                        return;
                    }

                    // 曲線データから必要な情報を取得
                    const curveId = this.curveManager.uiManager ? 
                        this.curveManager.uiManager.settings.nextCurveId++ : 
                        this.curveManager.curves.length;
                        
                    const color = curveData.color || '#000';
                    const width = curveData.width || 4;
                    const latexEquations = curveData.latexEquations || [];
                    const knotPoints = curveData.knotPoints || [];
                    const isHidden = curveData.isHidden !== undefined ? curveData.isHidden : (curveData.visibility === false);
                    const isDetailShown = !!curveData.isDetailShown;
                    const graphCurve = curveData.graphCurve;
                    const svgPath = d3.select(graphCurve.path);
                    const preKnots = curveData.preKnots || [];
                    const minKnots = curveData.minKnots || 2;
                    const maxKnots = curveData.maxKnots || 10;
                    const originalPoints = curveData.originalPoints || [];

                    // 曲線タイプ（不明な場合は'parametric'）
                    const type = curveData.type || 'parametric';

                    // CurveManagerに曲線を追加
                    this.curveManager.addCurve({
                        id: curveId,
                        type: type,
                        path: svgPath,
                        color: color,
                        size: width,
                        graphCurve: graphCurve,
                        latexEquations: latexEquations,
                        approximatorSettings: {},
                        preKnots: preKnots,
                        minKnots: minKnots,
                        maxKnots: maxKnots,
                        originalPoints: originalPoints
                    });

                    // 節点データを保存
                    if (knotPoints && Array.isArray(knotPoints)) {
                        this.curveManager.curves[curveId].knotPoints = knotPoints;
                    }

                    // 表示/非表示状態を設定
                    this.curveManager.setCurveVisibility(curveId, !isHidden);

                    // 詳細表示状態を設定
                    this.curveManager.setCurveDetailState(curveId, isDetailShown);
                });

                // 曲線リストのUIを更新
                this.curveManager.updateCurveList();

                // 履歴をリセットするオプションが有効な場合
                if (resetHistory && this.historyManager && this.curveManager.uiManager) {
                    // 履歴をリセット（復元されたグラフは初期状態として扱う）
                    this.historyManager.undoStack = [];
                    this.historyManager.redoStack = [];
                    
                    // UIManagerに状態更新を通知
                    this.curveManager.uiManager.updateHistoryButtons();
                }

                return true;
            } else {
                console.error('JSONからの復元に失敗しました:', result);
                return false;
            }
        } catch (error) {
            console.error('JSONデータの処理中にエラーが発生しました:', error);
            return false;
        }
    }

    /**
     * ドメイン入力値を更新
     */
    updateDomainInputs() {
        if (!this.graphCalculator) return;

        const domain = this.graphCalculator.getDomain();

        // X軸の入力フィールドを更新
        const xMinInput = document.getElementById('x-min-input');
        const xMaxInput = document.getElementById('x-max-input');
        if (xMinInput && xMaxInput) {
            xMinInput.value = domain.xMin.toFixed(2);
            xMaxInput.value = domain.xMax.toFixed(2);
        }

        // Y軸の入力フィールドを更新（編集可能に変更）
        const yMinInput = document.getElementById('y-min-input');
        const yMaxInput = document.getElementById('y-max-input');
        if (yMinInput && yMaxInput) {
            yMinInput.value = domain.yMin.toFixed(2);
            yMaxInput.value = domain.yMax.toFixed(2);
        }
    }

    /**
     * X軸ドメイン変更処理
     */
    handleDomainChange() {
        if (!this.graphCalculator) return;

        const xMinInput = document.getElementById('x-min-input');
        const xMaxInput = document.getElementById('x-max-input');

        if (!xMinInput || !xMaxInput) return;

        const xMin = parseFloat(xMinInput.value);
        const xMax = parseFloat(xMaxInput.value);

        // 値が有効で、最小値が最大値より小さい場合のみ適用
        if (!isNaN(xMin) && !isNaN(xMax) && xMin < xMax) {
            // 現在のドメインを取得
            const currentDomain = this.graphCalculator.getDomain();

            // SVGのサイズを取得
            const width = this.graphCalculator.svg.clientWidth;
            const height = this.graphCalculator.svg.clientHeight;

            // X軸のスケールでY軸も同じスケールを維持するように計算
            const xScale = (xMax - xMin);

            // 中心点を計算
            const yCenter = (currentDomain.yMax + currentDomain.yMin) / 2;

            // Y軸範囲を計算（X軸と同じスケールを維持）
            const yRange = xScale * (height / width);
            const yMin = yCenter - yRange / 2;
            const yMax = yCenter + yRange / 2;

            // ドメインを更新 (アニメーション有効)
            this.graphCalculator.setDomain({
                xMin: xMin,
                xMax: xMax,
                yMin: yMin,
                yMax: yMax
            }, true); // アニメーションあり

            // 入力フィールドの値を更新
            setTimeout(() => this.updateDomainInputs(), 300);
        } else {
            // 無効な値の場合は元に戻す
            this.updateDomainInputs();
        }
    }
}
