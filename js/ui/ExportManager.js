/**
 * Export Manager Class
 * グラフの出力、保存機能を管理
 */
import { saveToPNG, saveToSVG, saveToJSON } from '../graph/GraphSaveUtils.js';

export class ExportManager {
    constructor(graphCalculator, settingsManager = null) {
        this.graphCalculator = graphCalculator;
        this.settingsManager = settingsManager;
        this.panel = document.getElementById('export-panel');
        this.initialized = false;
        this.isOpen = false;

        // 初期化を自動的に実行
        this.initialize();
    }

    /**
     * 出力パネルの初期化
     */
    initialize() {
        if (this.initialized) return;

        // 出力パネルがなければ作成
        if (!this.panel) {
            this.createExportPanel();
        }

        // イベントリスナーを設定
        this.setupEventListeners();

        this.initialized = true;
    }

    /**
     * 出力パネルのHTML構造を作成
     */
    createExportPanel() {
        const panel = document.createElement('div');
        panel.id = 'export-panel';
        panel.className = 'settings-panel'; // 設定パネルと同じスタイルを使用

        panel.innerHTML = `
      <div class="settings-header">
        <i class="material-symbols-rounded">download</i>
        <span><strong data-i18n="export_panel.title">グラフ出力</strong></span>
        <button id="close-export" class="close-btn">&times;</button>
      </div>
      <div class="settings-body">
        <div class="settings-group">
          <div class="settings-item export-item">
            <button id="export-svg-btn" class="export-btn">
              <i class="material-symbols-rounded">file_present</i>
              <span data-i18n="export_panel.svg">SVG</span>
            </button>
          </div>
          <div class="settings-item export-item">
            <button id="export-png-btn" class="export-btn">
              <i class="material-symbols-rounded">planner_banner_ad_pt</i>
              <span data-i18n="export_panel.png">PNG</span>
            </button>
          </div>
          <div class="settings-item export-item">
            <button id="export-json-btn" class="export-btn">
              <i class="material-symbols-rounded">data_object</i>
              <span data-i18n="export_panel.json">JSON</span>
            </button>
          </div>
        </div>
      </div>
    `;

        document.body.appendChild(panel);
        this.panel = panel;

        // エクスポートボタン用のスタイルを追加
        this.addExportStyles();
    }

    /**
     * エクスポートボタン用のスタイルを追加
     */
    addExportStyles() {
        // スタイルが既に存在するか確認
        if (document.getElementById('export-styles')) return;

        const style = document.createElement('style');
        style.id = 'export-styles';
        style.textContent = `
      .export-btn {
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
      
      .export-btn:hover {
        background-color: var(--hover-color, #e9ecef);
      }
      
      .export-btn i {
        margin-right: 10px;
        font-size: 16px;
      }
      
      .export-item {
        margin-bottom: 15px;
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
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // エクスポートボタンのイベントリスナーを追加
        const exportBtn = document.getElementById('export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.togglePanel();
            });
        }

        // 閉じるボタン
        const closeBtn = document.getElementById('close-export');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePanel());
        }

        // SVG出力ボタン
        const svgBtn = document.getElementById('export-svg-btn');
        if (svgBtn) {
            svgBtn.addEventListener('click', () => {
                if (this.graphCalculator) {
                    const success = saveToSVG(this.graphCalculator, 'graph-export');
                    if (success) {
                        console.log('SVGを保存しました');
                    } else {
                        console.error('SVG保存に失敗しました');
                    }
                } else {
                    console.error('グラフ計算機が初期化されていません');
                }
                this.hidePanel();
            });
        }

        // PNG出力ボタン
        const pngBtn = document.getElementById('export-png-btn');
        if (pngBtn) {
            pngBtn.addEventListener('click', () => {
                if (this.graphCalculator) {
                    saveToPNG(this.graphCalculator, 'graph-export', 2)
                        .then(success => {
                            if (success) {
                                console.log('PNG画像を保存しました');
                            } else {
                                console.error('PNG保存に失敗しました');
                            }
                        });
                } else {
                    console.error('グラフ計算機が初期化されていません');
                }
                this.hidePanel();
            });
        }

        // JSON保存ボタン
        const jsonBtn = document.getElementById('export-json-btn');
        if (jsonBtn) {
            jsonBtn.addEventListener('click', () => {
                if (this.graphCalculator) {
                    // 設定情報も一緒に保存
                    const settings = this.settingsManager ? this.settingsManager.settings : null;

                    // CurveManagerの曲線情報があれば使用
                    let curveData = null;
                    if (this.settingsManager && this.settingsManager.curveManager) {
                        curveData = this.settingsManager.curveManager.curves;
                    }

                    const success = saveToJSON(
                        this.graphCalculator,
                        'grapen-data',
                        settings,
                        curveData
                    );

                    if (success) {
                        console.log('JSONを保存しました');
                    } else {
                        console.error('JSON保存に失敗しました');
                    }
                } else {
                    console.error('グラフ計算機が初期化されていません');
                }
                this.hidePanel();
            });
        }

        // パネル外をクリックした時に閉じる
        document.addEventListener('click', (e) => {
            // export ボタンのクリックは無視する
            if (e.target.id === 'export' || e.target.closest('#export')) {
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

    }

    /**
     * 出力パネルを表示
     */
    showPanel() {
        if (!this.initialized) {
            this.initialize();
        }

        // 出力ボタンの位置を基準にパネルを配置
        const exportBtn = document.getElementById('export');
        if (exportBtn) {
            const rect = exportBtn.getBoundingClientRect();
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
     * 出力パネルを非表示
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
}
