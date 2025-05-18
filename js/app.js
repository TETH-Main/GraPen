import { initGraphCalculator } from './graph/GraphInit.js';
import { CurveManager } from './curve/CurveManager.js';
import { HistoryManager } from './history/HistoryManager.js';
import { UIManager } from './ui/UIManager.js';
import { TutorialModal } from './modal/TutorialModal.js';
import { CurveMovementHandler } from './curve/CurveMovementHandler.js';
import { LanguageManager } from './i18n/LanguageManager.js';

// 初期化
document.addEventListener('DOMContentLoaded', function () {
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

    // 曲線管理の初期化
    const curveManager = new CurveManager(settings, historyManager, graphCalculator);

    // 曲線移動ハンドラの初期化
    const curveMovementHandler = new CurveMovementHandler(curveManager, settings);

    // LanguageManagerのインスタンスを作成
    const languageManager = new LanguageManager('ja');

    // UI管理の初期化（curveMovementHandlerを渡す）
    const uiManager = new UIManager(settings, graphCalculator, curveManager, historyManager, curveMovementHandler);
    uiManager.languageManager = languageManager;
    uiManager.penToolManager.languageManager = languageManager;

    // CurveManagerにLanguageManagerを渡す
    curveManager.languageManager = languageManager;

    // Tutorial Modalの初期化
    const tutorialModal = new TutorialModal(languageManager);

    // イベントリスナーの設定
    uiManager.setupEventListeners();

    // 初期ツール（ペン）を設定
    uiManager.setActiveTool('pen');

    // 履歴管理の初期化
    historyManager.initManagers(uiManager);
});
