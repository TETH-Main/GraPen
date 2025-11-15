import { initGraphCalculator } from './graph/GraphInit.js';
import { CurveManager } from './curve/CurveManager.js';
import { HistoryManager } from './history/HistoryManager.js';
import { UIManager } from './ui/UIManager.js';
import { TutorialModal } from './modal/TutorialModal.js';
import { CurveMovementHandler } from './curve/CurveMovementHandler.js';
import { LanguageManager } from './i18n/LanguageManager.js';
import { GraphStorageManager } from './storage/GraphStorageManager.js';
import { NewFeatureModal } from './modal/NewFeatureModal.js';
import { URLParamsUtil } from './util/URLParamsUtil.js';
import { GraPen } from './GraPen.js';

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
        nextCurveId: 0,
        advancedMode: false
    };

    // URLクエリや外部からのフラグによる UI の抑制フラグ
    // クエリ名:
    //  - hideNewFeatureModal    -> new-feature-modal-root を非表示にする
    //  - hideTutorialModal      -> tutorial-container を非表示にする
    //  - suppressUnloadAlert    -> beforeunload の警告を抑制する
    settings.hideNewFeatureModal = URLParamsUtil.hasParameter('hideNewFeatureModal');
    settings.hideTutorialModal = URLParamsUtil.hasParameter('hideTutorialModal');
    settings.suppressUnloadAlert = URLParamsUtil.hasParameter('suppressUnloadAlert');

    // GraphCalculatorの初期化
    const graphCalculator = initGraphCalculator();

    // 履歴管理の初期化
    const historyManager = new HistoryManager();

    const languageManager = new LanguageManager('ja');

    // 曲線管理の初期化
    const curveManager = new CurveManager(settings, historyManager, graphCalculator, languageManager);

    // URLパラメータに基づいてCurveManagerの近似設定を更新
    URLParamsUtil.updateApproximatorSettingsFromParams(curveManager);

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

    // Tutorial Modalの初期化（URLクエリ / 設定で抑制できる）
    const tutorialModal = settings.hideTutorialModal ? null : new TutorialModal(languageManager);

    // 新機能通知モーダルの表示（バージョンは適宜変更）
    const newFeatureModal = settings.hideNewFeatureModal ? null : new NewFeatureModal(languageManager);

    // イベントリスナーの設定
    uiManager.setupEventListeners();

    // 初期ツール（ペン）を設定
    uiManager.setActiveTool('pen');

    // 履歴管理の初期化
    historyManager.initManagers(uiManager);

    // GraPen APIクラスの初期化
    const graPen = new GraPen(
        uiManager,
        curveManager,
        graphCalculator,
        historyManager,
        settings,
        curveMovementHandler
    );

    // グローバルに公開（開発者ツールのコンソールからアクセス可能）
    window.GraPen = graPen;

    // URL からハッシュパラメータを取得してグラフを読み込み
    // --- ホームボタンの表示/非表示をドメイン状態に応じて切り替える ---
    const homeToolbar = document.getElementById('canvas-toolbar-home');
    const updateHomeVisibility = () => {
        try {
            const atHome = graPen.isAtHome();
            // null: 判定できない場合は変更しない
            if (atHome === null) return;
            if (atHome) {
                // 専用クラスを追加して CSS のフェードアウトを有効にする
                homeToolbar && homeToolbar.classList.add('home-hidden');
                homeToolbar && homeToolbar.setAttribute('aria-hidden', 'true');
            } else {
                homeToolbar && homeToolbar.classList.remove('home-hidden');
                homeToolbar && homeToolbar.setAttribute('aria-hidden', 'false');
            }
        } catch (e) {
            // ignore
        }
    };

    // ユーザー操作や描画のタイミングでドメインが変わる可能性があるため、GraphCalculator のイベントにフックする
    if (graphCalculator && graphCalculator.options && graphCalculator.options.events) {
        const attach = (name) => {
            const prev = graphCalculator.options.events[name];
            if (typeof prev === 'function') {
                graphCalculator.options.events[name] = function (...args) {
                    try { prev.apply(this, args); } catch (e) { /* ignore */ }
                    try { updateHomeVisibility(); } catch (e) { /* ignore */ }
                };
            } else {
                graphCalculator.options.events[name] = function () { try { updateHomeVisibility(); } catch (e) { /* ignore */ } };
            }
        };
        ['onZoomEnd', 'onDragEnd', 'onResize', 'onDraw'].forEach(attach);
    }

    // グラフを読み込んだあと、初期表示を更新
    await URLParamsUtil.loadGraphFromHashParameter(graphStorageManager, uiManager);
    // 初期状態に応じてホームボタンを更新（読み込みでドメインが変わるため）
    try { updateHomeVisibility(); } catch (e) { /* ignore */ }
});

// ビューポート高さとキャンバス領域を動的に計算して CSS 変数にセットする
// モバイルブラウザでアドレスバー等が表示/非表示になると window.innerHeight が変化するため
// それに合わせて --viewport-height / --canvas-height / --header-height を更新し、
// CSS 側でそれらを参照してレイアウトを安定させます。
function updateMobileViewportVars() {
    try {
        const vh = window.innerHeight || document.documentElement.clientHeight;
        document.documentElement.style.setProperty('--viewport-height', `${vh}px`);

        const header = document.querySelector('.header');
        const headerH = header ? header.offsetHeight : 46;
        document.documentElement.style.setProperty('--header-height', `${headerH}px`);

        // キャンバス領域はヘッダを除いた可視高さの 45% を目安にし、260px〜480px の範囲に収める
        // （ユーザーの要望に応じてキャンバスをさらに広めに確保）
        const canvasH = Math.min(480, Math.max(260, Math.round((vh - headerH) * 0.45)));
        document.documentElement.style.setProperty('--canvas-height', `${canvasH}px`);
    } catch (e) {
        // console.warn('updateMobileViewportVars failed', e);
    }
}

// 初期セットとウィンドウ変化時の更新
document.addEventListener('DOMContentLoaded', () => updateMobileViewportVars());
window.addEventListener('resize', () => updateMobileViewportVars());
window.addEventListener('orientationchange', () => updateMobileViewportVars());
