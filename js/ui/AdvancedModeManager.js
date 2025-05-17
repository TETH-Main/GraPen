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
        // Chromeストレージから設定を読み込む
        await this.loadSettings();

        // イベントリスナーの設定
        document.addEventListener('advancedModeChanged', (e) => {
            this.setAdvancedMode(e.detail.enabled);
        });
    }

    /**
     * Chromeストレージから設定を読み込む
     */
    async loadSettings() {
        if (chrome && chrome.storage) {
            try {
                const result = await chrome.storage.local.get(['advancedMode']);
                this.isAdvancedMode = result.advancedMode || false;
                this.notifyStateChange();
            } catch (error) {
                console.error('Failed to load advanced mode settings:', error);
            }
        }
    }

    /**
     * 高度な編集モードの状態を設定
     * @param {boolean} enabled - 有効/無効
     */
    async setAdvancedMode(enabled) {
        this.isAdvancedMode = enabled;

        // Chromeストレージに保存
        if (chrome && chrome.storage) {
            try {
                await chrome.storage.local.set({ advancedMode: enabled });
            } catch (error) {
                console.error('Failed to save advanced mode settings:', error);
            }
        }

        this.notifyStateChange();
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
}
