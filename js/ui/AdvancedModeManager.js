/**
 * Advanced Mode Manager Class
 * 高度な編集モードの状態を管理
 */
export class AdvancedModeManager {
    constructor() {
        this.advancedModeKey = 'grapen-advanced-mode';
        this.isAdvancedMode = this.loadAdvancedModeState();
        this.initialize();
    }

    /**
     * 初期化処理
     */
    async initialize() {
        // 初期値を読み込む
        await this.loadSettings();

        // 外部からの変更通知を受けて状態を切り替える
        document.addEventListener('advancedModeChanged', (e) => {
            if (e && e.detail && typeof e.detail.enabled === 'boolean') {
                this.setAdvancedMode(e.detail.enabled);
            }
        });
        // DOM にも状態を反映（.curve-options の表示切替を自然に行う）
        this.applyModeToDOM();
    }

    /**
     * Chromeストレージから設定を読み込む
     */
    async loadSettings() {
        // まず localStorage を確認
        const stored = localStorage.getItem(this.advancedModeKey);
        if (stored !== null) {
            this.isAdvancedMode = JSON.parse(stored);
            this.notifyStateChange();
            return;
        }

        // 念のため chrome.storage が使える環境なら取得
        if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
            try {
                const result = await chrome.storage.local.get(['advancedMode']);
                this.isAdvancedMode = !!result.advancedMode;
                this.notifyStateChange();
            } catch (err) {
                // chrome.storage の取得に失敗しても localStorage が優先なので安全に無視
                console.warn('chrome.storage read failed for advancedMode:', err);
            }
        }
    }

    /**
     * 高度な編集モードの状態を設定
     * @param {boolean} enabled - 有効/無効
     */
    async setAdvancedMode(enabled) {
        this.isAdvancedMode = enabled;


        // 可能であれば chrome.storage に保存（失敗しても続行）
        if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ advancedMode: enabled }).catch(() => { });
        }

        // localStorage にも保存
        try {
            localStorage.setItem(this.advancedModeKey, JSON.stringify(!!enabled));
        } catch (e) {
            // localStorage 書き込みが失敗する環境では警告ログを残す
            console.warn('localStorage setItem failed for advancedModeKey:', e);
        }

        this.notifyStateChange();

        // DOM に反映（表示切替を即時に行う）
        this.applyModeToDOM();
    }

    /**
     * 状態変更を通知
     */
    notifyStateChange() {
        // カスタムイベントを発行
        const event = new CustomEvent('advancedModeStateChanged', {
            detail: { enabled: this.isAdvancedMode }
        });
        document.dispatchEvent(event);
    }

    /**
     * 曲線近似が必要かどうかを判定
     * @returns {boolean} 通常モードの場合はtrue、高度なモードの場合はfalse
     */
    loadAdvancedModeState() {
        const stored = localStorage.getItem(this.advancedModeKey);
        return stored ? JSON.parse(stored) : false;
    }

    isAdvancedModeEnabled() {
        return this.isAdvancedMode;
    }

    /**
     * DOM に拡張モードの状態を反映する。
     * - body にクラスを追加/削除
     * - 近似パネルのルート要素へ aria-hidden を設定
     */
    applyModeToDOM() {
        const cls = 'grapen-advanced-mode';
        if (typeof document === 'undefined' || !document.body) return;

        document.body.classList.toggle(cls, !!this.isAdvancedMode);

        const styleId = 'grapen-advanced-mode-style';
        const injected = document.getElementById(styleId);
        if (injected && injected.parentNode) {
            injected.parentNode.removeChild(injected);
        }

        const approxRoot = document.getElementById('curve-approx-root');
        if (approxRoot) {
            approxRoot.setAttribute('aria-hidden', this.isAdvancedMode ? 'false' : 'true');
        }
    }
}
