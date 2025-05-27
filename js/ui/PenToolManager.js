import { AlertModal } from '../modal/AlertModal.js';

/**
 * ペンツール管理クラス
 * カラーピッカーとサイズスライダーのUIとイベントを管理
 */
export class PenToolManager {
    constructor(settings, curveManager, languageManager) {
        this.settings = settings;
        this.curveManager = curveManager;
        this.prevColor = '#000000';
        this.currentColor = '#000000';
        this.initialColor = null; // 色の変更履歴を追跡するための初期色

        // カラーピッカーのDOM要素
        this.panel = null;
        this.colorDisplay = null;
        this.colorArea = null;
        this.colorCursor = null;
        this.hueSlider = null;
        this.colorPreview = null;
        this.hexInput = null;

        // サイズスライダーのDOM要素
        this.sizeSlider = null;
        this.currentSize = this.settings.currentSize || 6;

        // HSVカラー状態
        this.hsv = { h: 0, s: 0, v: 0 };

        // カラーパレットのリスト（デフォルト8色）
        this.defaultColors = [
            '#000000', '#c74440', '#2d70b3', '#348543',
            '#fa7e19', '#6042a6', '#ff66b2', '#7e7e7e'
        ];

        // 現在のパレット（デフォルト色からスタート）
        this.colorPalette = [...this.defaultColors];

        // ローカルストレージからカスタム色をロード
        this.loadCustomColors();

        // 削除モード
        this.deleteMode = false;

        // ペンツールの初期化
        this.initialize();

        this.languageManager = languageManager;

        this.alertModal = new AlertModal(languageManager);
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
        this.colorArea = document.getElementById('color-area');
        this.colorCursor = document.getElementById('color-cursor');
        this.hueSlider = document.getElementById('hue-slider');
        this.colorPreview = document.getElementById('color-preview');
        this.hexInput = document.getElementById('color-hex-input');
        this.sizeSlider = document.getElementById('size');

        // サイズスライダーの初期値を設定から読み込み
        if (this.sizeSlider) {
            this.currentSize = Number(this.sizeSlider.value);
            this.settings.currentSize = this.currentSize;
            this.settings.prevSize = this.currentSize;
        }

        // イベントリスナーの設定
        this.setupEventListeners();

        // 初期パレットを描画
        this.updateColorPalette();

        this.updateColorDisplayMini(this.settings.currentColor || '#000000');
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
                this.curveManager.recordColorChange(this.settings.currentColor);
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
          <i class="material-symbols-rounded">brush</i>
          <span><strong data-i18n="pen_panel.title">ペン設定</strong></span>
          <button id="close-color-picker" class="close-btn">&times;</button>
        </div>
        <div class="color-picker-body">
          <div class="size-slider-section">
            <i class="material-symbols-rounded">
              line_weight
            </i>
            <button class="size-adjust-btn decrease">
              <i class="material-symbols-rounded">chips</i>
            </button>
            <div class="size-slider-container">
              <input type="range" id="size" min="1" max="20" value="6" class="horizontal-slider">
            </div>
            <button class="size-adjust-btn increase">
              <i class="material-symbols-rounded">add_box</i>
            </button>
          </div>
          <hr class="section-divider">
          <div class="color-slider-container">
            <input type="range" id="hue-slider" min="0" max="360" value="0" class="hue-slider">
          </div>
          <div class="color-area-container">
            <div id="color-area" class="color-area"></div>
            <div id="color-cursor" class="color-cursor"></div>
          </div>
          <div class="color-preview-container">
            <div id="color-preview" class="color-preview"></div>
            <input type="text" id="color-hex-input" class="color-hex-input" value="#000000">
          </div>
          <div class="color-presets" id="color-presets"></div>
        </div>
      </div>
    `;

        // ボディに追加
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = panelHTML;
        document.body.appendChild(tempDiv.firstElementChild);
    }

    /**
     * カラーパレットを更新
     */
    updateColorPalette() {
        const presetsContainer = document.getElementById('color-presets');
        if (!presetsContainer) return;

        // パレットをクリア
        presetsContainer.innerHTML = '';

        // カスタム色の有無をチェック
        const hasCustomColors = this.colorPalette.some(color => !this.defaultColors.includes(color));

        // パレットの色を追加
        this.colorPalette.forEach((color, index) => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-preset';
            colorDiv.style.backgroundColor = color;
            colorDiv.setAttribute('data-color', color);

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

            // Remove pointer-events restriction for default colors
            d3.select(colorDiv).on('pointerdown.penTool', (e) => {
                if (!this.deleteMode) {
                    this.setColorFromHex(color);
                    this.applyColor();
                }
            });

            // 削除モードの場合、カスタム色には削除ボタンを表示
            if (this.deleteMode && !isDefaultColor) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'color-preset-delete';
                deleteBtn.innerHTML = '<i class="material-symbols-rounded">close</i>';
                d3.select(deleteBtn).on('pointerdown.penTool', (e) => {
                    e.stopPropagation();
                    this.deleteColorFromPalette(index);
                });
                colorDiv.appendChild(deleteBtn);
                colorDiv.classList.add('deletable');
            }

            presetsContainer.appendChild(colorDiv);
        });

        // プラスボタンを追加
        const addColorDiv = document.createElement('div');
        addColorDiv.className = `color-preset add-color palette-action-btn ${this.deleteMode ? 'disabled' : ''}`;
        addColorDiv.innerHTML = '<i class="material-symbols-rounded none-event">add</i>';
        d3.select(addColorDiv).on('pointerdown.penTool', () => this.addColorToPalette());

        // 削除モードボタンを追加
        const deleteBtn = document.createElement('div');
        deleteBtn.className = `color-preset palette-action-btn delete-mode-btn ${this.deleteMode ? 'active' : ''} ${!hasCustomColors ? 'disabled' : ''}`;
        deleteBtn.innerHTML = '<i class="material-symbols-rounded">delete</i>';
        d3.select(deleteBtn).on('pointerdown.penTool', () => {
            if (hasCustomColors) {
                this.toggleDeleteMode();
            }
        });

        presetsContainer.appendChild(addColorDiv);
        presetsContainer.appendChild(deleteBtn);
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

    /**
     * カラーピッカーとサイズスライダーのイベントリスナーを設定
     */
    setupEventListeners() {
        // カラーツールボタンのクリックイベントを設定
        const colorToolBtn = document.getElementById('color-tool');
        if (colorToolBtn) {
            d3.select(colorToolBtn).on('pointerdown.penTool', (e) => {
                this.togglePanel();
            });
        }

        // カラーピッカーを閉じるボタン
        const closeBtn = document.getElementById('close-color-picker');
        if (closeBtn) {
            d3.select(closeBtn).on('pointerdown.penTool', () => this.hideColorPicker());
        }

        // 削除モード切り替えボタン
        const deleteBtn = document.getElementById('toggle-delete-mode');
        if (deleteBtn) {
            d3.select(deleteBtn).on('pointerdown.penTool', () => this.toggleDeleteMode());
        }

        // パレット削除モードの終了ボタン
        const paletteExitDeleteModeBtn = document.querySelector('.palette-exit-delete-mode-btn');
        if (paletteExitDeleteModeBtn) {
            d3.select(paletteExitDeleteModeBtn).on('pointerdown.penTool', () => {
                if (this.deleteMode) {
                    this.toggleDeleteMode();
                }
            });
        }

        // Hueスライダーの変更イベント
        if (this.hueSlider) {
            d3.select(this.hueSlider).on('input.penTool', () => {
                this.hsv.h = parseInt(this.hueSlider.value);
                this.updateColorArea();
                this.updateSelectedColor();
                this.applyColor();
            });
        }

        // サイズスライダーの変更イベント
        if (this.sizeSlider) {
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

        // カラーエリアのクリックとドラッグイベント
        if (this.colorArea) {
            d3.select(this.colorArea).on('pointerdown.penTool', (e) => {
                this.updateColorFromPosition(e);
                this.applyColor();
                const mouseMoveHandler = (moveEvent) => {
                    this.updateColorFromPosition(moveEvent);
                    this.applyColor();
                };
                const mouseUpHandler = () => {
                    d3.select(document)
                        .on('mousemove.penToolDrag', null)
                        .on('touchmove.penToolDrag', null)
                        .on('mouseup.penToolDrag', null)
                        .on('touchend.penToolDrag', null);
                };
                d3.select(document)
                    .on('mousemove.penToolDrag', mouseMoveHandler)
                    .on('touchmove.penToolDrag', mouseMoveHandler)
                    .on('mouseup.penToolDrag', mouseUpHandler)
                    .on('touchend.penToolDrag', mouseUpHandler);
            });
        }

        // HEXカラー入力フィールドの変更イベント
        if (this.hexInput) {
            d3.select(this.hexInput).on('change.penTool', () => {
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

        d3.select(document).on('pointerdown.penToolPreset', (e) => {
            if (e.target.closest('.color-preset') && e.target.closest('.color-preset').getAttribute('data-color')) {
                const hexColor = e.target.closest('.color-preset').getAttribute('data-color');
                if (hexColor && !this.deleteMode) {
                    this.setColorFromHex(hexColor);
                    this.applyColor();
                }
            }
        });

        d3.select(document).on('pointerdown.penToolPanel', (e) => {
            if (e.target.id === 'color-tool' || e.target.closest('#color-tool')) {
                return;
            }
            if (e.target.classList.contains('color-preset') || e.target.closest('.color-preset')) {
                return;
            }
            if (this.isOpen && !this.panel.contains(e.target)) {
                this.applyColor();
                this.hideColorPicker();
            }
        });

        d3.select(document).on('keydown.penTool', (e) => {
            if (this.isOpen && e.key === 'Escape') {
                this.hidePanel();
            }
        });

        // ウィンドウリサイズ時にパネルを閉じる
        d3.select(window).on('resize.penTool', () => { if (this.isOpen) this.hidePanel(); });

        // サイズ調整ボタンのイベントリスナー
        const decreaseBtn = document.querySelector('.size-adjust-btn.decrease');
        const increaseBtn = document.querySelector('.size-adjust-btn.increase');

        if (decreaseBtn && increaseBtn) {
            d3.select(decreaseBtn).on('pointerdown.penTool', () => this.adjustSize(-1));
            d3.select(increaseBtn).on('pointerdown.penTool', () => this.adjustSize(1));
        }
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

    /**
     * 削除モードの切り替え
     */
    toggleDeleteMode() {
        this.deleteMode = !this.deleteMode;

        // プラスボタンの状態を更新
        const addColorBtn = document.querySelector('.color-preset.add-color');
        if (addColorBtn) {
            addColorBtn.classList.toggle('disabled', this.deleteMode);
        }

        // 削除モードボタンのスタイルを更新
        const deleteBtn = document.querySelector('.delete-mode-btn');
        if (deleteBtn) {
            deleteBtn.classList.toggle('active', this.deleteMode);
        }

        // パレットを更新して削除ボタンを表示/非表示
        this.updateColorPalette();

        // パレット削除モードのオーバーレイを表示/非表示
        let overlay = document.getElementById('palette-delete-notification');
        if (!overlay && this.deleteMode) {
            overlay = document.createElement('div');
            overlay.id = 'palette-delete-notification';
            overlay.className = 'palette-delete-notification';
            overlay.innerHTML = `
                <span>
                    <i class="material-symbols-rounded">warning</i>
                    <span data-i18n="pen_panel.palette.delete_mode">パレット削除モード: 削除したい色の×ボタンをクリックしてください</span>
                </span>
                <button class="palette-exit-delete-mode-btn" data-i18n="pen_panel.palette.exit">削除モード終了</button>
            `;

            // カラーピッカーパネルに追加
            const panel = document.getElementById('color-picker-panel');
            if (panel) {
                panel.appendChild(overlay);

                // 終了ボタンにイベントリスナーを追加
                const exitBtn = overlay.querySelector('.palette-exit-delete-mode-btn');
                if (exitBtn) {
                    exitBtn.addEventListener('click', () => this.toggleDeleteMode());
                }
            }

            const i18nElements = overlay.querySelectorAll('[data-i18n]');
            i18nElements.forEach(el => {
                this.languageManager.updateSpecificElement(el);
            });

            overlay.classList.toggle('visible', this.deleteMode);
        }
    }

    /**
     * カラーピッカーを表示
     */
    showColorPicker() {
        // 初期色を保存（履歴追跡用）
        this.initialColor = this.settings.currentColor || '#000000';
        this.initialSize = this.settings.currentSize;

        // 色の変更開始を記録
        this.beginColorChange();

        // 初期色を現在選択されている色に設定
        const initialColor = this.settings.currentColor || '#000000';
        this.setColorFromHex(initialColor);

        // カラーツールボタンの位置を基準にパネルを配置
        const colorToolBtn = document.getElementById('color-tool');
        if (colorToolBtn) {
            const rect = colorToolBtn.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const panelHeight = this.panel.offsetHeight || 350; // 推定値

            // パネルの位置を計算
            let top = rect.bottom + 10; // ボタンの下に10pxのスペース
            let left = rect.left;

            // 画面下部に収まるかチェック
            if (top + panelHeight > viewportHeight) {
                // 収まらない場合はツールの上に表示
                top = rect.top - panelHeight - 5;
            }

            // 画面左端からはみ出さないように調整
            if (left < 10) {
                left = 10;
            }

            this.panel.style.top = `${top}px`;
            this.panel.style.left = `${left}px`;
        }

        // サイズスライダーが表示されていれば非表示にする
        const sizeSliderContainer = document.getElementById('size-slider-container');
        if (sizeSliderContainer && sizeSliderContainer.classList.contains('visible')) {
            sizeSliderContainer.classList.remove('visible');
        }

        this.panel.classList.add('visible');
        this.isOpen = true;
    }

    /**
     * カラーピッカーを非表示
     */
    hideColorPicker() {
        // 色が変更されていた場合、履歴に記録
        if (this.initialColor && this.settings.currentColor !== this.initialColor) {
            // 色変更を完了
            console.log('Color changed:', this.settings.currentColor);
            this.finishColorChange();
        }

        this.panel.classList.remove('visible');
        this.isOpen = false;

        // 削除モードを解除
        if (this.deleteMode) {
            this.toggleDeleteMode();
        }

        // 初期色・サイズをリセット
        this.initialColor = null;
        this.initialSize = null;
        this.lastSelectedColor = null;
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
    updateColorFromPosition(e) {
        const rect = this.colorArea.getBoundingClientRect();
        let x, y;
        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else if (e instanceof MouseEvent) {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        } else {
            console.error("予期しないイベントタイプ", event);
            return; // または適切なエラー処理
        }

        // 範囲内に収める
        x = Math.max(0, Math.min(rect.width, x));
        y = Math.max(0, Math.min(rect.height, y));

        // HSVに変換
        this.hsv.s = x / rect.width;
        this.hsv.v = 1 - (y / rect.height);

        // カーソル位置を更新
        this.colorCursor.style.left = `${x}px`;
        this.colorCursor.style.top = `${y}px`;
        this.colorCursor.style.display = 'block';

        // 選択色を更新
        this.updateSelectedColor();
    }

    /**
     * カラーエリアの背景色を更新（Hueに基づく）
     */
    updateColorArea() {
        const hueColor = this.hsvToRgb(this.hsv.h, 1, 1);
        const hueHex = this.rgbToHex(hueColor);
        this.colorArea.style.background = `linear-gradient(to bottom, rgba(0,0,0,0), #000), linear-gradient(to right, #fff, ${hueHex})`;
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

        // スライダーとUI更新
        this.hueSlider.value = hsv.h;
        this.updateColorArea();

        // カラーエリア内でのカーソル位置を計算
        const rect = this.colorArea.getBoundingClientRect();
        const x = hsv.s * rect.width;
        const y = (1 - hsv.v) * rect.height;

        // カーソルを配置
        this.colorCursor.style.left = `${x}px`;
        this.colorCursor.style.top = `${y}px`;
        this.colorCursor.style.display = 'block';

        // 選択色を更新
        this.updateSelectedColor();
    }

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
     * カラーピッカーを表示
     */
    showPanel() {
        if (!this.panel) return;

        if (this.colorDisplay) {
            const rect = this.colorDisplay.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const panelHeight = this.panel.offsetHeight || 350; // 推定値

            // パネルの位置を計算
            let top = rect.bottom + 10; // カラーディスプレイの下に10pxのスペース
            let left = rect.left - 20; // 左に20pxオフセット

            // 画面下部に収まるかチェック
            if (top + panelHeight > viewportHeight) {
                // 収まらない場合はカラーディスプレイの上に表示
                top = rect.top - panelHeight - 5;
            }

            // 画面左端からはみ出さないように調整
            if (left < 10) {
                left = 10;
            }

            this.panel.style.top = `${top}px`;
            this.panel.style.left = `${left}px`;
        }

        this.panel.classList.add('visible');
        this.isOpen = true;
    }

    /**
     * カラーピッカーを非表示
     */
    hidePanel() {
        if (!this.panel) return;

        this.panel.classList.remove('visible');
        this.isOpen = false;
    }

    /**
     * カラーピッカーの表示状態を切り替え
     */
    togglePanel() {
        if (this.isOpen) {
            this.hideColorPicker();
        } else {
            this.showColorPicker();
        }
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
        if (this.settings.prevColor) {
            this.settings.currentColor = this.settings.prevColor;
            this.updateColorDisplayMini(this.settings.prevColor);
        }

    }

    /**
     * サイズをデフォルト値にリセット
     */
    resetToDefaultSize() {
        if (this.settings.prevSize) {
            this.settings.currentSize = this.settings.prevSize;
            this.sizeSlider.value = this.settings.prevSize;
            this.updateSizeDisplayMini(this.settings.prevSize);
        }
    }

    /**
     * ミニカラーディスプレイの更新
     * @param {string} color - 選択された色
     */
    updateColorDisplayMini(color) {
        if (this.colorDisplay) {
            this.colorDisplay.style.backgroundColor = color;
        }
    }

    /**
     * ミニカラーディスプレイのサイズを更新
     * @param {number} size - 新しいサイズ
     */
    updateSizeDisplayMini(size) {
        if (this.colorDisplay) {
            this.colorDisplay.style.width = `${size}px`;
            this.colorDisplay.style.height = `${size}px`;
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
