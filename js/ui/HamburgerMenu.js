export class HamburgerMenu {
    constructor(graphStorageManager) {
        this.graphStorageManager = graphStorageManager;
        this.currentDeletingHash = null;
        this.init();
    }

    init() {
        // 要素の初期化
        this.setupElements();
        // 削除確認モーダルの作成
        this.createDeleteModal();
        // イベントリスナーの設定
        this.setupEventListeners();
    }

    setupElements() {
        this.menuBtn = document.getElementById('hamburger-menu-btn');
        this.menu = document.getElementById('hamburger-menu');
        this.overlay = document.getElementById('hamburger-menu-overlay');
        this.closeBtn = document.getElementById('close-hamburger-menu');
    }

    createDeleteModal() {
        const modalHtml = `
            <div class="delete-confirm-modal">
                <div class="modal-title" data-i18n="menu.delete_graph">グラフを削除</div>
                <div class="modal-message" data-i18n="menu.delete_confirmation">
                    このグラフを削除してもよろしいですか？<br>この操作は取り消せません。
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn cancel" data-i18n="menu.delete_cancel">キャンセル</button>
                    <button class="modal-btn delete" data-i18n="menu.delete_confirm">削除する</button>
                </div>
            </div>
            <div class="modal-overlay"></div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.deleteModal = document.querySelector('.delete-confirm-modal');
        this.modalOverlay = document.querySelector('.modal-overlay');

        // 削除モーダルのイベントリスナー
        document.querySelector('.modal-btn.cancel').addEventListener('click', () => this.hideDeleteModal());
        document.querySelector('.modal-btn.delete').addEventListener('click', () => {
            if (this.currentDeletingHash) {
                this.deleteGraph(this.currentDeletingHash);
                this.hideDeleteModal();
            }
        });
        this.modalOverlay.addEventListener('click', () => this.hideDeleteModal());
    }

    setupEventListeners() {
        this.menuBtn.addEventListener('click', () => this.openMenu());
        this.closeBtn.addEventListener('click', () => this.closeMenu());
        this.overlay.addEventListener('click', () => this.closeMenu());

        // Escキーでモーダルと閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.deleteModal.classList.contains('open')) {
                    this.hideDeleteModal();
                } else if (this.menu.classList.contains('open')) {
                    this.closeMenu();
                }
            }
        });
    }

    openMenu() {
        this.renderGraphList();
        this.menu.classList.add('open');
        this.overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    closeMenu() {
        this.menu.classList.remove('open');
        this.overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    showDeleteModal(hash) {
        this.currentDeletingHash = hash;
        this.deleteModal.classList.add('open');
        this.modalOverlay.classList.add('open');
    }

    hideDeleteModal() {
        this.deleteModal.classList.remove('open');
        this.modalOverlay.classList.remove('open');
        this.currentDeletingHash = null;
    }

    deleteGraph(hash) {
        this.graphStorageManager.removeGraphByHash(hash);
        const block = document.querySelector(`.graph-block[data-hash="${hash}"]`);
        if (block) {
            const link = block.closest('.graph-block-link');
            if (link) {
                link.remove();
            } else {
                block.remove();
            }
        }
        // グラフリストが空になった場合のメッセージを表示
        const listElem = document.querySelector('.menu-graph-list');
        const noGraphsSpan = listElem.querySelector('.menu-no-graphs');
        if (listElem.querySelectorAll('.graph-block-link').length === 0) {
            if (noGraphsSpan) noGraphsSpan.style.display = 'block';
        } else {
            if (noGraphsSpan) noGraphsSpan.style.display = 'none';
        }
    }

    renderGraphList() {
        const graphList = this.graphStorageManager.getGraphList();
        const listElem = document.querySelector('.menu-graph-list');

        const noGraphsSpan = document.querySelector('.menu-no-graphs');

        listElem.querySelectorAll('.graph-block-link').forEach(el => el.remove());

        if (!graphList || graphList.length === 0) {
            noGraphsSpan.style.display = 'block';
            // if (this.languageManager) this.languageManager.updatePageText();
            return;
        } else {
            noGraphsSpan.style.display = 'none';
        }

        graphList.forEach(graph => {
            // aタグでグラフブロック全体をラップ
            const link = document.createElement('a');
            link.href = `https://teth-main.github.io/GraPen/?h=${graph.hash}`;
            link.rel = 'noopener noreferrer';
            link.className = 'graph-block-link';

            const block = document.createElement('div');
            block.className = 'graph-block';
            block.tabIndex = 0;
            block.dataset.hash = graph.hash;
            block.innerHTML = `
                <div class="graph-thumb">
                    <img src="${graph.thumbnail}" alt="thumb" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">
                    <span class="graph-hash thumb-hash">${graph.hash}</span>
                </div>
                <div class="graph-info">
                    <div class="graph-title">${graph.title}</div>
                </div>
                <button class="graph-delete-btn" title="削除" type="button">
                    <i class="material-symbols-rounded" aria-hidden="true">delete</i>
                    <span class="sr-only">削除</span>
                </button>
                <div class="graph-loading-indicator"></div>
            `;

            // 削除ボタンのイベントリスナー
            const deleteBtn = block.querySelector('.graph-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault(); // aタグ遷移防止
                this.showDeleteModal(graph.hash);
            });

            // クリック時のローディングUI
            block.addEventListener('click', (e) => {
                // 削除ボタン以外のクリックでローディング
                if (block.classList.contains('loading')) return;
                document.querySelectorAll('.graph-block.loading').forEach(b => b.classList.remove('loading'));
                block.classList.add('loading');
                setTimeout(() => block.classList.remove('loading'), 1500);
                // aタグのデフォルト遷移は許可（新規タブ）
            });

            link.appendChild(block);
            listElem.appendChild(link);
        });
    }
}
