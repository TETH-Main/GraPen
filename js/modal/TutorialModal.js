export class TutorialModal {
    constructor(languageManager = null) {
        this.languageManager = languageManager;
        this.container = document.getElementById('tutorial-container');
        if (!this.container) {
            console.error('Tutorial container not found');
            return;
        }
        
        // チュートリアルのステップ定義
        this.steps = [
            {
                title: '線を描く',
                description: 'ペンツールで自由に描いてみましょう'
            },
            {
                title: '曲線の式を観察する',
                description: '描いた曲線の式を確認してみましょう'
            },
            {
                title: '絵を描く',
                description: '曲線を組み合わせて絵を描いてみましょう'
            }
        ];

        this.createTutorialPanel();
        this.checkVisibilityState();
        this.initialize();

        // i18n適用
        if (this.languageManager) {
            const i18nElements = this.container.querySelectorAll('[data-i18n]');
            i18nElements.forEach(el => {
                this.languageManager.updateSpecificElement(el);
            });
        }
    }

    checkVisibilityState() {
        const lastClosed = localStorage.getItem('tutorialLastClosed');
        if (lastClosed) {
            const lastClosedDate = new Date(lastClosed);
            const now = new Date();
            const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;

            if (now - lastClosedDate < oneWeekInMs) {
                this.hidePanel();
            } else {
                this.showPanel();
            }
        }
    }

    createTutorialPanel() {
        const panel = document.createElement('div');
        panel.className = 'tutorial-panel';

        // 閉じるボタン
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tutorial-close-btn';
        closeBtn.innerHTML = '&times;';
        panel.appendChild(closeBtn);

        // チュートリアルコンテンツ
        const content = document.createElement('div');
        content.className = 'tutorial-content';

        // ステップを追加
        this.steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'tutorial-step';
            stepElement.innerHTML = `
                <span class="step-number">${index + 1}</span>
                <div class="step-text">
                    <p data-i18n="tutorial.steps.${index}.title">${step.title}</p>
                    <small data-i18n="tutorial.steps.${index}.description">${step.description}</small>
                </div>
            `;
            content.appendChild(stepElement);
        });

        panel.appendChild(content);

        // フッター
        const footer = document.createElement('div');
        footer.className = 'tutorial-footer';
        footer.innerHTML = `
            <a href="#" target="_blank" class="tutorial-link" data-i18n="tutorial.more_info">より詳しく基本操作を知りたい方</a>
        `;
        panel.appendChild(footer);

        this.container.appendChild(panel);
        this.panel = panel;

        // 言語に応じてリンク先を設定
        if (this.languageManager) {
            const tutorialLink = panel.querySelector('.tutorial-link');
            if (tutorialLink) {
                tutorialLink.href = this.languageManager.getTutorialUrl();
            }
        }
    }

    initialize() {
        const closeBtn = this.panel.querySelector('.tutorial-close-btn');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hidePanel();
                localStorage.setItem('tutorialLastClosed', new Date().toISOString());
            });
        }
    }

    hidePanel() {
        this.panel.style.display = 'none';
    }

    showPanel() {
        this.panel.style.display = 'block';
    }
}
