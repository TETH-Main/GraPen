import { AlertModal } from '../modal/AlertModal.js';

/**
 * ペンツール管理クラス
 * カラーピッカーとサイズスライダーのUIとイベントを管理
 */
export class PenToolManager {
    constructor(settings, curveManager, languageManager) {
        this.settings = settings;
        this.curveManager = curveManager;

        const defaultColor = this.settings.currentColor || '#cccccc';
        this.prevColor = defaultColor;
        this.currentColor = defaultColor;
        this.initialColor = null; // 色の変更履歴を追跡するための初期色

        // カラーピッカーのDOM要素
        this.panel = null;
        this.colorDisplay = null;
        this.colorArea = null;
        this.colorAreaCtx = null;
        this.colorCursor = null;
        this.valueSlider = null;
        this.colorPreview = null;
        this.hexInput = null;
        this.closeButton = null;

        // サイズスライダーのDOM要素
        this.sizeSlider = null;
        this.currentSize = this.settings.currentSize || 6;

        // HSVカラー状態
        this.hsv = { h: 0, s: 0, v: 0.8 };

        // カラーパレットのリスト（デフォルト8色）
        this.defaultColors = [
            '#000000', '#c74440', '#2d70b3', '#348543',
            '#fa7e19', '#6042a6', '#ff66b2', '#7e7e7e'
        ];

        // 現在のパレット（デフォルト色からスタート）
        this.colorPalette = [...this.defaultColors];

        // 削除関連の状態
        this.activeDeletePreset = null;
        // 表示された削除ボタンを自動で非表示にするタイマー（長めのタイムアウト）
        this.deleteRevealTimer = null;
        // タップ直後に即時表示されるのを防ぐための短い遅延タイマー（誤って同時に削除されるのを防止）
        this.deleteShowDelayTimer = null;
        this.coarsePointerMatcher = (typeof window !== 'undefined' && window.matchMedia)
            ? window.matchMedia('(hover: none)')
            : null;

        // パネルの状態管理
        this.isOpen = false;

        // 言語マネージャー参照
        this.languageManager = languageManager;
        this.alertModal = new AlertModal(languageManager);

        // サイドバータブ制御用のコールバック
        this.sidebarTabActivator = null;
        this._suppressSidebarTabActivation = false;

        // 現在アクティブなポインタ（Hue/SVドラッグ）を追跡
        this.activePointer = null;

        // ローカルストレージからカスタム色をロード
        if (!this.settings.currentColor) {
            this.settings.currentColor = defaultColor;
        }

        this.loadCustomColors();

        // ペンツールの初期化
        this.initialize();
    }

    /**
     * ローカルストレージからカスタムカラーをロード
     */
    loadCustomColors() {
        try {
            const savedColors = localStorage.getItem('GraPen_customColors');
            if (savedColors) {
                const customColors = JSON.parse(savedColors);
                // カスタム色を追加（重複を避ける）
                customColors.forEach(color => {
                    if (!this.colorPalette.includes(color)) {
                        this.colorPalette.push(color);
                    }
                });
            }
        } catch (e) {
            console.error('カスタムカラーのロードに失敗しました:', e);
        }
    }

    /**
     * カスタムカラーをローカルストレージに保存
     */
    saveCustomColors() {
        try {
            // デフォルト色を除外したカスタム色のみを保存
            const customColors = this.colorPalette.filter(color => !this.defaultColors.includes(color));
            localStorage.setItem('GraPen_customColors', JSON.stringify(customColors));
        } catch (e) {
            console.error('カスタムカラーの保存に失敗しました:', e);
        }
    }

    /**
     * ペンツールの初期化
     */
    initialize() {
        // カラーピッカーのHTML作成
        this.createColorPickerHTML();

        // DOM要素の参照を取得
        this.panel = document.getElementById('color-picker-panel');
        this.colorDisplay = document.getElementById('color-display');
        this.hueRingCanvas = document.getElementById('hue-ring-canvas');
        this.hueRingCursor = document.getElementById('hue-ring-cursor');
        this.svSquareCanvas = document.getElementById('sv-square-canvas');
        this.svSquareCursor = document.getElementById('sv-square-cursor');
        this.colorPreview = document.getElementById('color-preview');
        this.hexInput = document.getElementById('color-hex-input');
        this.sizeSlider = document.getElementById('size');
        this.closeButton = this.panel ? this.panel.querySelector('[data-role="close-picker"]') : null;

        if (this.hueRingCanvas) {
            this.hueRingCtx = this.hueRingCanvas.getContext('2d');
        }
        if (this.svSquareCanvas) {
            this.svSquareCtx = this.svSquareCanvas.getContext('2d');
        }

        if (this.valueSlider) {
            this.valueSlider.value = String(Math.round((this.hsv.v || 0) * 100));
        }

        if (this.isPanelEmbedded() && this.panel) {
            this.panel.classList.add('visible');
        }

        // サイズスライダーの初期値を設定から読み込み
        if (this.sizeSlider) {
            this.currentSize = Number(this.sizeSlider.value);
            this.settings.currentSize = this.currentSize;
            this.settings.prevSize = this.currentSize;
        }

        if (this.closeButton) {
            this.closeButton.setAttribute('aria-expanded', 'true');
        }

        // イベントリスナーの設定
        this.setupEventListeners();

        // 初期パレットを描画
        this.updateColorPalette();

        this.updateColorDisplayMini(this.settings.currentColor || '#000000');
        const initialColor = this.settings.currentColor || '#000000';

        // 初期色からHSV値を設定
        this.setColorFromHex(initialColor);

        // キャンバスを初期描画
        if (this.hueRingCanvas && this.svSquareCanvas) {
            this.renderHueRing();
            this.renderSVSquare();
            requestAnimationFrame(() => this.updateCursorPositions());
        }

        this.updateSizeDisplayMini(this.settings.currentSize || 8);
    }

    /**
     * 色を設定する
     * @param {string} color - 色（16進数形式：#RRGGBB）
     */
    setColor(color) {
        if (!color) return;

        // 設定オブジェクトに色を保存
        this.settings.currentColor = color;

        // カーブが選択されている場合はその色を更新
        // if (this.settings.selectCurveId !== null) {
        //   if (this.curveManager) {
        //     // styleChangeとして記録するため、現在のサイズも渡す
        //     const currentSize = this.curveManager.curves[this.settings.selectCurveId].size;
        //     this.curveManager.recordStyleChange(color, currentSize);
        //   }
        // }
    }

    /**
     * 色の変更を開始時に現在の色を記録
     */
    beginColorChange() {
        this.initialColor = this.settings.currentColor;
    }

    /**
     * 色の変更を完了時に履歴を記録（変更があれば）
     */
    finishColorChange() {
        if (this.initialColor && this.initialColor !== this.settings.currentColor) {
            console.log('Color changed:', this.settings.currentColor);
            if (this.settings.selectCurveId !== null && this.curveManager) {
                console.log('Curve selected:', this.settings.selectCurveId);
                this.curveManager.recordColorChange(this.settings.currentColor, this.initialColor);
                // const curve = this.curveManager.curves[this.settings.selectCurveId];
                // this.curveManager.recordStyleChange(curve.color, curve.size);
            } else {
                // 曲線が選択されていない場合はデフォルト色変更として記録
                if (this.curveManager && this.curveManager.historyManager) {
                    this.curveManager.historyManager.addAction({
                        type: 'defaultStyleChange',
                        oldStyle: {
                            color: this.initialColor,
                            size: this.settings.currentSize
                        },
                        newStyle: {
                            color: this.settings.currentColor,
                            size: this.settings.currentSize
                        }
                    });
                }
            }
        }

        // 初期色をリセット
        this.initialColor = null;
    }

    /**
     * カラーピッカーのHTML要素を作成
     */
    createColorPickerHTML() {
        if (document.getElementById('color-picker-panel')) return;

        const panelHTML = `
            <div id="color-picker-panel" class="color-picker-panel">
                <div class="color-picker-header">
                    <div class="header-left">
                        <i class="material-symbols-rounded none-event" aria-hidden="true">palette</i>
                    </div>
                    <div class="color-picker-title" data-i18n="pen_panel.color_title">ペンの色と太さ</div>
                    <button type="button" class="details-dropdown ignore-selection" data-role="close-picker" aria-label="カラーピッカーを折りたたむ" aria-controls="color-picker-body" aria-expanded="true" title="折りたたむ">
                        <i class="material-symbols-rounded none-event">expand_more</i>
                    </button>
                </div>
                <div class="color-picker-body" id="color-picker-body">
                    <div class="color-area-container">
                        <div class="size-slider-section" aria-label="ペンの太さ">
                            <i class="material-symbols-rounded size-slider-icon size-slider-icon-max none-event" aria-hidden="true">eraser_size_5</i>
                            <div id="size-slider-container" class="size-slider-container">
                                <input
                                    type="range"
                                    id="size"
                                    min="1"
                                    max="20"
                                    value="6"
                                    class="size-slider"
                                    aria-label="ペンの太さ"
                                >
                            </div>
                            <i class="material-symbols-rounded size-slider-icon size-slider-icon-min none-event" aria-hidden="true">eraser_size_1</i>
                        </div>
                        <div class="color-ring-wrapper" data-role="hue-ring">
                            <canvas id="hue-ring-canvas" width="160" height="160" aria-hidden="true"></canvas>
                            <div id="hue-ring-cursor" class="color-cursor" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360" aria-valuenow="210"></div>
                            <div class="sv-square-wrapper" data-role="sv-square">
                            <canvas id="sv-square-canvas" width="88" height="88" aria-hidden="true"></canvas>
                                <div id="sv-square-cursor" class="color-cursor" role="slider" aria-label="Saturation/Value" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75"></div>
                                <input type="range" id="sv-keyboard-fallback" class="sr-only" min="0" max="100" data-role="sv-radial" aria-label="Saturation and Value">
                            </div>
                        </div>
                        <div id="color-preview" class="color-preview" role="button" tabindex="0" aria-label="現在の色をパレットに保存" title="現在の色をパレットに保存"></div>
                    </div>
                    <div class="color-preview-container">
                        <input type="text" id="color-hex-input" class="color-hex-input" value="#000000">
                        <!-- color-preview は上の color-area-container 内に移動しました -->
                    </div>
                    <div class="color-presets" id="color-presets"></div>
                </div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = panelHTML;
        const panelElem = tempDiv.firstElementChild;

        if (panelElem) {
            panelElem.setAttribute('role', 'tabpanel');
            panelElem.setAttribute('aria-hidden', 'false');
            panelElem.dataset.role = 'sidebar-tab';
            panelElem.dataset.tab = 'color';
            panelElem.setAttribute('aria-labelledby', 'sidebar-tab-color');
        }

        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            panelElem.classList.add('color-picker-panel--embedded');
            panelElem.dataset.embedded = 'true';

            const curveList = document.getElementById('curve-list');
            if (curveList && curveList.parentElement === sidebar) {
                sidebar.insertBefore(panelElem, curveList);
            } else {
                sidebar.appendChild(panelElem);
            }

            panelElem.classList.add('visible');
            panelElem.classList.remove('active');
        } else {
            document.body.appendChild(panelElem);
        }

        document.dispatchEvent(new CustomEvent('grapen:sidebar-panel-ready', {
            detail: { tab: 'color', element: panelElem }
        }));
    }

    /**
     * カラーパレットを更新
     */
    updateColorPalette() {
        const presetsContainer = document.getElementById('color-presets');
        if (!presetsContainer) return;

        this.clearDeleteRevealState();

        // パレットをクリア
        presetsContainer.innerHTML = '';

        // パレットの色を追加
        this.colorPalette.forEach((color, index) => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-preset';
            colorDiv.style.backgroundColor = color;
            colorDiv.setAttribute('data-color', color);
            colorDiv.setAttribute('role', 'button');
            colorDiv.setAttribute('tabindex', '0');

            // デフォルト色かカスタム色かを判定
            const isDefaultColor = this.defaultColors.includes(color);
            if (isDefaultColor) {
                colorDiv.classList.add('default-color'); // デフォルト色に特別なクラスを追加

                // ロックアイコンを追加
                const lockIcon = document.createElement('i');
                lockIcon.className = 'material-symbols-rounded lock-icon none-event';
                lockIcon.innerHTML = 'lock';
                colorDiv.appendChild(lockIcon);
            }

            const selectColor = (event, { forceReveal = false } = {}) => {
                if (event && event.target.closest('.color-preset-delete')) {
                    return;
                }

                if (!this.isOpen) {
                    this.showColorPicker();
                }

                this.setColorFromHex(color);
                this.applyColor();

                if (this.settings.selectCurveId !== null && this.curveManager) {
                    this.curveManager.recordColorChange(this.settings.currentColor);
                }

                if (!isDefaultColor && (forceReveal || this.shouldRevealDeleteOnPointer(event))) {
                    // キーボード等で強制的に表示する場合は即時に表示する
                    if (forceReveal) {
                        this.revealDeleteButton(colorDiv);
                    } else {
                        // タップ直後に削除ボタンがクリック可能になるのを防ぐため、少し遅らせて表示する
                        if (this.deleteShowDelayTimer) {
                            clearTimeout(this.deleteShowDelayTimer);
                        }
                        this.deleteShowDelayTimer = setTimeout(() => {
                            this.revealDeleteButton(colorDiv);
                            this.deleteShowDelayTimer = null;
                        }, 200); // 200ms：タッチの連続動作を防ぐ小さなデバウンス
                    }
                }
            };

            d3.select(colorDiv)
                .on('pointerdown.penTool', (event) => {
                    selectColor(event);
                })
                .on('keydown.penTool', (event) => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        selectColor(event, { forceReveal: true });
                    }
                })
                .on('focusin.penTool', () => {
                    if (!this.isOpen) {
                        this.showColorPicker();
                    }
                });

            // カスタム色には削除ボタンを常時表示（ホバーで強調）
            if (!isDefaultColor) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'color-preset-delete';
                deleteBtn.innerHTML = '<i class="material-symbols-rounded">delete</i>';
                deleteBtn.setAttribute('type', 'button');
                deleteBtn.setAttribute('aria-label', 'Remove color from palette');
                d3.select(deleteBtn).on('click.penTool', (e) => {
                    // DOM上は存在していても、実際に表示されていない（.show-delete が無い）場合は無視する
                    if (!colorDiv.classList.contains('show-delete')) return;
                    e.stopPropagation();
                    e.preventDefault();
                    this.clearDeleteRevealState(colorDiv);
                    this.deleteColorFromPalette(index);
                });
                colorDiv.appendChild(deleteBtn);
            }

            presetsContainer.appendChild(colorDiv);
        });
    }
    /**
     * カラーパレットに現在の色を追加
     */
    addColorToPalette() {
        if (!this.colorPalette.includes(this.currentColor)) {
            this.colorPalette.push(this.currentColor);
            this.updateColorPalette();

            // パレット変更を履歴に記録
            if (this.curveManager && this.curveManager.historyManager) {
                this.curveManager.historyManager.addAction({
                    type: 'addToPalette',
                    color: this.currentColor,
                    paletteState: [...this.colorPalette]
                });
            }

            // カスタム色を保存
            this.saveCustomColors();
        } else {
            this.alertModal.show('同じ色が登録されています。', {
                type: 'error',
                position: 'center-top',
                targetElement: this.panel,
                i18nKey: 'pen_panel.palette.same_color'
            });
        }
    }

    /**
     * パレットから色を削除
     * @param {number} index - 削除する色のインデックス
     */
    deleteColorFromPalette(index) {
        // デフォルト色は削除できないように
        if (index < this.defaultColors.length) return;

        this.clearDeleteRevealState();

        // 削除前のパレット状態を保存
        const oldPalette = [...this.colorPalette];
        const deletedColor = this.colorPalette[index];

        // パレットから削除
        this.colorPalette.splice(index, 1);

        // パレット更新
        this.updateColorPalette();

        // パレット変更を履歴に記録
        if (this.curveManager && this.curveManager.historyManager) {
            this.curveManager.historyManager.addAction({
                type: 'deleteFromPalette',
                index: index,
                color: deletedColor,
                oldPalette: oldPalette,
                newPalette: [...this.colorPalette]
            });
        }

        // カスタム色を保存
        this.saveCustomColors();
    }

    revealDeleteButton(presetElement) {
        if (!presetElement) return;

        if (this.activeDeletePreset && this.activeDeletePreset !== presetElement) {
            this.activeDeletePreset.classList.remove('show-delete');
        }

        presetElement.classList.add('show-delete');
        this.activeDeletePreset = presetElement;

        if (this.deleteRevealTimer) {
            clearTimeout(this.deleteRevealTimer);
        }

        this.deleteRevealTimer = setTimeout(() => {
            this.clearDeleteRevealState();
        }, 5000);
    }

    clearDeleteRevealState(targetElement = null) {
        if (this.deleteRevealTimer) {
            clearTimeout(this.deleteRevealTimer);
            this.deleteRevealTimer = null;
        }

        // もし短い遅延での表示待ちがあれば取り消す（タップ直後に表示されるのを防止）
        if (this.deleteShowDelayTimer) {
            clearTimeout(this.deleteShowDelayTimer);
            this.deleteShowDelayTimer = null;
        }

        const element = targetElement || this.activeDeletePreset;
        if (element) {
            element.classList.remove('show-delete');
        }

        if (!targetElement || targetElement === this.activeDeletePreset) {
            this.activeDeletePreset = null;
        }
    }

    shouldRevealDeleteOnPointer(event) {
        if (!event) return false;

        if (event.pointerType) {
            if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                return true;
            }
            if (event.pointerType === 'mouse') {
                return false;
            }
        }

        if (event.type && event.type.startsWith('touch')) {
            return true;
        }

        if (this.coarsePointerMatcher && this.coarsePointerMatcher.matches) {
            return true;
        }

        return false;
    }

    /**
     * カラーピッカーとサイズスライダーのイベントリスナーを設定
     */
    setupEventListeners() {
        // カラーピッカーを閉じるボタン
        const closeBtn = document.getElementById('close-color-picker');
        if (closeBtn) {
            d3.select(closeBtn).on('click.penTool', () => this.hideColorPicker());
        }

        // カラーピッカー折りたたみボタン
        if (this.closeButton && this.panel) {
            const closeButtonSelection = d3.select(this.closeButton);
            closeButtonSelection
                .on('click.penTool', (event) => {
                    event.preventDefault();
                    this.toggleColorPickerCollapsed();
                })
                .on('keydown.penTool', (event) => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        this.toggleColorPickerCollapsed();
                    }
                });
        }

        if (this.colorPreview) {
            const previewSelection = d3.select(this.colorPreview);
            previewSelection
                .on('click.penTool', (event) => {
                    event.preventDefault();
                    this.addColorToPalette();
                })
                .on('keydown.penTool', (event) => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        this.addColorToPalette();
                    }
                })
                .on('pointerdown.penToolStart', () => {
                    if (!this.isOpen) {
                        this.showColorPicker();
                    }
                })
                .on('focus.penToolStart', () => {
                    if (!this.isOpen) {
                        this.showColorPicker();
                    }
                });
        }



        // サイズスライダーの変更イベント
        if (this.sizeSlider) {
            d3.select(this.sizeSlider)
                .on('pointerdown.penToolStart', () => {
                    if (!this.isOpen) {
                        this.showColorPicker();
                    }
                })
                .on('focus.penToolStart', () => {
                    if (!this.isOpen) {
                        this.showColorPicker();
                    }
                });
            d3.select(this.sizeSlider).on('input.penTool', (event) => {
                const newSize = Number(event.target.value);
                this.settings.currentSize = newSize;
                this.updateSizeDisplayMini(newSize);
                if (this.settings.selectCurveId !== null && this.curveManager) {
                    this.curveManager.updateCurveSize(newSize);
                }
            });

            d3.select(this.sizeSlider).on('pointerup.penTool', (event) => {
                this.recordSizeChange(event);
            });

            d3.select(this.sizeSlider).on('touchend.penTool', (event) => {
                this.recordSizeChange(event);
            });
        }

        // Hueリング（ドーナツ）のクリックとドラッグイベント
        if (this.hueRingCanvas) {
            d3.select(this.hueRingCanvas).on('pointerdown.penTool', (e) => {
                // タッチ／ポインターでのドラッグを有効にする
                if (!this.isOpen) {
                    this.showColorPicker();
                }
                if (e && typeof e.preventDefault === 'function') e.preventDefault();

                if (!this.initialColor) {
                    this.beginColorChange();
                }

                this._clearActivePointer();
                this._setActivePointer('hue', e);

                // pointer capture を試みる（連続的に pointermove を受け取るため）
                if (e && e.pointerId && e.target && typeof e.target.setPointerCapture === 'function') {
                    e.target.setPointerCapture(e.pointerId);
                }

                this.updateHueFromPointer(e);
                this.applyColor();
                const moveHandler = (moveEvent) => {
                    if (!this._isEventFromActivePointer('hue', moveEvent)) return;
                    if (moveEvent && typeof moveEvent.preventDefault === 'function') moveEvent.preventDefault();
                    this.updateHueFromPointer(moveEvent);
                    this.applyColor();
                };
                const upHandler = (upEvent) => {
                    if (!this._isEventFromActivePointer('hue', upEvent)) return;
                    if (e && e.pointerId && e.target && typeof e.target.releasePointerCapture === 'function') {
                        e.target.releasePointerCapture(e.pointerId);
                    }

                    // finalize color change for history when dragging ends
                    this.finishColorChange();
                    this._clearActivePointer('hue');

                    d3.select(document)
                        .on('pointermove.penToolHueDrag', null)
                        .on('pointerup.penToolHueDrag', null)
                        .on('touchmove.penToolHueDrag', null)
                        .on('touchend.penToolHueDrag', null)
                        .on('touchcancel.penToolHueDrag', null)
                        .on('pointercancel.penToolHueDrag', null);
                };

                d3.select(document)
                    .on('pointermove.penToolHueDrag', moveHandler)
                    .on('pointerup.penToolHueDrag', upHandler)
                    .on('pointercancel.penToolHueDrag', upHandler)
                    .on('touchmove.penToolHueDrag', moveHandler)
                    .on('touchend.penToolHueDrag', upHandler)
                    .on('touchcancel.penToolHueDrag', upHandler);
            });
        }

        // SV正方形のクリックとドラッグイベント
        if (this.svSquareCanvas) {
            d3.select(this.svSquareCanvas).on('pointerdown.penTool', (e) => {
                // タッチ／ポインターでのドラッグを有効にする
                if (!this.isOpen) {
                    this.showColorPicker();
                }
                if (e && typeof e.preventDefault === 'function') e.preventDefault();

                if (!this.initialColor) {
                    this.beginColorChange();
                }

                this._clearActivePointer();
                this._setActivePointer('sv', e);

                // pointer capture を試みる
                if (e && e.pointerId && e.target && typeof e.target.setPointerCapture === 'function') {
                    e.target.setPointerCapture(e.pointerId);
                }

                this.updateSVFromPointer(e);
                this.applyColor();
                const moveHandler = (moveEvent) => {
                    if (!this._isEventFromActivePointer('sv', moveEvent)) return;
                    if (moveEvent && typeof moveEvent.preventDefault === 'function') moveEvent.preventDefault();
                    this.updateSVFromPointer(moveEvent);
                    this.applyColor();
                };
                const upHandler = (upEvent) => {
                    if (!this._isEventFromActivePointer('sv', upEvent)) return;
                    if (e && e.pointerId && e.target && typeof e.target.releasePointerCapture === 'function') {
                        e.target.releasePointerCapture(e.pointerId);
                    }

                    // finalize color change for history when dragging ends
                    this.finishColorChange();
                    this._clearActivePointer('sv');

                    d3.select(document)
                        .on('pointermove.penToolSVDrag', null)
                        .on('pointerup.penToolSVDrag', null)
                        .on('touchmove.penToolSVDrag', null)
                        .on('touchend.penToolSVDrag', null)
                        .on('touchcancel.penToolSVDrag', null)
                        .on('pointercancel.penToolSVDrag', null);
                };

                d3.select(document)
                    .on('pointermove.penToolSVDrag', moveHandler)
                    .on('pointerup.penToolSVDrag', upHandler)
                    .on('pointercancel.penToolSVDrag', upHandler)
                    .on('touchmove.penToolSVDrag', moveHandler)
                    .on('touchend.penToolSVDrag', upHandler)
                    .on('touchcancel.penToolSVDrag', upHandler);
            });
        }

        // HEXカラー入力フィールドの変更イベント
        if (this.hexInput) {
            d3.select(this.hexInput)
                .on('focus.penToolStart', () => {
                    if (!this.isOpen) {
                        this.showColorPicker();
                    }
                })
                .on('change.penTool', () => {
                    let hex = this.hexInput.value;
                    if (!hex.startsWith('#')) {
                        hex = '#' + hex;
                    }
                    if (/^#[0-9A-F]{6}$/i.test(hex)) {
                        this.setColorFromHex(hex);
                        this.applyColor();
                    } else {
                        this.hexInput.value = this.rgbToHex(this.hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v));
                    }
                });
        }

        d3.select(document).on('pointerdown.penToolPanel', (e) => {
            if (!this.panel) return;

            const tgt = e.target;

            if (this.isPanelEmbedded()) return;

            if (tgt && tgt.closest && (tgt.closest('.action-tools') || tgt.closest('.color-preset'))) {
                return;
            }

            if (this.isOpen && !this.panel.contains(tgt)) {
                this.applyColor();
                this.hideColorPicker();
            }
        });

        d3.select(document).on('pointerdown.penToolPresetReveal', (event) => {
            if (!this.activeDeletePreset) return;
            const preset = event.target.closest('.color-preset');
            if (preset && preset === this.activeDeletePreset) {
                return;
            }
            this.clearDeleteRevealState();
        });

        d3.select(document).on('focusin.penToolPresetReveal', (event) => {
            if (!this.activeDeletePreset) return;
            const preset = event.target.closest('.color-preset');
            if (preset && preset === this.activeDeletePreset) {
                return;
            }
            this.clearDeleteRevealState();
        });

        d3.select(document).on('keydown.penTool', (e) => {
            if (!this.panel) return;
            if (this.isOpen && e.key === 'Escape') {
                this.hideColorPicker();
            }
        });

        // ウィンドウリサイズ時の挙動
        // 埋め込み（サイドバー内）表示の場合は、リサイズでタブを強制的に切り替えないようにする。
        // 浮動（モーダル等）表示のときのみ閉じる。
        d3.select(window).on('resize.penTool', () => {
            if (!this.panel) return;
            const embedded = this.isPanelEmbedded();
            if (!embedded && this.isOpen) {
                this.hideColorPicker();
            }
        });
    }

    /**
     * サイドバータブのアクティベーターを登録
     * @param {(tab: string, options?: object) => void} activator
     */
    setSidebarTabActivator(activator) {
        this.sidebarTabActivator = (typeof activator === 'function') ? activator : null;
    }

    /**
     * サイズ変更を履歴に記録
     * @param {Event} event - イベントオブジェクト
     */
    recordSizeChange(event) {
        const newSize = Number(event.target.value);

        if (this.settings.selectCurveId === null) {
            // デフォルトスタイル変更を記録
            if (this.curveManager && this.curveManager.historyManager) {
                const oldSize = this.initialSize || this.settings.currentSize;

                this.curveManager.historyManager.addAction({
                    type: 'defaultStyleChange',
                    oldStyle: {
                        color: this.settings.currentColor,
                        size: oldSize
                    },
                    newStyle: {
                        color: this.settings.currentColor,
                        size: newSize
                    }
                });
            }

            // 設定を更新
            this.settings.prevSize = newSize;
            this.settings.currentSize = newSize;
            this.currentSize = newSize;
        } else if (this.curveManager) {
            // 曲線が選択されている場合、統合されたスタイル変更として記録
            this.curveManager.recordSizeChange(newSize);
        }
    }

    isPanelEmbedded() {
        if (!this.panel) return false;
        if (this.panel.dataset.embedded === 'true') return true;
        return this.panel.classList.contains('color-picker-panel--embedded');
    }

    /**
     * カラーピッカーを表示
     */
    showColorPicker() {
        if (!this.panel) return;

        if (this.sidebarTabActivator && !this._suppressSidebarTabActivation) {
            this._suppressSidebarTabActivation = true;
            this.sidebarTabActivator('color', { skipPenToolSync: true });
            this._suppressSidebarTabActivation = false;
        }

        // 初期色を保存（履歴追跡用）
        this.initialColor = this.settings.currentColor || '#000000';
        this.initialSize = this.settings.currentSize;

        // 色の変更開始を記録
        this.beginColorChange();

        // 初期色を現在選択されている色に設定
        const initialColor = this.settings.currentColor || '#000000';
        this.setColorFromHex(initialColor);

        const embedded = this.isPanelEmbedded();

        // サイズスライダーが表示されていれば非表示にする
        const sizeSliderContainer = document.getElementById('size-slider-container');
        if (sizeSliderContainer && sizeSliderContainer.classList.contains('visible')) {
            sizeSliderContainer.classList.remove('visible');
        }

        if (this.closeButton) {
            this.setColorPickerCollapsed(false);
        }

        this.panel.classList.add('visible');
        this.isOpen = true;

        if (embedded) {
            this.panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * カラーピッカーを非表示
     */
    hideColorPicker() {
        if (!this.panel) return;

        const embedded = this.isPanelEmbedded();

        // 色が変更されていた場合、履歴に記録
        if (this.initialColor && this.settings.currentColor !== this.initialColor) {
            // 色変更を完了
            console.log('Color changed:', this.settings.currentColor);
            this.finishColorChange();
        }

        if (!embedded) {
            this.panel.classList.remove('visible');
        }
        this.isOpen = false;

        if (embedded && this.sidebarTabActivator && !this._suppressSidebarTabActivation) {
            this._suppressSidebarTabActivation = true;
            this.sidebarTabActivator('curves', { skipPenToolSync: true });
            this._suppressSidebarTabActivation = false;
        }

        this._clearActivePointer();
        this.clearDeleteRevealState();

        // 初期色・サイズをリセット
        this.initialColor = null;
        this.initialSize = null;
        this.lastSelectedColor = null;
    }

    /**
     * カラーピッカーの表示状態を折りたたむ/展開する
     * @param {boolean} collapsed - true なら折りたたみ、false なら展開
     */
    setColorPickerCollapsed(collapsed) {
        if (!this.panel || !this.closeButton) return;

        const shouldCollapse = Boolean(collapsed);
        this.panel.classList.toggle('collapsed', shouldCollapse);
        this.closeButton.classList.toggle('rotated', shouldCollapse);
        this.closeButton.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
        this.closeButton.setAttribute('aria-label', shouldCollapse ? 'カラーピッカーを展開する' : 'カラーピッカーを折りたたむ');
        this.closeButton.setAttribute('title', shouldCollapse ? '展開する' : '折りたたむ');
    }

    /**
     * 折りたたみボタンのトグル処理
     */
    toggleColorPickerCollapsed() {
        if (!this.panel) return;

        const isCurrentlyCollapsed = this.panel.classList.contains('collapsed');

        if (isCurrentlyCollapsed) {
            this.showColorPicker();
        } else {
            this.setColorPickerCollapsed(true);
            this.isOpen = false;
            if (this.initialColor && this.settings.currentColor !== this.initialColor) {
                this.finishColorChange();
            }
            this.initialColor = null;
            this.initialSize = null;
            this.lastSelectedColor = null;
            this.clearDeleteRevealState();
        }
    }

    /**
     * 選択した色を適用
     */
    applyColor() {
        const hexColor = this.hexInput.value;

        // 色を設定
        this.setColor(hexColor);

        // 選択中の曲線がある場合はその色も更新
        if (this.settings.selectCurveId !== null && this.curveManager) {
            this.curveManager.updateCurveColor(hexColor);
        }

        // ミニカラーディスプレイを更新
        this.updateColorDisplayMini(hexColor);
    }

    /**
     * カラーエリアでのマウス位置から色を更新
     * @param {MouseEvent} e - マウスイベント
     */


    /**
     * カラーエリアの描画を更新（Hue/Saturation円 + Value適用）
     */
    updateColorArea() {
        // Update both hue ring and SV square
        this.renderHueRing();
        this.renderSVSquare();
        this.updateCursorPositions();
    }



    /**
     * 選択された色を更新
     */
    updateSelectedColor() {
        const rgb = this.hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
        const hex = this.rgbToHex(rgb);

        // プレビューと入力フィールドを更新
        this.colorPreview.style.backgroundColor = hex;

        // YIQ輝度を計算 (R*0.299 + G*0.587 + B*0.114)
        const brightness = Math.round(
            rgb.r * 0.299 +
            rgb.g * 0.587 +
            rgb.b * 0.114
        );
        // CSSカスタムプロパティとして輝度を設定
        this.colorPreview.style.setProperty('--brightness', brightness);

        this.hexInput.value = hex.toUpperCase();
        this.currentColor = hex;
    }

    /**
     * HEX値から色を設定
     * @param {string} hex - HEXカラーコード
     */
    setColorFromHex(hex) {
        // HEXをRGBに変換
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);

        // RGBをHSVに変換
        const hsv = this.rgbToHsv(r, g, b);
        this.hsv = hsv;

        // UI更新
        this.updateColorArea();
        this.updateSelectedColor();
    }

    /**
     * Valueスライダーの見た目を現在のHue/Saturationに合わせて更新
     */


    /**
     * HSVからRGBに変換
     * @private
     */
    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h / 60);
        const f = h / 60 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    /**
     * RGBからHSVに変換
     * @private
     */
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h;

        if (d === 0) h = 0;
        else if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;

        h = Math.round(h * 60);
        if (h < 0) h += 360;

        const s = max === 0 ? 0 : d / max;
        const v = max;

        return { h, s, v };
    }

    /**
     * RGBからHEXに変換
     * @private
     */
    rgbToHex(rgb) {
        return `#${this.componentToHex(rgb.r)}${this.componentToHex(rgb.g)}${this.componentToHex(rgb.b)}`;
    }

    /**
     * 10進数を16進数の2桁に変換
     * @private
     */
    componentToHex(c) {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }

    /**
     * Hueリング（ドーナツ）を描画
     * @private
     */
    renderHueRing() {
        if (!this.hueRingCtx || !this.hueRingCanvas) return;

        const canvas = this.hueRingCanvas;
        const ctx = this.hueRingCtx;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const outerRadius = Math.min(centerX, centerY) - 2;
        const innerRadius = outerRadius * 0.73; // 内側半径を外側の73%に設定

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const segments = 360;
        // Align hue=0 at the top of the ring (−90° rotation from canvas 0 rad which is +X axis)
        for (let i = 0; i < segments; i++) {
            // compute angles so that hue 0 is at -PI/2 (top)
            const angle = (i / segments) * 2 * Math.PI - Math.PI / 2;
            const nextAngle = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2;
            const hue = (i / segments) * 360;

            const rgb = this.hsvToRgb(hue, 1, 1);
            ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, angle, nextAngle);
            ctx.arc(centerX, centerY, innerRadius, nextAngle, angle, true);
            ctx.closePath();
            ctx.fill();
        }
    }

    /**
     * SV正方形を描画
     * @private
     */
    renderSVSquare() {
        if (!this.svSquareCtx || !this.svSquareCanvas) return;

        const canvas = this.svSquareCanvas;
        const ctx = this.svSquareCtx;
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const saturation = x / (width - 1);
                const value = 1 - (y / (height - 1));

                const rgb = this.hsvToRgb(this.hsv.h, saturation, value);
                const index = (y * width + x) * 4;

                data[index] = rgb.r;     // Red
                data[index + 1] = rgb.g; // Green
                data[index + 2] = rgb.b; // Blue
                data[index + 3] = 255;   // Alpha
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * カーソル位置を更新
     * @private
     */
    updateCursorPositions() {
        this.updateHueCursorPosition();
        this.updateSVCursorPosition();
    }

    /**
     * Hueカーソル位置を更新
     * @private
     */
    updateHueCursorPosition() {
        if (!this.hueRingCursor || !this.hueRingCanvas) return;

        const canvas = this.hueRingCanvas;
        // Use bounding rect so CSS scaling (especially on mobile) is handled correctly
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const outerRadius = Math.min(centerX, centerY) - 2;
        const innerRadius = outerRadius * 0.73;
        const midRadius = (outerRadius + innerRadius) / 2;

        // Convert stored hue to radians; subtract PI/2 to align 0 at top when computing coords
        const angle = (this.hsv.h / 360) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + Math.cos(angle) * midRadius;
        const y = centerY + Math.sin(angle) * midRadius;

        this.hueRingCursor.style.left = `${x}px`;
        this.hueRingCursor.style.top = `${y}px`;
        this.hueRingCursor.setAttribute('aria-valuenow', Math.round(this.hsv.h));
    }

    /**
     * SVカーソル位置を更新
     * @private
     */
    updateSVCursorPosition() {
        if (!this.svSquareCursor || !this.svSquareCanvas) return;
        const canvas = this.svSquareCanvas;
        // Use bounding rect for CSS-scaled canvas (mobile DPI / responsive scaling)
        const rect = canvas.getBoundingClientRect();
        const x = this.hsv.s * rect.width;
        const y = (1 - this.hsv.v) * rect.height;

        this.svSquareCursor.style.left = `${x}px`;
        this.svSquareCursor.style.top = `${y}px`;

        const svValue = Math.round((this.hsv.s + this.hsv.v) * 50);
        this.svSquareCursor.setAttribute('aria-valuenow', svValue);
    }

    _extractPrimaryTouch(event) {
        if (!event) return null;
        const pickFirst = (list) => {
            if (!list || typeof list.length !== 'number' || list.length === 0) return null;
            return list[0];
        };
        return pickFirst(event.touches) ||
            pickFirst(event.changedTouches) ||
            this._extractPrimaryTouch(event.sourceEvent || event.srcEvent || null);
    }

    _setActivePointer(type, event) {
        const pointerId = (event && typeof event.pointerId === 'number') ? event.pointerId : null;
        const touch = this._extractPrimaryTouch(event);
        const touchId = touch && typeof touch.identifier === 'number' ? touch.identifier : null;
        this.activePointer = { type, pointerId, touchId };
    }

    _isEventFromActivePointer(type, event) {
        if (!this.activePointer || this.activePointer.type !== type) {
            return false;
        }

        const { pointerId, touchId } = this.activePointer;

        if (event && typeof event.pointerId === 'number') {
            return pointerId == null || event.pointerId === pointerId;
        }

        const matchesTouchList = (list) => {
            if (touchId == null || !list || typeof list.length !== 'number') return false;
            for (let i = 0; i < list.length; i++) {
                const touch = list[i];
                if (touch && touch.identifier === touchId) return true;
            }
            return false;
        };

        if (matchesTouchList(event && event.touches)) return true;
        if (matchesTouchList(event && event.changedTouches)) return true;

        const nested = event && (event.sourceEvent || event.srcEvent);
        if (nested && nested !== event) {
            return this._isEventFromActivePointer(type, nested);
        }

        if (pointerId == null && touchId == null) {
            // フォールバック（古いブラウザなど）: 識別子が取得できない場合はアクティブ扱い
            return true;
        }

        return false;
    }

    _clearActivePointer(type) {
        if (!this.activePointer) return;
        if (!type || this.activePointer.type === type) {
            this.activePointer = null;
        }
    }

    // イベントからクライアント座標を取得（タッチ/ポインタ両対応）
    _getClientXY(event) {
        if (!event) return { clientX: 0, clientY: 0 };
        // TouchEvent
        if (event.touches && event.touches.length) {
            return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
        }
        if (event.changedTouches && event.changedTouches.length) {
            return { clientX: event.changedTouches[0].clientX, clientY: event.changedTouches[0].clientY };
        }
        // PointerEvent / MouseEvent
        if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { clientX: event.clientX, clientY: event.clientY };
        }
        // d3 の場合など、ネイティブイベントが sourceEvent/srcEvent に入っている場合
        const src = event.sourceEvent || event.srcEvent || null;
        if (src && typeof src.clientX === 'number') {
            return { clientX: src.clientX, clientY: src.clientY };
        }
        return { clientX: 0, clientY: 0 };
    }

    /**
     * ポインタ位置からHueを更新
     * @private
     */
    updateHueFromPointer(event) {
        if (!this.hueRingCanvas) return;

        const rect = this.hueRingCanvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const { clientX, clientY } = this._getClientXY(event);
        const x = clientX - rect.left - centerX;
        const y = clientY - rect.top - centerY;

        const outerRadius = Math.min(centerX, centerY) - 2;
        const innerRadius = outerRadius * 0.73;

        // タッチしている位置がリングの範囲内外を問わず、
        // 中心からの角度だけで Hue を決定する（指がどこにあっても角度で操作できる）
        // ただし、表示されるカーソル（#hue-ring-cursor）は引き続きリング上に固定表示される。
        let angleDeg = (Math.atan2(y, x) + Math.PI / 2) * (180 / Math.PI);
        // 角度を [0,360) の範囲に正規化
        angleDeg = (angleDeg % 360 + 360) % 360;
        this.hsv.h = angleDeg;
        this.renderSVSquare();
        this.updateCursorPositions();
        this.updateSelectedColor();
    }

    /**
     * ポインタ位置からSVを更新
     * @private
     */
    updateSVFromPointer(event) {
        if (!this.svSquareCanvas) return;

        const rect = this.svSquareCanvas.getBoundingClientRect();
        const { clientX, clientY } = this._getClientXY(event);
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Clamp coordinates to canvas bounds
        const clampedX = Math.max(0, Math.min(rect.width, x));
        const clampedY = Math.max(0, Math.min(rect.height, y));

        this.hsv.s = clampedX / rect.width;
        this.hsv.v = 1 - (clampedY / rect.height);

        this.updateCursorPositions();
        this.updateSelectedColor();
    }

    /**
     * ペンサイズを設定して適用する
     * @param {number} size - 新しいサイズ
     */
    setSize(size) {
        const newSize = Number(size);
        this.currentSize = newSize;

        // スライダーを更新
        if (this.sizeSlider) {
            this.sizeSlider.value = newSize;
        }

        // 選択中の曲線がある場合はサイズを更新
        if (this.settings.selectCurveId !== null && this.curveManager) {
            this.curveManager.updateCurveSize(newSize);
        } else {
            // 選択中の曲線がない場合は設定を更新
            this.settings.prevSize = newSize;
            this.settings.currentSize = newSize;
        }
    }

    /**
     * 色とサイズをデフォルト値にリセット
     */
    resetToDefault() {
        this.resetToDefaultColor();
        this.resetToDefaultSize();
    }

    /**
     * 色をデフォルト値にリセット
     */
    resetToDefaultColor() {
        const defaultColor = this.settings.prevColor;
        if (defaultColor == null) {
            return;
        }

        this.settings.currentColor = defaultColor;
        this.currentColor = defaultColor;

        if (this.colorPreview || this.hexInput || this.hueRingCanvas) {
            this.setColorFromHex(defaultColor);
        }

        this.updateColorDisplayMini(defaultColor);

    }

    /**
     * サイズをデフォルト値にリセット
     */
    resetToDefaultSize() {
        const defaultSize = this.settings.prevSize;
        if (defaultSize == null) {
            return;
        }

        this.settings.currentSize = defaultSize;
        this.currentSize = defaultSize;

        if (this.sizeSlider) {
            this.sizeSlider.value = defaultSize;
        }

        this.updateSizeDisplayMini(defaultSize);
    }

    /**
     * ミニカラーディスプレイの更新
     * @param {string} color - 選択された色
     */
    updateColorDisplayMini(color) {
        if (!color) return;
        this.currentColor = color;
        if (this.colorDisplay) {
            this.colorDisplay.style.backgroundColor = color;
        }
    }

    /**
     * ミニカラーディスプレイのサイズを更新
     * @param {number} size - 新しいサイズ
     */
    updateSizeDisplayMini(size) {
        const numericSize = Number(size);
        if (Number.isNaN(numericSize)) return;

        this.currentSize = numericSize;

        if (this.colorDisplay) {
            this.colorDisplay.style.width = `${numericSize}px`;
            this.colorDisplay.style.height = `${numericSize}px`;
        }
    }

    /**
     * 曲線選択時に呼び出される更新メソッド
     * @param {string} color - 選択された曲線の色
     * @param {number} size - 選択された曲線のサイズ
     */
    updateFromCurveSelection(color, size) {
        // 現在の色を更新
        this.currentColor = color;
        this.currentSize = size;

        // スライダーの値を更新
        if (this.sizeSlider) {
            this.sizeSlider.value = size;
        }

        // カラーピッカーが開いている場合はその表示も更新
        if (this.isOpen) {
            this.setColorFromHex(color);
        }

        // カラーディスプレイを更新
        this.updateColorDisplayMini(color);
        this.updateSizeDisplayMini(size);
    }

    /**
     * サイズを増減させるメソッド
     */
    adjustSize(delta) {
        if (!this.sizeSlider) return;

        const currentSize = Number(this.sizeSlider.value);
        const newSize = Math.min(Math.max(currentSize + delta, 1), 20); // 1-20の範囲に制限

        if (newSize !== currentSize) {
            this.sizeSlider.value = newSize;
            this.settings.currentSize = newSize;

            this.updateSizeDisplayMini(newSize);

            if (this.settings.selectCurveId !== null && this.curveManager) {
                this.curveManager.updateCurveSize(newSize);
            }

            this.recordSizeChange({ target: { value: newSize } });
        }
    }
}
