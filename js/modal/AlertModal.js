export class AlertModal {
    constructor() {
        // 既存のアラート要素を確認
        this.alertElement = document.getElementById('alert-modal');
        if (!this.alertElement) {
            this.createAlertElement();
        }
    }

    createAlertElement() {
        this.alertElement = document.createElement('div');
        this.alertElement.id = 'alert-modal';
        this.alertElement.className = 'alert-modal hidden';
        document.body.appendChild(this.alertElement);
    }

    /**
     * アラートメッセージを表示
     * @param {string} message - 表示するメッセージ
     * @param {Object} options - オプション設定
     * @param {string} options.type - アラートタイプ ('info', 'warning', 'error')
     * @param {number} options.duration - 表示時間(ミリ秒)
     * @param {string} options.position - 表示位置 ('center', 'center-top', 'center-bottom', 'center-left', 'center-right', 
     *                                    'top-right', 'bottom-right', 'top-left', 'bottom-left')
     * @param {HTMLElement} options.targetElement - 表示対象のDOM要素
     * @param {Object} options.link - リンクオプション {text: string, onClick: function}
     */
    show(message, options = {}) {
        const {
            type = 'error',
            duration = 3000,
            position = 'center',  // デフォルトを中央に変更
            targetElement = document.body,
            link = null
        } = options;

        // アイコンの設定
        const icons = {
            info: '<i class="material-symbols-rounded">info</i>',
            warning: '<i class="material-symbols-rounded">warning</i>',
            error: '<i class="material-symbols-rounded">cancel</i>'
        };

        // 位置クラスをリセット
        this.alertElement.className = 'alert-modal';
        
        // タイプと位置のクラスを追加
        this.alertElement.classList.add(`alert-${type}`, `alert-${position}`);
        
        // メッセージとリンクを設定
        let content = `
            <div class="alert-icon">${icons[type] || icons.info}</div>
            <div class="alert-content">
                <strong class="alert-message">${message}</strong>
                ${link ? `<a href="#" class="alert-link">${link.text}</a>` : ''}
            </div>
        `;
        
        this.alertElement.innerHTML = content;

        // リンクのクリックイベントを設定
        if (link && link.onClick) {
            const linkElement = this.alertElement.querySelector('.alert-link');
            if (linkElement) {
                linkElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    link.onClick();
                });
            }
        }

        // ターゲット要素が指定されている場合は、その要素に追加
        if (targetElement !== document.body) {
            targetElement.appendChild(this.alertElement);
            this.alertElement.classList.add('alert-in-element');
        } else {
            document.body.appendChild(this.alertElement);
        }
        
        // 表示
        this.alertElement.classList.remove('hidden');
        
        // 指定時間後に非表示
        setTimeout(() => {
            this.alertElement.classList.add('hidden');
            // アニメーション完了後に要素を削除
            setTimeout(() => {
                if (this.alertElement.parentNode) {
                    this.alertElement.parentNode.removeChild(this.alertElement);
                }
            }, 500);
        }, duration);
    }
}
