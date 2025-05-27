/**
 * Approximator Manager Class
 * 曲線近似の設定を管理するモーダルウィンドウ
 */
export class ApproximatorManager {
    constructor(curveManager = null) {
        this.curveManager = curveManager;
        this.panel = document.getElementById('approximator-panel');

        // デフォルト設定を拡張
        this.settings = {
            ...this.curveManager.approximatorSettings,
            // old_index.htmlから追加
            errorThreshold: 30.0,
            samplingRate: 1
        };

        this.controlElements = new Map(); // 設定要素の参照を保持
        this.initialized = false;
        this.isOpen = false;

        this.initialize();
    }

    /**
     * 設定パネルと設定の初期化
     */
    initialize() {
        if (this.initialized) return;

        // 設定パネルがなければ作成
        if (!this.panel) {
            this.createApproximatorPanel();
        }

        // 設定コントロールのイベントリスナーを設定
        this.setupEventListeners();

        this.initialized = true;
    }

    /**
     * 近似設定パネルのHTML構造を作成
     */
    createApproximatorPanel() {
        const panel = document.createElement('div');
        panel.id = 'approximator-panel';
        panel.className = 'settings-panel approximator-panel';

        panel.innerHTML = `
            <div class="settings-header">
                <i class="material-symbols-rounded">auto_graph</i>
                <span><strong data-i18n="approximator.title">曲線近似設定</strong></span>
                <button id="close-approximator" class="close-btn">&times;</button>
            </div>
            <div class="settings-body">
                <div class="settings-group">
                <div class="settings-item">
                    <div class="settings-subheading" data-i18n="approximator.display.title">曲線の近似表示のデフォルト設定</div>
                    <div class="curve-options">
                    ${this._createButtonOption('showKnotsDefault', 'Show knots', 'commit')}
                    </div>
                </div>
                ${this._createSliderOption('maxKnots', 'approximator.settings.max_knots', 2, 10, 1)}
                <!-- old_index.htmlから追加 -->
                ${this._createSliderOption('errorThreshold', 'approximator.settings.error_threshold', 1, 30, 0.1)}
                ${this._createSliderOption('samplingRate', 'approximator.settings.sampling_rate', 1, 10, 1)}
                </div>
                <div class="settings-buttons">
                <button id="approximator-default" class="default-btn">
                    <i class="material-symbols-rounded">settings_backup_restore</i>
                    <span data-i18n="approximator.buttons.default">デフォルト</span>
                </button>
                <button id="approximator-apply" class="apply-btn">
                    <i class="material-symbols-rounded">done</i>
                    <span data-i18n="approximator.buttons.apply">適用</span>
                </button>
                </div>
            </div>
            `;

        document.body.appendChild(panel);
        this.panel = panel;
    }

    /**
     * ボタンオプションのHTML生成
     * @private
     */
    _createButtonOption(id, title, icon) {
        const active = this.settings[id];
        return `
            <button class="curve-option-btn ${active ? 'active' : ''}" id="${id}" title="${title}">
                <i class="material-symbols-rounded">${icon}</i>
            </button>
            `
    }

    /**
     * チェックボックスオプションのHTML生成
     * @private
     */
    _createCheckboxOption(id, label) {
        return `
            <div class="settings-item">
                <label class="settings-checkbox">
                <input type="checkbox" id="${id}" ${this.settings[id] ? 'checked' : ''}>
                <span class="checkbox-custom"></span>
                <span>${label}</span>
                </label>
            </div>
            `;
    }

    /**
     * スライダーオプションのHTML生成
     * @private
     */
    _createSliderOption(id, i18nKey, min, max, step) {
        // ラベル・説明文を取得
        const settingLabels = {
            maxKnots: {
                label: '最大節点数',
                descriptionI18n: 'approximator.settings.max_knots.desc'
            },
            errorThreshold: {
                label: '許容誤差',
                descriptionI18n: 'approximator.settings.error_threshold.desc'
            },
            samplingRate: {
                label: 'サンプリングレート',
                descriptionI18n: 'approximator.settings.sampling_rate.desc'
            }
            // 必要に応じて他のパラメータも追加
        };
        const label = settingLabels[id]?.label || '';
        const descriptionI18n = settingLabels[id]?.descriptionI18n || '';

        return `
            <div class="settings-item">
                <label class="settings-slider">
                <span data-i18n="${i18nKey}">${label}</span>
                <div class="slider-container">
                    <input type="range" id="${id}" 
                    min="${min}" max="${max}" step="${step}"
                    value="${this.settings[id]}">
                    <input type="number" id="${id}-number"
                    min="${min}" max="${max}" step="${step}"
                    value="${this.settings[id]}">
                </div>
                ${descriptionI18n ? `<div class="slider-description" data-i18n="${descriptionI18n}"></div>` : ''}
                </label>
            </div>
            `;
    }

    /**
     * 設定値を更新
     * @private
     */
    updateSetting(settingId, value) {
        this.settings[settingId] = value;

        // 変更をログに出力
        this._logSettingsChange(settingId, value);
    }

    /**
     * 設定変更をログに出力
     * @private
     */
    _logSettingsChange(settingId, value) {
        // UIラベル・説明文をここで管理
        const settingLabels = {
            showKnotsDefault: {
                label: '節点表示（デフォルト）',
                description: '曲線近似時に節点（分割点）を表示するかどうかのデフォルト設定です。'
            },
            maxKnots: {
                label: '最大節点数',
                description: '曲線近似時に分割できる最大の節点（分割点）の数です。'
            },
            errorThreshold: {
                label: '許容誤差',
                description: '曲線近似の許容誤差です。低い値にすると元の曲線に忠実な近似になりますが、複雑なパスになります。'
            },
            samplingRate: {
                label: 'サンプリングレート',
                description: '描画時の点のサンプリング間隔です。大きい値にすると点の数が減り、処理が軽くなりますが精度は下がります。'
            }
            // 必要に応じて他のパラメータも追加
        };

        // 例: 設定変更時にラベルと説明をログ出力
        if (settingLabels[settingId]) {
            // console.log(`[近似設定変更] ${settingLabels[settingId].label}: ${value} (${settingLabels[settingId].description})`);
        } else {
            // console.log(`[近似設定変更] ${settingId}: ${value}`);
        }
    }

    /**
     * デフォルト設定を読み込む
     */
    loadDefaultSettings() {
        const defaultSettings = {
            showKnotsDefault: true,
            maxKnots: 10,
            // old_index.htmlから追加
            errorThreshold: 30.0,
            samplingRate: 1
        };

        // 設定を更新
        Object.keys(defaultSettings).forEach(key => {
            if (this.settings.hasOwnProperty(key)) {
                this.settings[key] = defaultSettings[key];
            }
        });

        // スライダーの更新
        ['maxKnots', 'errorThreshold', 'samplingRate'].forEach(key => {
            const element = this.controlElements.get(key);
            if (element) {
                element.value = defaultSettings[key];
                // 数値入力フィールドも更新
                const numberInput = this.controlElements.get(`${key}-number`);
                if (numberInput) {
                    numberInput.value = defaultSettings[key];
                }
            }
        });

        console.log('デフォルト設定を読み込みました', defaultSettings);
        this.applySettings();
    }

    /**
     * イベントリスナーの設定を拡張
     */
    setupEventListeners() {
        const curveOptionsBtn = document.getElementById('curve-options');
        if (curveOptionsBtn) {
            curveOptionsBtn.addEventListener('click', () => {
                this.togglePanel();
            });
        }

        // 閉じるボタン
        const closeBtn = document.getElementById('close-approximator');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePanel());
        }

        // スライダーとチェックボックスのイベントリスナーを設定
        Object.keys(this.settings).forEach(settingId => {
            const element = document.getElementById(settingId);
            if (!element) return;

            this.controlElements.set(settingId, element);

            if (element.type === 'checkbox') {
                d3.select(`#${settingId}`)
                    .on('change', (event) => {
                        this.updateSetting(settingId, event.target.checked);
                    });
            } else if (element.type === 'range') {
                // スライダーの数値入力フィールド
                const numberInput = document.getElementById(`${settingId}-number`);
                this.controlElements.set(`${settingId}-number`, numberInput);

                // スライダーの変更イベント
                d3.select(`#${settingId}`)
                    .on('input', (event) => {
                        const value = parseFloat(event.target.value);
                        numberInput.value = value;
                        this.updateSetting(settingId, value);
                    });

                // 数値入力の変更イベント
                d3.select(`#${settingId}-number`)
                    .on('change', (event) => {
                        const value = parseFloat(event.target.value);
                        element.value = value;
                        this.updateSetting(settingId, value);
                    });
            }
        });

        // 曲線オプションボタンのイベントリスナー設定 (Refactored)
        this._setupToggleButton('showKnotsDefault', true);

        // パネル外をクリックした時に閉じる
        d3.select(document)
            .on('pointerdown', (event) => {
                const e = event;
                if (e.target.id === 'curve-options' || e.target.closest('#curve-options')) {
                    return;
                }

                if (this.isOpen && !this.panel.contains(e.target)) {
                    this.hidePanel();
                }
            });

        // escキーでパネルを閉じる
        d3.select(document)
            .on('keydown', (event) => {
                if (this.isOpen && event.key === 'Escape') {
                    this.hidePanel();
                }
            });

        // ウィンドウリサイズ時にパネルを閉じる
        d3.select(window)
            .on('resize', () => {
                if (this.isOpen) this.hidePanel();
            });

        // デフォルトボタン
        const defaultBtn = document.getElementById('approximator-default');
        if (defaultBtn) {
            d3.select('#approximator-default')
                .on('pointerdown', () => {
                    this.loadDefaultSettings();
                });
        }

        // 適用ボタン
        const applyBtn = document.getElementById('approximator-apply');
        if (applyBtn) {
            d3.select('#approximator-apply')
                .on('pointerdown', () => {
                    this.applySettings();
                    console.log('近似設定を適用しました', this.settings);

                    this.hidePanel();
                });
        }
    }

    /**
     * ボタンクリックイベントを作成
     * @private
     * @param {string} settingKey - The key in this.settings to update.
     * @param {boolean} invertActiveState - Whether the 'active' class represents the inverse of the setting's boolean value.
     */
    _setupToggleButton(settingKey, invertActiveState = false) {
        const button = document.getElementById(settingKey);

        const isActive = this.settings[settingKey];
        button.classList.toggle('active', isActive);

        d3.select(`#${settingKey}`)
            .on('pointerdown', () => {
                const newState = !this.settings[settingKey];
                this.settings[settingKey] = newState;
                button.classList.toggle('active', this.settings[settingKey]);
                this._logSettingsChange(settingKey, newState);
            });
    }

    /**
     * 設定パネルを表示
     */
    showPanel() {
        if (!this.initialized) {
            this.initialize();
        }

        // curve-options ボタンの位置を基準にパネルを配置
        const curveOptionsBtn = document.getElementById('curve-options');
        if (curveOptionsBtn) {
            const rect = curveOptionsBtn.getBoundingClientRect();
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
     * ボタンの状態を更新
     * @private
     */
    _updateButtonState(settingKey, isActive = false) {
        const button = document.getElementById(settingKey);
        if (button && this.settings[settingKey] !== undefined) {
            button.classList.toggle('active', isActive);
        }
    }

    /**
     * 現在の設定を適用する
     */
    applySettings() {
        if (this.curveManager?.approximator?.options) {
            const options = this.curveManager.approximator.options;
            options.maxKnots = this.settings.maxKnots;
            // old_index.htmlから追加
            options.errorThreshold = this.settings.errorThreshold;
            options.samplingRate = this.settings.samplingRate;

            // 節点表示のデフォルト設定を更新
            if (this.curveManager.settings) {
                this.curveManager.settings.showKnotsDefault = this.settings.showKnotsDefault;
            }
        }

        // イベントを発行
        const event = new CustomEvent('approximatorSettingsChanged', {
            detail: { settings: { ...this.settings } }
        });
        document.dispatchEvent(event);
    }

    /**
     * 設定を適用する（JSONからの復元時などに使用）
     * @param {Object} settings - 適用する設定オブジェクト
     */
    loadSettings(settings) {
        // 渡された設定値を現在の設定に適用
        if (!settings) return;

        // 設定の更新
        if (settings !== undefined) {
            this.settings = { ...this.settings, ...settings };
        }

        // 設定を適用
        this.applySettings();

        console.log('近似設定を復元しました', this.settings);
    }

    /**
     * 現在の近似設定を取得する
     * @returns {object} - 近似設定オブジェクト
     */
    getSettings() {
        return this.settings;
    }
}
