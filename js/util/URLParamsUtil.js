/**
 * URLパラメータを扱うユーティリティクラス
 */
export class URLParamsUtil {
    /**
     * URLクエリパラメータから指定された名前の値を取得
     * @param {string} name - パラメータ名
     * @returns {string|null} パラメータの値、存在しない場合はnull
     */
    static getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    /**
     * URLハッシュパラメータ（hパラメータ）を取得
     * @returns {string|null} ハッシュパラメータの値、存在しない場合はnull
     */
    static getHashParameter() {
        return this.getUrlParameter('h');
    }

    /**
     * 全てのURLパラメータを取得
     * @returns {Object} パラメータのキー・値のペア
     */
    static getAllParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {};
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
        return params;
    }

    /**
     * 特定のパラメータが存在するかチェック
     * @param {string} name - パラメータ名
     * @returns {boolean} パラメータが存在する場合true
     */
    static hasParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has(name);
    }

    /**
     * ローディングオーバーレイの表示/非表示を制御
     * @param {boolean} show - 表示する場合true、非表示にする場合false
     */
    static toggleLoadingOverlay(show) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) return;

        if (show) {
            loadingOverlay.style.opacity = '1';
            loadingOverlay.style.display = 'flex';
            loadingOverlay.style.pointerEvents = 'auto';
        } else {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                loadingOverlay.style.pointerEvents = 'none';
            }, 500);
        }
    }

    /**
     * ページタイトルとヘッダータイトルを更新
     * @param {string} title - 新しいタイトル
     */
    static updatePageTitle(title) {
        // ページタイトルを更新
        document.title = `${title} - GraPen`;
        
        // ヘッダーのタイトル表示を更新
        const titleDisplay = document.getElementById('graph-title-display');
        if (titleDisplay) {
            titleDisplay.textContent = title;
            titleDisplay.classList.add('active');
        }
    }

    /**
     * ハッシュパラメータからグラフを読み込む
     * @param {Object} graphStorageManager - グラフストレージマネージャー
     * @param {Object} uiManager - UIマネージャー
     * @returns {Promise<boolean>} 読み込み成功時true
     */
    static async loadGraphFromHashParameter(graphStorageManager, uiManager) {
        const hashParam = this.getHashParameter();
        if (!hashParam) {
            return false;
        }

        try {
            // ローディングインジケータを表示
            this.toggleLoadingOverlay(true);

            // Firestoreからグラフデータを検索
            const result = await graphStorageManager.checkGraphInFirestore(hashParam);
            
            if (result && result.json) {
                // JSONデータをパース (文字列の場合)
                const jsonData = typeof result.json === 'string' ? JSON.parse(result.json) : result.json;
                
                // SettingsManagerを使ってグラフを復元
                const success = await uiManager.settingsManager.loadGraphFromJSON(jsonData, true);
                
                if (success) {
                    // タイトルを更新
                    if (result.title) {
                        this.updatePageTitle(result.title);
                    }
                    return true;
                } else {
                    console.error('グラフの復元に失敗しました');
                    return false;
                }
            } else {
                console.warn(`Graph with hash ${hashParam} not found or could not be loaded.`);
                return false;
            }
        } catch (error) {
            console.error(`Error loading graph with hash ${hashParam}:`, error);
            return false;
        } finally {
            // ローディングインジケータを非表示
            this.toggleLoadingOverlay(false);
        }
    }

    /**
     * URLパラメータに基づいてCurveManagerの近似設定を更新
     * @param {Object} curveManager - CurveManagerインスタンス
     */
    static updateApproximatorSettingsFromParams(curveManager) {
        if (!curveManager) return;
        
        // snapパラメータをチェック
        if (this.hasParameter('snap')) {
            curveManager.setApproximatorSettings({
                snap: true
            });
        }
    }

    /**
     * URLパラメータに基づいて設定を更新
     * @param {Object} settings - 設定オブジェクト
     * @deprecated CurveManagerの近似設定用のupdateApproximatorSettingsFromParamsを使用してください
     */
    static updateSettingsFromParams(settings) {
        // snapパラメータをチェック
        if (this.hasParameter('snap')) {
            settings.snap = true;
        }
    }
}
