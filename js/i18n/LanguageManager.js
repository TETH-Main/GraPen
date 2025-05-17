export class LanguageManager {
    constructor() {
        this.currentLang = localStorage.getItem('language') || 'ja';
        this.translations = {};
        this.languages = [];
        this.panel = null;
        this.init();
    }

    async init() {
        try {
            // 利用可能な言語リストを読み込む
            const langResponse = await fetch('js/i18n/languages.json');
            const langData = await langResponse.json();
            this.languages = langData.available;

            // 翻訳データを読み込む
            const transResponse = await fetch('js/i18n/translations.json');
            this.translations = await transResponse.json();

            this.createLanguagePanel();
            this.setupEventListeners();
            this.updatePageText();
        } catch (error) {
            console.error('Failed to initialize language manager:', error);
        }
    }

    createLanguagePanel() {
        if (this.panel) {
            this.panel.remove();
        }

        this.panel = document.createElement('div');
        this.panel.id = 'language-panel';
        this.panel.className = 'settings-panel';

        this.languages.forEach(lang => {
            const button = document.createElement('button');
            const isActive = this.currentLang === lang.code;
            button.className = `language-option ${isActive ? 'active' : ''}`;
            button.dataset.lang = lang.code;
            button.innerHTML = `
                ${lang.name}
                <i class="material-symbols-rounded check-icon">done</i>
            `;
            
            button.addEventListener('click', () => {
                this.changeLanguage(lang.code);
                this.hidePanel();
            });
            
            this.panel.appendChild(button);
        });

        document.body.appendChild(this.panel);
    }

    showPanel() {
        if (!this.panel) {
            this.createLanguagePanel();
        }

        const langBtn = document.getElementById('language-selector');
        if (langBtn) {
            const rect = langBtn.getBoundingClientRect();
            this.panel.style.top = `${rect.bottom + 5}px`;
            this.panel.style.right = `${window.innerWidth - rect.right}px`;
        }

        this.panel.classList.add('visible');
        this.isOpen = true;
    }

    hidePanel() {
        this.panel.classList.remove('visible');
        this.isOpen = false;
    }

    togglePanel() {
        if (this.isOpen) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }

    changeLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('language', lang);
        this.updateActiveLanguage();
        this.updatePageText();
        this.hidePanel();
    }

    updateActiveLanguage() {
        document.querySelectorAll('.language-option').forEach(option => {
            option.classList.toggle('active', option.dataset.lang === this.currentLang);
        });
        document.documentElement.lang = this.currentLang;
    }

    updatePageText() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.dataset.i18n;
            if (!this.translations[this.currentLang] || !this.translations[this.currentLang][key]) return;

            // header, actions, toolsはtitle属性を置換
            if (
                key.startsWith('header.') ||
                key.startsWith('actions.') ||
                key.startsWith('tools.')
            ) {
                el.title = this.translations[this.currentLang][key];
            } else {
                // それ以外はテキストを置換
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = this.translations[this.currentLang][key];
                } else {
                    el.textContent = this.translations[this.currentLang][key];
                }
            }
        });
    }

    updateSpecificElement(element) {
      if (!element || !this.translations[this.currentLang]) return;

      const key = element.dataset.i18n;
      if (!key || !this.translations[this.currentLang][key]) return;

      if (
        key.startsWith('header.') ||
        key.startsWith('actions.') ||
        key.startsWith('tools.')
      ) {
        element.title = this.translations[this.currentLang][key];
      } else {
        // それ以外はテキストを置換
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.placeholder = this.translations[this.currentLang][key];
        } else {
          element.textContent = this.translations[this.currentLang][key];
        }
      }
    }

    setupEventListeners() {
        // 言語切り替えボタンのイベントリスナー
        const langBtn = document.getElementById('language-selector');
        if (langBtn) {
            langBtn.addEventListener('click', () => this.togglePanel());
        }

        // パネル外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.panel.contains(e.target) && 
                !e.target.closest('#language-selector')) {
                this.hidePanel();
            }
        });

        // 言語オプションのクリックイベント
        this.panel.querySelectorAll('.language-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const lang = e.currentTarget.dataset.lang;
                this.changeLanguage(lang);
            });
        });

        // ESCキーで閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.hidePanel();
            }
        });
    }
}