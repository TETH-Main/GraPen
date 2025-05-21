import { saveToPNG, saveToJSON, getPNGBase64, getJSONDataString } from '../graph/GraphSaveUtils.js';

export class SaveGraphManager {
    constructor(graphCalculator, graphStorageManager, languageManager) {
        this.graphCalculator = graphCalculator;
        this.graphStorageManager = graphStorageManager;
        this.languageManager = languageManager;
        this.historyManager = null;
        this.isOpen = false;
        this.justSaved = false; // Flag to track if save was just performed
        this.saveButtonId = 'save-graph-btn';
        this.init();
    }

    init() {
        this.createModal();
        // 要素が確実に存在してから
        if (this.modal && this.overlay) {
            this.setupEventListeners();
        }
        
        // 初期状態での保存ボタン状態を設定
        this.updateSaveButtonState();
    }

    setHistoryManager(historyManager) {
        this.historyManager = historyManager;
        this.updateSaveButtonState();
    }

    updateSaveButtonState() {
        const saveButton = document.getElementById(this.saveButtonId);
        if (!saveButton) return;
        
        // 条件1: 履歴がない場合は無効化
        // 条件2: 保存直後で履歴に変更がない場合も無効化
        const hasHistory = this.historyManager && 
                         (!this.historyManager.isUndoStackEmpty() || !this.historyManager.isRedoStackEmpty());
        
        if (hasHistory && !this.justSaved) {
            saveButton.classList.remove('disabled');
            saveButton.disabled = false;
        } else {
            saveButton.classList.add('disabled');
            saveButton.disabled = true;
        }
    }
    
    // 新しい履歴が追加されたときに呼ばれるメソッド
    resetSaveState() {
        this.justSaved = false;
        this.updateSaveButtonState();
    }

    createModal() {
        const modalHtml = `
            <div class="modal-overlay"></div>
            <div class="modal-content save-graph-modal">
                <div class="modal-header">
                    <h3>
                        <i class="material-symbols-rounded">save</i>
                        <span data-i18n="save_graph.title">グラフを保存</span>
                    </h3>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="save-graph-field">
                        <input type="text" id="graph-title" class="save-graph-input" 
                               data-i18n-placeholder="save_graph.title_placeholder"
                               placeholder="グラフのタイトルを入力">
                    </div>
                    <div class="save-graph-notice">
                        <small>注意：保存直後はデータが一時保存されており、まだ確定していません。</small>
                    </div>
                    <div class="save-graph-actions">
                        <button class="modal-button save-btn primary" data-i18n="save_graph.save">保存</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        this.modal = document.querySelector('.save-graph-modal');
        this.overlay = document.querySelector('.modal-overlay');
        this.input = this.modal.querySelector('#graph-title');
        this.saveBtn = this.modal.querySelector('.save-btn');
    }

    setupEventListeners() {
        // 保存ボタンのイベントリスナー
        const saveBtn = document.getElementById(this.saveButtonId);
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (saveBtn.disabled) return;
                
                if (this.modal && this.overlay) {
                    this.showModal();
                } else {
                    // モーダルが存在しない場合は再作成
                    this.createModal();
                    this.showModal();
                }
            });
        }

        // 閉じるボタンのイベントリスナー
        const closeBtn = this.modal.querySelector('.close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideModal());
        }

        // 保存実行ボタンのイベントリスナー
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.saveGraph());
        }

        // オーバーレイクリックで閉じる
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.hideModal());
        }

        // Enter キーでの保存
        if (this.input) {
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveGraph();
                }
            });
        }
    }

    showModal() {
        if (this.modal && this.overlay) {
            this.modal.classList.add('open');
            this.overlay.classList.add('open');
            this.input.value = '';
            this.input.focus();
            this.isOpen = true;
        }
    }

    hideModal() {
        if (this.modal && this.overlay) {
            this.modal.classList.remove('open');
            this.overlay.classList.remove('open');
            this.isOpen = false;
        }
    }

    generateHash() {
        // 10文字のランダムな英数字を生成
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let hash = '';
        const array = new Uint8Array(10);
        window.crypto.getRandomValues(array);
        for (let i = 0; i < 10; i++) {
            hash += chars[array[i] % chars.length];
        }
        return hash;
    }

    async saveGraph() {
        const title = this.input.value.trim() || 'untitled graph';
        const hash = this.generateHash();
        const timestamp = Date.now();

        // サムネイルPNG（128x128, 圧縮）Base64生成
        let thumbnail = '';
        if (this.graphCalculator) {
            thumbnail = await getPNGBase64(this.graphCalculator, 128, 128, 0.7);
        }

        // JSONデータ生成
        let json = '';
        if (this.graphCalculator) {
            // CurveManagerの曲線情報を取得する（復元に必須）
            let curveData = null;
            
            // UIManagerから取得を試みる
            if (this.historyManager && this.historyManager.uiManager && 
                this.historyManager.uiManager.curveManager) {
                curveData = this.historyManager.uiManager.curveManager.curves;
            } 
            // windowグローバル変数から取得を試みる
            else if (window.curveManager) {
                curveData = window.curveManager.curves;
            }
            
            // 設定情報も取得
            let settings = null;
            if (this.historyManager && this.historyManager.uiManager && 
                this.historyManager.uiManager.settingsManager) {
                settings = this.historyManager.uiManager.settingsManager.settings;
            }
            
            // 完全な復元に必要なデータを含むJSONを生成
            json = getJSONDataString(this.graphCalculator, settings, curveData);
        }

        const graphData = {
            timestamp,
            hash,
            title,
            thumbnail,
            json
        };

        const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz3jWTDf04HsPngELM5MgISbT2F-zPtbiCzpA2mRCBIBHoFv6IeR0H9reohvzZodKez-g/exec';

        try {
            // フォームPOSTで送信（CORS回避）
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = GAS_ENDPOINT;
            form.target = 'hidden-iframe-for-gas';

            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'data';
            input.value = JSON.stringify(graphData);
            form.appendChild(input);

            let iframe = document.getElementById('hidden-iframe-for-gas');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.name = 'hidden-iframe-for-gas';
                iframe.id = 'hidden-iframe-for-gas';
                document.body.appendChild(iframe);
            }

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            // 送信後すぐに次の処理（レスポンスは取得できない）
        } catch (e) {
            console.error("Error saving graph: ", e);
            return;
        }

        this.graphStorageManager.addGraph(graphData);
        this.hideModal();
        
        // ヘッダーのタイトル表示を更新
        const titleDisplay = document.getElementById('graph-title-display');
        if (titleDisplay) {
            titleDisplay.textContent = title;
            titleDisplay.classList.add('active');
        }
        
        // ブラウザタブのタイトルも更新
        document.title = `${title} - GraPen`;
        // ブラウザのurlも更新
        if (history && history.replaceState) {
            history.replaceState(null, null, `?hash=${hash}`);
        }
        
        // 保存後は保存ボタンを無効化
        this.justSaved = true;
        this.updateSaveButtonState();
    }
}