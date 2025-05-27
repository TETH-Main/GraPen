export class NewFeatureModal {
    constructor(languageManager) {
        this.featureLists = {
            ja: [
                "キーボードショートカットを追加！ Ctrl+Z (元に戻す)、Ctrl+Y (やり直し)、Ctrl+S (保存) が使えるようになりました。",
                "数式コピーを修正！Desmos形式のpiecewiseを追加しました。",
                "その他、細かいバグを修正し、さらに使いやすくなりました。"
            ],
            en: [
                "New Keyboard Shortcuts! You can now use Ctrl+Z (Undo), Ctrl+Y (Redo), and Ctrl+S (Save).",
                "Fixed Formula Copy! Added piecewise support in Desmos format.",
                "We've also fixed some minor bugs to make things even smoother!"
            ]
        };
        this.version = 'v1.0.3';
        this.languageManager = languageManager;
        this.storageKey = `newFeatureModalShown_v${this.version}`;
        this.modal = null;
        this.overlay = null;
        this.init();
    }

    init() {
        if (this.shouldShowModal()) {
            this.createModal();
            this.setupEventListeners();
            this.showModal();
        }
    }

    shouldShowModal() {
        return !localStorage.getItem(this.storageKey);
    }

    getFeatureListHtml() {
        let lang = 'ja';
        if (this.languageManager && this.languageManager.currentLang) {
            lang = this.languageManager.currentLang;
        }
        const list = this.featureLists[lang] || this.featureLists['ja'];
        return `<ul>${list.map(item => `<li>${item}</li>`).join('')}</ul>`;
    }

    createModal() {
        const featureListHtml = this.getFeatureListHtml();
        const modalHtml = `
            <div class="modal-overlay"></div>
            <div class="modal-content new-feature-modal">
                <div class="modal-header">
                    <h3>
                        <i class="material-symbols-rounded">new_releases</i>
                        ${this.version} <span data-i18n="new_feature.title">新機能のお知らせ</span>
                    </h3>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="modal-body">
                    ${featureListHtml}
                </div>
                <div class="modal-footer">
                    <a href="https://github.com/TETH-Main/GraPen/wiki/Changelog" target="_blank" rel="noopener noreferrer" style="margin-right:auto;font-size:0.95em;color:#007bff;text-decoration:underline;" data-i18n="new_feature.details_link">
                        詳細はこちら
                    </a>
                    <button class="modal-button close-btn" data-i18n="close">閉じる</button>
                </div>
            </div>
        `;
        const root = document.getElementById('new-feature-modal-root');
        if (root) {
            root.innerHTML = modalHtml;
            this.modal = root.querySelector('.new-feature-modal');
            this.overlay = root.querySelector('.modal-overlay');
        }
    }

    setupEventListeners() {
        const closeBtn = this.modal.querySelector('.close-modal-btn');
        const footerCloseBtn = this.modal.querySelector('.close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());
        if (footerCloseBtn) footerCloseBtn.addEventListener('click', () => this.hideModal());
        if (this.overlay) this.overlay.addEventListener('click', () => this.hideModal());
    }

    showModal() {
        if (this.modal && this.overlay) {
            this.modal.classList.add('open');
            this.overlay.classList.add('open');
        }
    }

    hideModal() {
        if (this.modal && this.overlay) {
            this.modal.classList.remove('open');
            this.overlay.classList.remove('open');
            localStorage.setItem(this.storageKey, '1');
        }
    }
}
