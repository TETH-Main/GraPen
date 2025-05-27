import { initGraphCalculator } from './graph/GraphInit.js';
import { CurveManager } from './curve/CurveManager.js';
import { HistoryManager } from './history/HistoryManager.js';
import { UIManager } from './ui/UIManager.js';
import { TutorialModal } from './modal/TutorialModal.js';
import { CurveMovementHandler } from './curve/CurveMovementHandler.js';
import { LanguageManager } from './i18n/LanguageManager.js';
import { GraphStorageManager } from './storage/GraphStorageManager.js';
import { NewFeatureModal } from './modal/NewFeatureModal.js';

// URL からクエリパラメータを取得する関数
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// 初期化
document.addEventListener('DOMContentLoaded', async function () {
    // 初期設定
    const settings = {
        currentColor: "#000000",
        currentSize: 6,
        prevColor: "#000000",
        prevSize: 6,
        currentTool: 'pen',
        selectCurveId: null,
        nextCurveId: 0
    };

    // GraphCalculatorの初期化
    const graphCalculator = initGraphCalculator();

    // 履歴管理の初期化
    const historyManager = new HistoryManager();

    const languageManager = new LanguageManager('ja');

    // 曲線管理の初期化
    const curveManager = new CurveManager(settings, historyManager, graphCalculator, languageManager);

    // 曲線移動ハンドラの初期化
    const curveMovementHandler = new CurveMovementHandler(curveManager, settings, graphCalculator);

    // GraphStorageManagerの初期化
    const graphStorageManager = new GraphStorageManager();

    // UI管理の初期化
    const uiManager = new UIManager(
        settings, 
        graphCalculator, 
        curveManager, 
        historyManager, 
        curveMovementHandler,
        graphStorageManager,
        languageManager
    );

    // Tutorial Modalの初期化
    const tutorialModal = new TutorialModal(languageManager);

    // 新機能通知モーダルの表示（バージョンは適宜変更）
    const newFeatureModal = new NewFeatureModal(languageManager);

    // イベントリスナーの設定
    uiManager.setupEventListeners();

    // 初期ツール（ペン）を設定
    uiManager.setActiveTool('pen');

    // 履歴管理の初期化
    historyManager.initManagers(uiManager);

    // URL からハッシュパラメータを取得
    const hashParam = getUrlParameter('h');
    if (hashParam) {
        try {
            // ローディングインジケータを表示
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '1';
                loadingOverlay.style.display = 'flex';
                loadingOverlay.style.pointerEvents = 'auto';
            }

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
                        document.title = `${result.title} - GraPen`;
                        
                        // ヘッダーのタイトル表示を更新
                        const titleDisplay = document.getElementById('graph-title-display');
                        if (titleDisplay) {
                            titleDisplay.textContent = result.title;
                            titleDisplay.classList.add('active');
                        }
                    }
                } else {
                    console.error('グラフの復元に失敗しました');
                }
            } else {
                console.warn(`Graph with hash ${hashParam} not found or could not be loaded.`);
            }
            
            // ローディングインジケータを非表示
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                    loadingOverlay.style.pointerEvents = 'none';
                }, 500);
            }
        } catch (error) {
            console.error(`Error loading graph with hash ${hashParam}:`, error);
            // ローディングインジケータを非表示
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                    loadingOverlay.style.pointerEvents = 'none';
                }, 500);
            }
        }
    }
});
