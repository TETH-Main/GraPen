import { DEFAULT_OPTIONS } from './GraphCalculatorOptions.js';
import { 
    isValidNumber, 
    formatNumber, 
    calculateGridSpacing, 
    easeOutCubic 
} from './GraphCalculatorUtils.js';
import { getShapeGenerator } from './PointShapes.js';

/**
 * SVGベースのインタラクティブなグラフ計算機
 */
export default class GraphCalculator {
    /**
     * グラフ計算機を初期化
     * @param {string|HTMLElement} container - グラフを配置するコンテナ要素またはID
     * @param {Object} customOptions - カスタムオプション
     */
    constructor(container, customOptions = {}) {
        // コンテナの取得
        this.container = typeof container === 'string' 
            ? document.getElementById(container) 
            : container;
            
        if (!this.container) {
            throw new Error('GraphCalculator: 指定されたコンテナが見つかりません。');
        }
        
        // SVG要素の作成
        this.svg = this.container.nodeName === 'svg' 
            ? this.container 
            : document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            
        if (this.container !== this.svg) {
            this.container.appendChild(this.svg);
        }
        
        this.svgNS = 'http://www.w3.org/2000/svg';
        
        // オプションの設定
        this.options = this._mergeOptions(DEFAULT_OPTIONS, customOptions);
        
        // ドメイン状態の初期化
        this.domainState = { ...this.options.domain };
        
        // 前回のドメイン状態を保存（リサイズ用）
        this.previousDomainState = { ...this.domainState };
        
        // ドラッグ操作用のマウス状態
        this.mouseState = {
            dragging: false,
            lastX: 0,
            lastY: 0
        };
        
        // タッチ操作用の状態
        this.touchState = {
            dragging: false,
            lastX: 0,
            lastY: 0,
            pinchDistance: 0,
            isPinching: false,
            lastTapTime: 0,
            doubleTapDelay: 300, // ダブルタップ判定のミリ秒
            preventMouseEvents: false // タッチ後のマウスイベント抑制用
        };
        
        // アニメーション用
        this.zoomAnimation = {
            isActive: false,
            startTime: 0,
            duration: this.options.animation.duration,
            targetDomain: null,
            startDomain: null
        };
        
        // 曲線管理用のプロパティ
        this.curves = [];
        this.graphGroup = null;
        
        // 機能の有効/無効状態を追跡
        this.interactionState = {
            zoomEnabled: true,
            canvasEnabled: true
        };
        
        // イベントリスナーの設定
        this._setupListeners();
        
        // コンテナサイズの変更を監視するためのResizeObserver
        this._setupResizeObserver();
        
        // 初期描画
        this.updateSize();
        this.draw();
        
        // アニメーションループの開始
        this._setupAnimationLoop();
        
        // 初期化完了をログ
        this._log('GraphCalculator initialized', this.options);
    }
    
    /**
     * オプションをマージする
     * @private
     */
    _mergeOptions(defaults, custom) {
        const merged = { ...defaults };
        
        // 再帰的にマージ
        for (const key in custom) {
            if (custom.hasOwnProperty(key)) {
                if (typeof custom[key] === 'object' && custom[key] !== null && 
                    typeof merged[key] === 'object' && merged[key] !== null) {
                    merged[key] = this._mergeOptions(merged[key], custom[key]);
                } else {
                    merged[key] = custom[key];
                }
            }
        }
        
        return merged;
    }
    
    /**
     * イベントリスナーのセットアップ
     * @private
     */
    _setupListeners() {
        // ズーム用のマウスホイールイベント
        this.svg.addEventListener('wheel', this._handleWheel.bind(this));
        
        // パン用のマウスイベント
        this.svg.addEventListener('mousedown', this._handleMouseDown.bind(this));
        document.addEventListener('mousemove', this._handleMouseMove.bind(this));
        document.addEventListener('mouseup', this._handleMouseUp.bind(this));
        document.addEventListener('mouseleave', this._handleMouseLeave.bind(this));
        
        // ウィンドウリサイズ処理
        if (this.options.responsive) {
            window.addEventListener('resize', this._handleResize.bind(this));
        }

        this.svg.addEventListener('dblclick', this._handleDoubleClick.bind(this));
        
        // タッチデバイス用のイベント
        this.svg.addEventListener('touchstart', this._handleTouchStart.bind(this), { passive: false });
        this.svg.addEventListener('touchmove', this._handleTouchMove.bind(this), { passive: false });
        this.svg.addEventListener('touchend', this._handleTouchEnd.bind(this), { passive: false });
        this.svg.addEventListener('touchcancel', this._handleTouchCancel.bind(this), { passive: false });
    }
    
    /**
     * ResizeObserverのセットアップ
     * @private
     */
    _setupResizeObserver() {
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    if (entry.target === this.container) {
                        // リサイズ前のドメイン状態を保存
                        this.previousDomainState = {...this.domainState};

                        // コンテナのサイズを取得
                        const width = this.container.clientWidth;
                        const height = this.container.clientHeight;
                        const aspectRatio = height / width;
                        
                        // サイズ更新
                        this.resize(
                            width,
                            height,
                            true
                        );

                        this.options.domain = {
                            xMin: -10,
                            xMax: 10,
                            yMin: -10 * aspectRatio,
                            yMax: 10 * aspectRatio
                        };
                    }
                }
            });
            
            this.resizeObserver.observe(this.container);
            this._log('ResizeObserver initialized');
        } else {
            this._log('ResizeObserver not supported in this browser');
        }
    }
    
    /**
     * リサイズ処理
     * @param {number} width - 新しい幅
     * @param {number} height - 新しい高さ
     * @param {boolean} maintainAspectRatio - アスペクト比を維持するかどうか
     */
    resize(width, height, maintainAspectRatio = true) {
        if (!isValidNumber(width) || !isValidNumber(height) || width <= 0 || height <= 0) {
            this._logError("Invalid dimensions for resize", { width, height });
            return;
        }
        
        // SVGのサイズを更新
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);
        this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        
        if (maintainAspectRatio) {
            this._adjustDomainForAspectRatio();
        }
        
        // 曲線の更新
        this._updateAllCurves();
        
        // 再描画
        this.draw();
        
        if (this.options.events.onResize) {
            this.options.events.onResize(this);
        }
        
        this._log('Resized to', { width, height, domain: this.domainState });
    }
    
    /**
     * 登録されているすべての曲線を更新
     * @private
     */
    _updateAllCurves() {
        if (!this.curves || this.curves.length === 0) return;
        
        // グラフグループのtransformを更新
        this._updateGraphGroupTransform();
        
        this._log('Updated all curves after resize');
    }
    
    /**
     * すべての曲線を取得
     * @returns {Array} 曲線の配列
     */
    getAllCurves() {
        return [...this.curves];
    }
    
    /**
     * IDで曲線を取得
     * @param {string|number} id - 曲線のID
     * @returns {Object|null} 曲線オブジェクト、見つからない場合はnull
     */
    getCurve(id) {
        return this.curves.find(curve => curve && curve.id == id) || null;
    }
    
    /**
     * 曲線を追加
     * @param {string|Array} data - パスデータまたは点の配列
     * @param {Object} options - 曲線のオプション
     * @returns {Object} 追加された曲線オブジェクト
     */
    addCurve(data, options = {}) {
        try {
            // 曲線のカウンタがなければ初期化
            if (!this.curveCounter) this.curveCounter = 0;
            
            // オプションのデフォルト値を設定
            const curveOptions = {
                color: options.color || 'black',
                width: options.width || 5,
                id: options.id || `curve-${this.curveCounter++}`,
                opacity: options.opacity !== undefined ? options.opacity : 1,
                visibility: options.visibility !== undefined ? options.visibility : true,
                strokeDasharray: options.strokeDasharray || 'none', // 点線パターン
                style: options.style || null // スタイル属性をサポート
            };
            
            // 曲線グループがなければ作成
            if (!this.graphGroup) {
                this.graphGroup = this._createSVGElement('g', {
                    'class': 'graph-curves'
                });
                this._updateGraphGroupTransform();
                this.svg.appendChild(this.graphGroup);
            }

            // パスデータを作成 (ドメイン座標のまま保存)
            let pathData;
            let originalData;
            
            if (Array.isArray(data)) {
                // 点の配列をそのまま保存
                originalData = JSON.parse(JSON.stringify(data));
                // SVG用のパスデータを生成
                pathData = this._createPathFromPoints(data);
            } else if (typeof data === 'string') {
                // 既存のSVGパス文字列
                originalData = data;
                pathData = data;
            } else {
                throw new Error('Invalid data type for curve. Expected array of points or SVG path string.');
            }
            
            // スケールに応じた線の太さを計算
            const scaledWidth = this._getScaledStrokeWidth(curveOptions.width);
            
            // スケールに応じた点線パターンを計算
            const scaledDashArray = this._getScaledDashArray(curveOptions.strokeDasharray);
            
            // 曲線IDグループを探すか作成する
            // emphasis-で始まるIDの場合は、元のIDを抽出して、そのグループを使用
            const baseId = curveOptions.id.toString().startsWith('emphasis-') 
                ? curveOptions.id.toString().replace('emphasis-', '') 
                : curveOptions.id.toString();
            
            let curveGroup = this.graphGroup.querySelector(`g[data-curve-base-id="${baseId}"]`);
            
            // グループが存在しない場合は新しく作成
            if (!curveGroup) {
                curveGroup = this._createSVGElement('g', {
                    'data-curve-base-id': baseId,
                    'class': 'curve-group'
                });
                this.graphGroup.appendChild(curveGroup);
            }
            
            // パス要素を作成
            const path = this._createSVGElement('path', {
                'd': pathData,
                'fill': 'none',
                'stroke': curveOptions.color,
                'stroke-width': scaledWidth,
                'stroke-opacity': curveOptions.opacity,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'class': 'curve-path',
                'data-curve-id': curveOptions.id,
                'data-original-width': curveOptions.width,
                'data-original-dasharray': curveOptions.strokeDasharray, // 元のパターンを保存
                'stroke-dasharray': scaledDashArray
            });
            
            // カスタムスタイルを適用
            if (curveOptions.style) {
                Object.keys(curveOptions.style).forEach(key => {
                    path.style[key] = curveOptions.style[key];
                });
            }
            
            // クリック検出用の太い透明パスを追加（ヒットエリア）
            const hitArea = this._createSVGElement('path', {
                'd': pathData,
                'fill': 'none',
                'stroke': 'transparent',
                'stroke-width': this._getScaledStrokeWidth(Math.max(curveOptions.width + 10, 15)),
                'class': 'curve-hit-area',
                'data-curve-id': curveOptions.id,
                'data-original-width': Math.max(curveOptions.width + 10, 15),
                'pointer-events': 'stroke'
            });
            
            // 表示状態に応じてスタイルを設定
            if (!curveOptions.visibility) {
                path.style.opacity = 0;
                hitArea.style.pointerEvents = 'none';
            }
            
            // 曲線IDグループに追加
            // 強調表示レイヤーはメイン曲線の下に配置
            if (curveOptions.id.toString().startsWith('emphasis-')) {
                // 強調曲線は元の曲線より前（下）に配置
                curveGroup.insertBefore(hitArea, curveGroup.firstChild);
                curveGroup.insertBefore(path, curveGroup.firstChild);
            } else {
                // 通常の曲線はグループの最後に追加
                curveGroup.appendChild(hitArea);
                curveGroup.appendChild(path);
            }
            
            // 曲線オブジェクトを作成
            const curve = {
                id: curveOptions.id,
                path: path,
                hitArea: hitArea,
                group: curveGroup, // グループへの参照を保存
                color: curveOptions.color,
                width: curveOptions.width,
                opacity: curveOptions.opacity,
                visibility: curveOptions.visibility,
                strokeDasharray: curveOptions.strokeDasharray, // 点線パターンを保存
                style: curveOptions.style, // スタイル情報を保存
                originalData: originalData, // 元データを保存
                
                // 曲線の更新メソッド
                update: () => {
                    // スケールに応じた線の太さを更新
                    const newScaledWidth = this._getScaledStrokeWidth(curveOptions.width);
                    path.setAttribute('stroke-width', newScaledWidth);
                    
                    // ヒットエリアも更新
                    const hitAreaWidth = this._getScaledStrokeWidth(Math.max(curveOptions.width + 10, 15));
                    hitArea.setAttribute('stroke-width', hitAreaWidth);
                    
                    // 点の配列の場合は、パスデータを再生成
                    if (Array.isArray(originalData)) {
                        const updatedPath = this._createPathFromPoints(originalData);
                        path.setAttribute('d', updatedPath);
                        hitArea.setAttribute('d', updatedPath);
                    }
                },
                
                // 要素の参照
                element: path
            };
            
            // 曲線配列に追加
            this.curves.push(curve);
            
            // 追加成功をログ
            this._log('Added curve', {
                id: curve.id,
                options: curveOptions
            });
            
            return curve;
        } catch (error) {
            this._logError('Error adding curve', error);
            return null;
        }
    }
    
    /**
     * 点の配列からSVGパスデータを作成
     * @private
     * @param {Array} points - 点の配列 [[x1, y1], [x2, y2], ...]
     * @returns {string} SVGパスデータ文字列
     */
    _createPathFromPoints(points) {
        if (!Array.isArray(points) || points.length === 0) {
            return '';
        }
        
        // 最初の点へのMove
        let d = `M ${points[0][0]} ${points[0][1]}`;
        
        // 直線で結ぶ
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i][0]} ${points[i][1]}`;
        }
        
        return d;
    }
    
    /**
     * 曲線を更新
     * @param {string|number} id - 曲線のID
     * @param {Object} options - 更新するオプション
     * @returns {boolean} 更新成功したかどうか
     */
    updateCurve(id, options = {}) {
        try {
            const curve = this.getCurve(id);
            if (!curve) {
                this._log(`Curve with id ${id} not found`);
                return false;
            }
            
            // 色を更新
            if (options.color !== undefined) {
                curve.path.setAttribute('stroke', options.color);
                curve.color = options.color;
            }
            
            // 線の太さを更新
            if (options.width !== undefined) {
                curve.width = options.width;
                curve.path.setAttribute('data-original-width', options.width);
                
                // スケールに応じた線の太さを計算
                const scaledWidth = this._getScaledStrokeWidth(options.width);
                curve.path.setAttribute('stroke-width', scaledWidth);
                
                // ヒットエリアも更新
                if (curve.hitArea) {
                    const hitAreaWidth = Math.max(options.width + 10, 15);
                    curve.hitArea.setAttribute('data-original-width', hitAreaWidth);
                    curve.hitArea.setAttribute('stroke-width', this._getScaledStrokeWidth(hitAreaWidth));
                }
            }
            
            // 透明度を更新
            if (options.opacity !== undefined) {
                curve.path.setAttribute('stroke-opacity', options.opacity);
                curve.opacity = options.opacity;
            }
            
            // 表示/非表示を更新
            if (options.visibility !== undefined) {
                curve.visibility = options.visibility;
                curve.path.style.opacity = options.visibility ? 1 : 0;
                
                // ヒットエリアも更新
                if (curve.hitArea) {
                    curve.hitArea.style.pointerEvents = options.visibility ? 'stroke' : 'none';
                }
            }
            
            // パスデータを更新
            if (options.path !== undefined) {
                let pathData;
                if (Array.isArray(options.path)) {
                    // 新しいデータを保存
                    curve.originalData = JSON.parse(JSON.stringify(options.path));
                    pathData = this._createPathFromPoints(options.path);
                } else if (typeof options.path === 'string') {
                    curve.originalData = options.path;
                    pathData = options.path;
                }
                
                if (pathData) {
                    curve.path.setAttribute('d', pathData);
                    if (curve.hitArea) {
                        curve.hitArea.setAttribute('d', pathData);
                    }
                }
            }
            
            // 点線パターンを更新
            if (options.strokeDasharray !== undefined) {
                curve.path.setAttribute('data-original-dasharray', options.strokeDasharray);
                curve.strokeDasharray = options.strokeDasharray;
                
                // スケールに応じた点線パターンを計算して適用
                const scaledDashArray = this._getScaledDashArray(options.strokeDasharray);
                curve.path.setAttribute('stroke-dasharray', scaledDashArray);
            }
            
            // カスタムスタイルを更新
            if (options.style !== undefined) {
                // 既存のスタイルを削除
                if (curve.style) {
                    Object.keys(curve.style).forEach(key => {
                        curve.path.style[key] = '';
                    });
                }
                
                // 新しいスタイルを適用
                if (options.style) {
                    Object.keys(options.style).forEach(key => {
                        curve.path.style[key] = options.style[key];
                    });
                }
                
                curve.style = options.style;
            }
            
            this._log(`Updated curve ${id}`, options);
            return true;
        } catch (error) {
            this._logError(`Error updating curve ${id}`, error);
            return false;
        }
    }
    
    /**
     * 曲線を削除
     * @param {string|number} id - 曲線のID
     * @returns {boolean} 削除成功したかどうか
     */
    removeCurve(id) {
        try {
            const index = this.curves.findIndex(curve => curve && curve.id == id);
            if (index === -1) {
                this._log(`Curve with id ${id} not found`);
                return false;
            }
            
            const curve = this.curves[index];
            
            // 基本ID（emphasis-プレフィックスなしのID）を取得
            const baseId = id.toString().startsWith('emphasis-') 
                ? id.toString().replace('emphasis-', '') 
                : id.toString();
                
            // 同じグループにある他の曲線を確認
            const otherCurvesInGroup = this.curves.filter(c => 
                c && c.id != id && c.group === curve.group
            );
            
            // DOM要素を削除
            if (curve.path && curve.path.parentNode) {
                curve.path.parentNode.removeChild(curve.path);
            }
            
            if (curve.hitArea && curve.hitArea.parentNode) {
                curve.hitArea.parentNode.removeChild(curve.hitArea);
            }
            
            // グループ内の他の曲線がなくなった場合、グループも削除
            if (otherCurvesInGroup.length === 0 && curve.group && curve.group.parentNode) {
                curve.group.parentNode.removeChild(curve.group);
            }
            
            // 配列から削除
            this.curves.splice(index, 1);
            
            this._log(`Removed curve ${id}`);
            return true;
        } catch (error) {
            this._logError(`Error removing curve ${id}`, error);
            return false;
        }
    }
    
    /**
     * ズーム機能の有効/無効を切り替える
     * @param {boolean} enabled - ズームを有効にするかどうか
     */
    enableZoom(enabled) {
        this.interactionState.zoomEnabled = enabled;
        this._log(`Zoom ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * キャンバス操作（パン）の有効/無効を切り替える
     * @param {boolean} enabled - キャンバス操作を有効にするかどうか
     */
    enableCanvas(enabled) {
        this.interactionState.canvasEnabled = enabled;
        this._log(`Canvas interaction ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * ホイールイベントハンドラ
     * @private
     */
    _handleWheel(e) {
        // ズームが無効になっている場合は何もしない
        if (!this.interactionState.zoomEnabled) return;
        
        e.preventDefault();
        
        // SVG内のマウス位置を取得
        const svgRect = this.svg.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        const mouseY = e.clientY - svgRect.top;

        // 現在のドメインをコピー
        const currentDomain = {...this.domainState};
        
        // ズーム処理のための定数
        const CONSTANT_ZOOM_FACTOR = 0.05; // 一定の拡大率
        const VERTICAL_ZOOM_THRESHOLD = 5; // 垂直移動の閾値（ピクセル）

        // 二本指のトラックパッドの場合（deltaMode === 0）
        if (e.deltaMode === 0) {
            // 垂直方向の移動量が大きい場合、それに基づいてズーム
            if (Math.abs(e.deltaY) > VERTICAL_ZOOM_THRESHOLD) {
                const zoomFactor = e.deltaY > 0 ? (1 + CONSTANT_ZOOM_FACTOR) : (1 - CONSTANT_ZOOM_FACTOR);
                this._applyZoom(mouseX, mouseY, zoomFactor, currentDomain);
            }
            // 水平方向のパン
            if (Math.abs(e.deltaX) > 0) {
                const width = currentDomain.xMax - currentDomain.xMin;
                const panAmount = (e.deltaX / this.svg.clientWidth) * width;
                this.domainState.xMin += panAmount;
                this.domainState.xMax += panAmount;
                this.draw();
            }
        }
        // 通常のマウスホイール（deltaMode === 1）
        else {
            const zoomFactor = e.deltaY > 0 ? (1 + CONSTANT_ZOOM_FACTOR) : (1 - CONSTANT_ZOOM_FACTOR);
            this._applyZoom(mouseX, mouseY, zoomFactor, currentDomain);
        }
    }

    /**
     * ズーム処理を適用
     * @private
     * @param {number} mouseX - マウスのX座標
     * @param {number} mouseY - マウスのY座標
     * @param {number} zoomFactor - ズーム係数
     * @param {Object} currentDomain - 現在のドメイン
     */
    _applyZoom(mouseX, mouseY, zoomFactor, currentDomain) {
        // マウス位置のドメイン座標を取得
        const mouseDomain = this._screenToDomain(mouseX, mouseY);

        // 新しいドメインサイズを計算
        const width = currentDomain.xMax - currentDomain.xMin;
        const height = currentDomain.yMax - currentDomain.yMin;
        const newWidth = width * zoomFactor;
        const newHeight = height * zoomFactor;

        // ドメインサイズの制限をチェック
        if (newWidth < 1e-4 || newHeight < 1e-4 || newWidth > 1e10 || newHeight > 1e10) {
            return;
        }

        // マウス位置に対する比率を計算
        const ratioX = mouseX / this.svg.clientWidth;
        const ratioY = mouseY / this.svg.clientHeight;

        // 新しいドメインを計算
        const targetDomain = {
            xMin: mouseDomain.x - ratioX * newWidth,
            xMax: mouseDomain.x + (1 - ratioX) * newWidth,
            yMin: mouseDomain.y - (1 - ratioY) * newHeight,
            yMax: mouseDomain.y + ratioY * newHeight
        };

        // ドメインの制限をチェック
        if (this._checkDomainLimits(targetDomain)) {
            this.domainState = targetDomain;
            if (this.graphGroup) this._updateGraphGroupTransform();
            this.draw();
        }
    }
    
    /**
     * タッチ開始イベントハンドラ
     * @private
     */
    _handleTouchStart(e) {
        // キャンバス操作が無効になっている場合は何もしない
        if (!this.interactionState.canvasEnabled) return;
        
        // タッチイベント後のマウスイベント抑制フラグをセット
        this.touchState.preventMouseEvents = true;
        
        e.preventDefault(); // スクロールやズームなどの標準動作を抑制
        
        // シングルタッチ(パン)とマルチタッチ(ピンチズーム)を区別
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.touchState.dragging = true;
            this.touchState.lastX = touch.clientX;
            this.touchState.lastY = touch.clientY;
            this.touchState.isPinching = false;
            
            // ダブルタップ検出
            const now = Date.now();
            if (now - this.touchState.lastTapTime < this.touchState.doubleTapDelay) {
                // ダブルタップ発生
                this._handleDoubleTap(touch);
            }
            this.touchState.lastTapTime = now;
            
            if (this.options.events.onDragStart) {
                this.options.events.onDragStart(e, this);
            }
        } 
        else if (e.touches.length === 2 && this.interactionState.zoomEnabled) {
            // ピンチズーム＋パン開始
            this.touchState.isPinching = true;
            this.touchState.dragging = false;

            // 2点間の距離と中心点を計算
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            this.touchState.pinchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            this.touchState.pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
            this.touchState.pinchCenterY = (touch1.clientY + touch2.clientY) / 2;

            // パン用の前回中心点も保存
            this.touchState.lastPinchCenterX = this.touchState.pinchCenterX;
            this.touchState.lastPinchCenterY = this.touchState.pinchCenterY;
        }
    }
    
    /**
     * タッチ移動イベントハンドラ
     * @private
     */
    _handleTouchMove(e) {
        // キャンバス操作が無効になっている場合は何もしない
        if (!this.interactionState.canvasEnabled) return;
        
        e.preventDefault(); // スクロールやズームなどの標準動作を抑制
        
        if (this.touchState.isPinching && e.touches.length === 2 && this.interactionState.zoomEnabled) {
            // 2本指パン＋ピンチズーム
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];

            // 新しい距離と中心点
            const newDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            const newCenterX = (touch1.clientX + touch2.clientX) / 2;
            const newCenterY = (touch1.clientY + touch2.clientY) / 2;

            // ピンチズーム
            if (this.touchState.pinchDistance > 0) {
                const zoomFactor = newDistance / this.touchState.pinchDistance;
                if (zoomFactor > 0.1 && zoomFactor < 10) {
                    // ドメインサイズ
                    const width = this.domainState.xMax - this.domainState.xMin;
                    const height = this.domainState.yMax - this.domainState.yMin;
                    const newWidth = width / zoomFactor;
                    const newHeight = height / zoomFactor;
                    if (newWidth < 1e-4 || newHeight < 1e-4 || newWidth > 1e10 || newHeight > 1e10) {
                        return;
                    }
                    // 新しい中心点のドメイン座標
                    const svgRect = this.svg.getBoundingClientRect();
                    const mouseX = newCenterX - svgRect.left;
                    const mouseY = newCenterY - svgRect.top;
                    const mouseDomain = this._screenToDomain(mouseX, mouseY);

                    // 比率
                    const ratioX = mouseX / this.svg.clientWidth;
                    const ratioY = mouseY / this.svg.clientHeight;

                    // 新しいドメイン
                    let targetDomain = {
                        xMin: mouseDomain.x - ratioX * newWidth,
                        xMax: mouseDomain.x + (1 - ratioX) * newWidth,
                        yMin: mouseDomain.y - (1 - ratioY) * newHeight,
                        yMax: mouseDomain.y + ratioY * newHeight
                    };

                    // 2本指パン（中心点の移動量を反映）
                    if (this.touchState.lastPinchCenterX !== undefined && this.touchState.lastPinchCenterY !== undefined) {
                        const dx = newCenterX - this.touchState.lastPinchCenterX;
                        const dy = newCenterY - this.touchState.lastPinchCenterY;
                        // ドメインの移動量
                        const domainDx = (dx / this.svg.clientWidth) * newWidth;
                        const domainDy = (dy / this.svg.clientHeight) * newHeight;
                        targetDomain.xMin -= domainDx;
                        targetDomain.xMax -= domainDx;
                        targetDomain.yMin += domainDy;
                        targetDomain.yMax += domainDy;
                    }

                    // ドメインの制限
                    if (this._checkDomainLimits(targetDomain)) {
                        this.domainState = targetDomain;
                        if (this.graphGroup) this._updateGraphGroupTransform();
                        this.draw();
                    }
                }
            }
            // 状態更新
            this.touchState.pinchDistance = newDistance;
            this.touchState.pinchCenterX = newCenterX;
            this.touchState.pinchCenterY = newCenterY;
            this.touchState.lastPinchCenterX = newCenterX;
            this.touchState.lastPinchCenterY = newCenterY;
        } 
        else if (this.touchState.dragging && e.touches.length === 1) {
            // パン処理（1本指でのドラッグ）
            const touch = e.touches[0];
            const dx = touch.clientX - this.touchState.lastX;
            const dy = touch.clientY - this.touchState.lastY;
            
            // ドメインの移動量を計算
            const width = this.domainState.xMax - this.domainState.xMin;
            const height = this.domainState.yMax - this.domainState.yMin;
            const domainDx = (dx / this.svg.clientWidth) * width;
            const domainDy = (dy / this.svg.clientHeight) * height;
            
            // ドメインの更新（逆方向にスクロール）
            this.domainState.xMin -= domainDx;
            this.domainState.xMax -= domainDx;
            this.domainState.yMin += domainDy;
            this.domainState.yMax += domainDy;
            
            this.touchState.lastX = touch.clientX;
            this.touchState.lastY = touch.clientY;
            
            // グラフグループの変換を更新
            if (this.graphGroup) {
                this._updateGraphGroupTransform();
            }
            
            // 再描画
            this.draw();
            
            if (this.options.events.onDrag) {
                this.options.events.onDrag(e, this);
            }
        }
    }
    
    /**
     * タッチ終了イベントハンドラ
     * @private
     */
    _handleTouchEnd(e) {
        // 状態をリセット
        if (this.touchState.dragging || this.touchState.isPinching) {
            this.touchState.dragging = false;
            this.touchState.isPinching = false;
            
            if (this.options.events.onDragEnd) {
                this.options.events.onDragEnd(e, this);
            }
        }
        
        // タッチイベント後のマウスイベント抑制フラグをセット
        // 少し遅延させてフラグをリセットするためのタイマー
        setTimeout(() => {
            this.touchState.preventMouseEvents = false;
        }, 500); // 500msの遅延

        // 2本指パン・ピンチ用の状態もリセット
        this.touchState.lastPinchCenterX = undefined;
        this.touchState.lastPinchCenterY = undefined;
    }
    
    /**
     * タッチキャンセルイベントハンドラ
     * @private
     */
    _handleTouchCancel(e) {
        // タッチ終了と同様に状態をリセット
        this.touchState.dragging = false;
        this.touchState.isPinching = false;
        
        if (this.options.events.onDragEnd) {
            this.options.events.onDragEnd(e, this);
        }
    }
    
    /**
     * ダブルタップ処理
     * @private
     */
    _handleDoubleTap(touch) {
        // ズームが無効になっている場合は何もしない
        if (!this.interactionState.zoomEnabled) return;
        
        // ダブルタップしたポイントを中心にズームイン
        const svgRect = this.svg.getBoundingClientRect();
        const touchX = touch.clientX - svgRect.left;
        const touchY = touch.clientY - svgRect.top;
        
        // 現在の表示領域を取得
        const currentDomain = this.getDomain();
        
        // タッチポイントのドメイン座標を計算
        const touchDomain = this.screenToDomain(touchX, touchY);
        
        // 拡大率を設定（70%にズームイン）
        const zoomFactor = 0.7;
        
        // 新しいドメイン範囲を計算（タッチ点を基準に）
        const newDomainWidth = (currentDomain.xMax - currentDomain.xMin) * zoomFactor;
        const newDomainHeight = (currentDomain.yMax - currentDomain.yMin) * zoomFactor;
        
        // タッチ点を基準に新しいドメインを設定
        const newDomain = {
            xMin: touchDomain.x - (touchX / this.svg.clientWidth) * newDomainWidth,
            xMax: touchDomain.x + (1 - touchX / this.svg.clientWidth) * newDomainWidth,
            yMin: touchDomain.y - (1 - touchY / this.svg.clientHeight) * newDomainHeight,
            yMax: touchDomain.y + (touchY / this.svg.clientHeight) * newDomainHeight
        };
        
        // ドメインの制限をチェック
        if (this._checkDomainLimits(newDomain)) {
            // ドメインを更新（アニメーション付き）
            this.setDomain(newDomain, true);
        }
    }
    
    /**
     * マウスダウンイベントハンドラ
     * @private
     */
    _handleMouseDown(e) {
        // タッチイベント後のマウスイベント抑制
        if (this.touchState.preventMouseEvents) return;
        
        // キャンバス操作が無効になっている場合は何もしない
        if (!this.interactionState.canvasEnabled) return;
        
        this.mouseState.dragging = true;
        this.mouseState.lastX = e.clientX;
        this.mouseState.lastY = e.clientY;
        
        if (this.options.events.onDragStart) {
            this.options.events.onDragStart(e, this);
        }
    }
    
    /**
     * マウス移動イベントハンドラ
     * @private
     */
    _handleMouseMove(e) {
        // タッチイベント後のマウスイベント抑制
        if (this.touchState.preventMouseEvents) return;

        // キャンバス操作が無効になっている場合は何もしない
        if (!this.interactionState.canvasEnabled && this.mouseState.dragging) {
            this.mouseState.dragging = false;
            return;
        }
        
        if (this.mouseState.dragging) {
            const dx = e.clientX - this.mouseState.lastX;
            const dy = e.clientY - this.mouseState.lastY;
            
            // ドメインの移動量を計算
            const width = this.domainState.xMax - this.domainState.xMin;
            const height = this.domainState.yMax - this.domainState.yMin;
            const domainDx = (dx / this.svg.clientWidth) * width;
            const domainDy = (dy / this.svg.clientHeight) * height;
            
            // ドメインの更新（逆方向にスクロール）
            this.domainState.xMin -= domainDx;
            this.domainState.xMax -= domainDx;
            this.domainState.yMin += domainDy;
            this.domainState.yMax += domainDy;
            
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;
            
            // グラフグループの変換を更新
            if (this.graphGroup) {
                this._updateGraphGroupTransform();
            }
            
            // 再描画 (曲線以外の要素)
            this.draw();
            
            if (this.options.events.onDrag) {
                this.options.events.onDrag(e, this);
            }
        }
    }
    
    /**
     * マウスアップイベントハンドラ
     * @private
     */
    _handleMouseUp(e) {
        if (this.mouseState.dragging) {
            this.mouseState.dragging = false;
            
            if (this.options.events.onDragEnd) {
                this.options.events.onDragEnd(e, this);
            }
        }
    }
    
    /**
     * マウスリーブイベントハンドラ
     * @private
     */
    _handleMouseLeave(e) {
        if (this.mouseState.dragging) {
            this.mouseState.dragging = false;
            
            if (this.options.events.onDragEnd) {
                this.options.events.onDragEnd(e, this);
            }
        }
    }
    
    /**
     * リサイズイベントハンドラ
     * @private
     */
    _handleResize() {
        // リサイズ前のドメイン状態を保存
        this.previousDomainState = {...this.domainState};
        
        this.updateSize();
        this._adjustDomainForAspectRatio();
        this.draw();
        
        if (this.options.events.onResize) {
            this.options.events.onResize(this);
        }
    }

    /**
     * ダブルクリックイベントハンドラ
     * @private
     */
    _handleDoubleClick(e) {
        // ズームが無効になっている場合は何もしない
        if (!this.interactionState.zoomEnabled) return;
        
        e.preventDefault();
        this.zoomIn();
    }
    
    /**
     * SVGサイズの更新
     */
    updateSize() {
        // SVGコンテナのサイズを取得
        const container = this.svg.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // SVGのサイズを設定
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);
        this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    
    /**
     * ウィンドウサイズ変更時にアスペクト比を維持しながらドメインを調整
     * @private
     */
    _adjustDomainForAspectRatio() {
        const width = this.svg.clientWidth;
        const height = this.svg.clientHeight;
        
        if (width <= 0 || height <= 0) return;
        
        // x軸のドメインを固定
        const xDomain = this.previousDomainState.xMax - this.previousDomainState.xMin;
        
        // SVGのアスペクト比に基づいてy軸のドメイン幅を計算
        const yDomain = xDomain * (height / width);
        
        // 元のy軸の中心点を取得
        const previousYCenter = (this.previousDomainState.yMax + this.previousDomainState.yMin) / 2;
        
        // 新しいy軸のドメインを設定（中心点を維持）
        this.domainState.yMin = previousYCenter - yDomain / 2;
        this.domainState.yMax = previousYCenter + yDomain / 2;
    }
    
    /**
     * ズームアニメーションを開始
     * @private
     */
    _startZoomAnimation(startDomain, targetDomain) {
        // ドメイン値の検証
        let validTarget = true;
        
        // ドメインの各値を検証
        for (const key in targetDomain) {
            if (!isValidNumber(targetDomain[key])) {
                this._logError(`Invalid targetDomain.${key}`, targetDomain);
                validTarget = false;
                break;
            }
        }
        
        // ドメイン幅・高さが正の値であることを確認
        if (targetDomain.xMax <= targetDomain.xMin || targetDomain.yMax <= targetDomain.yMin) {
            this._logError("Target domain has zero or negative size", targetDomain);
            validTarget = false;
        }
        
        // 無効なターゲットドメインの場合は、アニメーションを停止
        if (!validTarget) {
            this._log("Zoom animation aborted due to invalid domain");
            return;
        }
        
        this._log("Starting zoom animation", {
            from: {...startDomain},
            to: {...targetDomain}
        });
        
        this.zoomAnimation.isActive = true;
        this.zoomAnimation.startTime = performance.now();
        this.zoomAnimation.startDomain = startDomain;
        this.zoomAnimation.targetDomain = targetDomain;
        
        if (this.options.events.onZoom) {
            this.options.events.onZoom(startDomain, targetDomain, this);
        }
    }
    
    /**
     * アニメーションループのセットアップ
     * @private
     */
    _setupAnimationLoop() {
        const animate = () => {
            if (this.zoomAnimation.isActive) {
                const currentTime = performance.now();
                const elapsed = currentTime - this.zoomAnimation.startTime;
                const progress = Math.min(elapsed / this.zoomAnimation.duration, 1);
                
                // イージング関数を適用
                const eased = easeOutCubic(progress);
                
                // 現在のドメインを補間
                this.domainState.xMin = this.zoomAnimation.startDomain.xMin + 
                    (this.zoomAnimation.targetDomain.xMin - this.zoomAnimation.startDomain.xMin) * eased;
                this.domainState.xMax = this.zoomAnimation.startDomain.xMax + 
                    (this.zoomAnimation.targetDomain.xMax - this.zoomAnimation.startDomain.xMax) * eased;
                this.domainState.yMin = this.zoomAnimation.startDomain.yMin + 
                    (this.zoomAnimation.targetDomain.yMin - this.zoomAnimation.startDomain.yMin) * eased;
                this.domainState.yMax = this.zoomAnimation.startDomain.yMax + 
                    (this.zoomAnimation.targetDomain.yMax - this.zoomAnimation.startDomain.yMax) * eased;
                
                // グラフグループの変換を更新
                if (this.graphGroup) {
                    this._updateGraphGroupTransform();
                }
                
                // 再描画 (曲線以外の要素)
                this._clearSvg();
                const mainGroup = this._createSVGElement('g', { 'class': 'graph-elements' });
                this.svg.appendChild(mainGroup);
                
                if (this.options.draw.microGrid) this._drawMicroGrid(mainGroup);
                if (this.options.draw.subGrid) this._drawSubGrid(mainGroup);
                if (this.options.draw.axes) this._drawAxes(mainGroup);
                if (this.options.draw.axisTicks) this._drawAxisTicks(mainGroup);
                if (this.options.draw.axisLabels) this._drawAxisLabels(mainGroup);
                
                // 曲線グループを再追加
                if (this.graphGroup) {
                    this.svg.appendChild(this.graphGroup);
                }
                
                // アニメーション終了チェック
                if (progress >= 1) {
                    this.zoomAnimation.isActive = false;
                    
                    if (this.options.events.onZoomEnd) {
                        this.options.events.onZoomEnd(this.domainState, this);
                    }
                }
            }
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * SVGのクリア
     * @private
     */
    _clearSvg() {
        // graph-curves グループは維持しつつ、他の要素を削除
        const curves = this.svg.querySelector('.graph-curves');
        this.svg.innerHTML = '';
        if (curves) {
            this.svg.appendChild(curves);
        }
    }
    
    /**
     * 画面座標からドメイン座標への変換
     * @private
     */
    _screenToDomain(screenX, screenY) {
        const width = this.svg.clientWidth;
        const height = this.svg.clientHeight;
        
        if (width <= 0 || height <= 0) {
            return { x: 0, y: 0 };
        }
        
        const domainWidth = this.domainState.xMax - this.domainState.xMin;
        const domainHeight = this.domainState.yMax - this.domainState.yMin;
        
        const x = this.domainState.xMin + (screenX / width) * domainWidth;
        const y = this.domainState.yMax - (screenY / height) * domainHeight;
        
        return { x, y };
    }
    
    /**
     * ドメイン座標から画面座標への変換
     * @private
     */
    _domainToScreen(x, y) {
        const width = this.svg.clientWidth;
        const height = this.svg.clientHeight;
        
        if (width <= 0 || height <= 0) {
            return { x: 0, y: 0 };
        }
        
        const domainWidth = this.domainState.xMax - this.domainState.xMin;
        const domainHeight = this.domainState.yMax - this.domainState.yMin;
        
        if (domainWidth <= 0 || domainHeight <= 0) {
            return { x: 0, y: 0 };
        }
        
        const screenX = ((x - this.domainState.xMin) / domainWidth) * width;
        const screenY = height - ((y - this.domainState.yMin) / domainHeight) * height;
        
        return { x: screenX, y: screenY };
    }
    
    /**
     * SVG要素の作成
     * @private
     */
    _createSVGElement(type, attributes = {}) {
        try {
            const element = document.createElementNS(this.svgNS, type);
            
            for (const [key, value] of Object.entries(attributes)) {
                if (typeof value === 'number' && !isValidNumber(value)) {
                    this._logError(`Invalid ${key} attribute for ${type}`, { key, value });
                    element.setAttribute(key, '0');
                } else {
                    element.setAttribute(key, value);
                }
            }
            
            // テキスト選択を防止するため、pointer-eventsを設定
            if (type === 'text') {
                element.style.pointerEvents = 'none';
            }
            
            return element;
        } catch (error) {
            this._logError(`Error creating SVG ${type} element`, error);
            return null;
        }
    }
    
    /**
     * デバッグログの出力
     * @private
     */
    _log(message, data) {
        if (this.options.debug.enabled && this.options.debug.level <= 1) {
            console.log(`[GraphCalculator] ${message}`, data);
        }
    }
    
    /**
     * エラーログの出力
     * @private
     */
    _logError(message, data) {
        if (this.options.debug.enabled && this.options.debug.level <= 2) {
            console.error(`[GraphCalculator] ERROR: ${message}`, data);
        }
    }
    
    /**
     * グラフの描画
     */
    draw() {
        this._clearSvg();

        // グラフ要素用のメイングループを作成
        const mainGroup = this._createSVGElement('g', {
            'class': 'graph-elements'
        });
        this.svg.appendChild(mainGroup);

        // グリッドとラベルの描画
        if (this.options.draw.microGrid) this._drawMicroGrid(mainGroup);
        if (this.options.draw.subGrid) this._drawSubGrid(mainGroup);
        if (this.options.draw.axes) this._drawAxes(mainGroup);
        if (this.options.draw.axisTicks) this._drawAxisTicks(mainGroup);
        if (this.options.draw.axisLabels) this._drawAxisLabels(mainGroup);
        
        // 曲線グループを描画 (transformを用いて)
        this._drawCurves();
        
        if (this.options.events.onDraw) {
            this.options.events.onDraw(this);
        }
    }
    
    /**
     * 曲線の描画
     * @private
     */
    _drawCurves() {
        // グラフグループが既に存在する場合、transformを更新
        if (this.graphGroup) {
            this._updateGraphGroupTransform();
            this.svg.appendChild(this.graphGroup);
        } 
        // 曲線はあるがグループがない場合は作成
        else if (this.curves.length > 0) {
            this.graphGroup = this._createSVGElement('g', {
                'class': 'graph-curves'
            });
            this._updateGraphGroupTransform();
            this.svg.appendChild(this.graphGroup);
        }
    }
    
    /**
     * 点の配列からスムージングされたSVGパスデータを作成
     * @param {Array} points - 点の配列 [[x1, y1], [x2, y2], ...]
     * @returns {string} SVGパスデータ文字列
     */
    createSmoothPathFromPoints(points) {
        if (!Array.isArray(points) || points.length < 2) return '';
        
        // 点の配列を直接使用（ドメイン座標のまま）
        
        // 基本的なパス文字列の作成（最初の点へのMove）
        let d = `M ${points[0][0]} ${points[0][1]}`;
        
        // 点が多い場合はスムージングを適用
        if (points.length > 2) {
            // 各点間を滑らかに繋ぐベジェ曲線を追加
            for (let i = 1; i < points.length - 1; i++) {
                const p0 = points[i-1];
                const p1 = points[i];
                const p2 = points[i+1];
                
                // 制御点の計算
                const x1 = p1[0];
                const y1 = p1[1];
                const x2 = (p1[0] + p2[0]) / 2;
                const y2 = (p1[1] + p2[1]) / 2;
                
                // 二次ベジェ曲線の追加
                d += ` Q ${x1},${y1} ${x2},${y2}`;
            }
            
            // 最後の点への直線を追加
            const lastPoint = points[points.length - 1];
            d += ` L ${lastPoint[0]} ${lastPoint[1]}`;
        } else {
            // 点が少ない場合は直線を引く
            for (let i = 1; i < points.length; i++) {
                d += ` L ${points[i][0]} ${points[i][1]}`;
            }
        }
        
        return d;
    }
    
    /**
     * グリッド描画用のステップサイズを計算
     * @private
     */
    _calculateGridStep() {
        const domainWidth = this.domainState.xMax - this.domainState.xMin;
        const domainHeight = this.domainState.yMax - this.domainState.yMin;
        
        // 最適なグリッド間隔を計算
        const xGridSpacing = calculateGridSpacing(domainWidth);
        const yGridSpacing = calculateGridSpacing(domainHeight);
        
        // メモリ間隔を主グリッド間隔と同じに設定
        const xMainSpacing = xGridSpacing;
        const yMainSpacing = xGridSpacing; // X軸の間隔に合わせる
        
        // マイクログリッドは主グリッドの1/5
        const xMicroGridSpacing = xMainSpacing / 5;
        const yMicroGridSpacing = xMicroGridSpacing; // X軸の間隔に合わせる
        
        return {
            x: { main: xMainSpacing, micro: xMicroGridSpacing },
            y: { main: yMainSpacing, micro: yMicroGridSpacing }
        };
    }
    
    /**
     * 微細目盛りの描画
     * @private
     * @param {SVGElement} group - 描画先のグループ要素
     */
    _drawMicroGrid(group) {
        try {
            const width = this.svg.clientWidth;
            const height = this.svg.clientHeight;
            const gridStep = this._calculateGridStep();
            const xSpacing = gridStep.x.micro;
            const ySpacing = gridStep.y.micro;
            
            // 垂直微細目盛り線の描画
            const xStart = Math.floor(this.domainState.xMin / xSpacing) * xSpacing;
            for (let x = xStart; x <= this.domainState.xMax; x += xSpacing) {
                // 主目盛りと重複しないように
                if (Math.abs(x % gridStep.x.main) > 1e-10) {
                    const screenX = this._domainToScreen(x, 0).x;
                    
                    if (!isValidNumber(screenX)) continue;
                    
                    const line = this._createSVGElement('line', {
                        'x1': screenX,
                        'y1': 0,
                        'x2': screenX,
                        'y2': height,
                        'class': 'micro-grid-line'
                    });
                    
                    if (line) group.appendChild(line);
                }
            }
            
            // 水平微細目盛り線の描画
            const yStart = Math.floor(this.domainState.yMin / ySpacing) * ySpacing;
            for (let y = yStart; y <= this.domainState.yMax; y += ySpacing) {
                // 主目盛りと重複しないように
                if (Math.abs(y % gridStep.y.main) > 1e-10) {
                    const screenY = this._domainToScreen(0, y).y;
                    
                    if (!isValidNumber(screenY)) continue;
                    
                    const line = this._createSVGElement('line', {
                        'x1': 0,
                        'y1': screenY,
                        'x2': width,
                        'y2': screenY,
                        'class': 'micro-grid-line'
                    });
                    
                    if (line) group.appendChild(line);
                }
            }
        } catch (error) {
            this._logError("Error in drawMicroGrid", error);
        }
    }
    
    /**
     * 副目盛りグリッド線の描画
     * @private
     * @param {SVGElement} group - 描画先のグループ要素
     */
    _drawSubGrid(group) {
        try {
            const width = this.svg.clientWidth;
            const height = this.svg.clientHeight;
            const gridStep = this._calculateGridStep();
            const xSpacing = gridStep.x.main;
            const ySpacing = gridStep.y.main;
            
            // 垂直副目盛りグリッド線の描画
            const xStart = Math.floor(this.domainState.xMin / xSpacing) * xSpacing;
            for (let x = xStart; x <= this.domainState.xMax; x += xSpacing) {
                // x軸と重複しないように（0でない場合のみ描画）
                if (Math.abs(x) > 1e-10) {
                    const screenX = this._domainToScreen(x, 0).x;
                    
                    if (!isValidNumber(screenX)) continue;
                    
                    const line = this._createSVGElement('line', {
                        'x1': screenX,
                        'y1': 0,
                        'x2': screenX,
                        'y2': height,
                        'class': 'sub-grid-line'
                    });
                    
                    if (line) group.appendChild(line);
                }
            }
            
            // 水平副目盛りグリッド線の描画
            const yStart = Math.floor(this.domainState.yMin / ySpacing) * ySpacing;
            for (let y = yStart; y <= this.domainState.yMax; y += ySpacing) {
                // y軸と重複しないように（0でない場合のみ描画）
                if (Math.abs(y) > 1e-10) {
                    const screenY = this._domainToScreen(0, y).y;
                    
                    if (!isValidNumber(screenY)) continue;
                    
                    const line = this._createSVGElement('line', {
                        'x1': 0,
                        'y1': screenY,
                        'x2': width,
                        'y2': screenY,
                        'class': 'sub-grid-line'
                    });
                    
                    if (line) group.appendChild(line);
                }
            }
        } catch (error) {
            this._logError("Error in drawSubGrid", error);
        }
    }
    
    /**
     * x軸とy軸の描画
     * @private
     * @param {SVGElement} group - 描画先のグループ要素
     */
    _drawAxes(group) {
        try {
            const width = this.svg.clientWidth;
            const height = this.svg.clientHeight;

            // Origin point in screen coordinates
            const originPoint = this._domainToScreen(0, 0);

            // Draw x-axis
            if (this.options.draw.xAxis) {
                const originY = Math.min(Math.max(originPoint.y, 0), height);
                const xAxis = this._createSVGElement('line', {
                    'x1': 0,
                    'y1': originY,
                    'x2': width - 20, // Leave space for larger arrow
                    'y2': originY,
                    'class': 'grid-line horizontal'
                });
                if (xAxis) group.appendChild(xAxis);

                // Add angled arrow for x-axis
                const xArrow = this._createSVGElement('polygon', {
                    'points': `${width - 20},${originY - 7} ${width - 20},${originY + 7} ${width},${originY}`,
                    'class': 'axis-arrow'
                });
                if (xArrow) group.appendChild(xArrow);

                // Add larger LaTeX-style 'x' label
                const xLabel = this._createSVGElement('text', {
                    'x': width - 20,
                    'y': originY - 20,
                    'class': 'axis-label italic axis-xy-label'
                });
                if (xLabel) {
                    xLabel.textContent = 'x';
                    group.appendChild(xLabel);
                }
            }

            // Draw y-axis
            if (this.options.draw.yAxis) {
                const originX = Math.min(Math.max(originPoint.x, 0), width);
                const yAxis = this._createSVGElement('line', {
                    'x1': originX,
                    'y1': height,
                    'x2': originX,
                    'y2': 20, // Leave space for larger arrow
                    'class': 'grid-line vertical'
                });
                if (yAxis) group.appendChild(yAxis);

                // Add angled arrow for y-axis
                const yArrow = this._createSVGElement('polygon', {
                    'points': `${originX - 7},20 ${originX + 7},20 ${originX},0`,
                    'class': 'axis-arrow'
                });
                if (yArrow) group.appendChild(yArrow);

                // Add larger LaTeX-style 'y' label
                const yLabel = this._createSVGElement('text', {
                    'x': originX + 20,
                    'y': 30,
                    'class': 'axis-label italic axis-xy-label'
                });
                if (yLabel) {
                    yLabel.textContent = 'y';
                    group.appendChild(yLabel);
                }
            }

            // Draw origin label if within bounds
            if (this.options.draw.xAxis && this.options.draw.yAxis &&
                originPoint.x >= 0 && originPoint.x <= width &&
                originPoint.y >= 0 && originPoint.y <= height) {
                const originLabel = this._createSVGElement('text', {
                    'x': originPoint.x - 10,
                    'y': originPoint.y + 15,
                    'class': 'axis-label'
                });
                if (originLabel) {
                    originLabel.textContent = '0';
                    group.appendChild(originLabel);
                }
            }
        } catch (error) {
            this._logError("Error in drawAxes", error);
        }
    }
    
    /**
     * 軸のメモリを描画
     * @private
     * @param {SVGElement} group - 描画先のグループ要素
     */
    _drawAxisTicks(group) {
        try {
            const width = this.svg.clientWidth;
            const height = this.svg.clientHeight;
            
            // 原点の座標を取得
            const originPoint = this._domainToScreen(0, 0);
            
            // x軸のメモリを描画
            const xOriginY = originPoint.y < 0 ? 0 : (originPoint.y > height ? height : originPoint.y);
            
            // y軸のメモリを描画
            const yOriginX = originPoint.x < 0 ? 0 : (originPoint.x > width ? width : originPoint.x);
            
            // グリッド間隔を計算
            const gridStep = this._calculateGridStep();
            const xGridSpacing = gridStep.x.main;
            const yGridSpacing = gridStep.y.main;
            
            // x軸のメモリを描画
            const xStart = Math.floor(this.domainState.xMin / xGridSpacing) * xGridSpacing;
            for (let x = xStart; x <= this.domainState.xMax; x += xGridSpacing) {
                if (Math.abs(x) < 1e-10) continue; // 原点はスキップ
                
                const screenX = this._domainToScreen(x, 0).x;
                
                if (!isValidNumber(screenX)) continue;
                
                // 目盛り線（短いライン）
                const tick = this._createSVGElement('line', {
                    'x1': screenX,
                    'y1': xOriginY - 6,
                    'x2': screenX,
                    'y2': xOriginY + 6,
                    'class': 'axis-tick'
                });
                
                if (tick) group.appendChild(tick);
            }
            
            // y軸のメモリを描画
            const yStart = Math.floor(this.domainState.yMin / yGridSpacing) * yGridSpacing;
            for (let y = yStart; y <= this.domainState.yMax; y += yGridSpacing) {
                if (Math.abs(y) < 1e-10) continue; // 原点はスキップ
                
                const screenY = this._domainToScreen(0, y).y;
                
                if (!isValidNumber(screenY)) continue;
                
                // 目盛り線（短いライン）
                const tick = this._createSVGElement('line', {
                    'x1': yOriginX - 6,
                    'y1': screenY,
                    'x2': yOriginX + 6,
                    'y2': screenY,
                    'class': 'axis-tick'
                });
                
                if (tick) group.appendChild(tick);
            }
        } catch (error) {
            this._logError("Error in drawAxisTicks", error);
        }
    }
    
    /**
     * 軸のラベルを描画
     * @private
     * @param {SVGElement} group - 描画先のグループ要素
     */
    _drawAxisLabels(group) {
        try {
            const width = this.svg.clientWidth;
            const height = this.svg.clientHeight;
            
            // 原点の座標を取得
            const originPoint = this._domainToScreen(0, 0);
            
            // グリッド間隔を計算
            const gridStep = this._calculateGridStep();
            const xGridSpacing = gridStep.x.main;
            const yGridSpacing = gridStep.y.main;
            
            // x軸のラベルを描画
            const xStart = Math.floor(this.domainState.xMin / xGridSpacing) * xGridSpacing;
            for (let x = xStart; x <= this.domainState.xMax; x += xGridSpacing) {
                if (Math.abs(x) < 1e-10) continue; // 原点はスキップ
                
                const screenX = this._domainToScreen(x, 0).x;
                
                if (!isValidNumber(screenX)) continue;
                
                // 原点のY座標を取得（画面内にない場合は近い方の端）
                let labelY;
                const originY = originPoint.y;
                
                if (originY < 0) {
                    labelY = 20; // 上端近く
                } else if (originY > height) {
                    labelY = height - 10; // 下端近く
                } else {
                    labelY = originY + 20;
                }
                
                // ラベル
                const label = this._createSVGElement('text', {
                    'x': screenX,
                    'y': labelY,
                    'class': 'axis-label'
                });
                
                if (label) {
                    label.textContent = formatNumber(x);
                    group.appendChild(label);
                }
            }
            
            // y軸のラベルを描画
            const yStart = Math.floor(this.domainState.yMin / yGridSpacing) * yGridSpacing;
            for (let y = yStart; y <= this.domainState.yMax; y += yGridSpacing) {
                if (Math.abs(y) < 1e-10) continue; // 原点はスキップ
                
                const screenY = this._domainToScreen(0, y).y;
                
                if (!isValidNumber(screenY)) continue;
                
                // 原点のX座標を取得（画面内にない場合は近い方の端）
                let labelX;
                const originX = originPoint.x;
                
                if (originX < 0) {
                    labelX = 30; // 左端近く
                } else if (originX > width) {
                    labelX = width - 30; // 右端近く
                } else {
                    labelX = originX - 25;
                }
                
                // ラベル
                const label = this._createSVGElement('text', {
                    'x': labelX,
                    'y': screenY,
                    'class': 'axis-label'
                });
                
                if (label) {
                    label.textContent = formatNumber(y);
                    group.appendChild(label);
                }
            }
            
            // 原点ラベル
            if (originPoint.x >= 0 && originPoint.x <= width && 
                originPoint.y >= 0 && originPoint.y <= height) {
                const originLabel = this._createSVGElement('text', {
                    'x': originPoint.x - 10,
                    'y': originPoint.y + 15,
                    'class': 'axis-label'
                });
                
                if (originLabel) {
                    originLabel.textContent = '0';
                    group.appendChild(originLabel);
                }
            }
        } catch (error) {
            this._logError("Error in drawAxisLabels", error);
        }
    }
    
    /**
     * ドメインの設定
     * @param {Object} domain - ドメイン { xMin, xMax, yMin, yMax } 
     * @param {boolean} animate - アニメーションを使用するかどうか
     */
    setDomain(domain, animate = true) {
        if (typeof domain !== 'object') {
            this._logError("Invalid domain object", domain);
            return;
        }
        
        const currentDomain = { ...this.domainState };
        const targetDomain = { ...this.domainState };
        
        if (isValidNumber(domain.xMin)) targetDomain.xMin = domain.xMin;
        if (isValidNumber(domain.xMax)) targetDomain.xMax = domain.xMax;
        if (isValidNumber(domain.yMin)) targetDomain.yMin = domain.yMin;
        if (isValidNumber(domain.yMax)) targetDomain.yMax = domain.yMax;
        
        if (targetDomain.xMin >= targetDomain.xMax || targetDomain.yMin >= targetDomain.yMax) {
            this._logError("Invalid target domain", targetDomain);
            return;
        }
        
        if (animate) {
            this._startZoomAnimation(currentDomain, targetDomain);
        } else {
            this.domainState = targetDomain;
            this.draw();
        }
    }
    
    /**
     * ドメインを取得
     * @returns {Object} ドメイン { xMin, xMax, yMin, yMax }
     */
    getDomain() {
        return { ...this.domainState };
    }
    
    /**
     * オプションの更新
     * @param {Object} newOptions - 新しいオプション
     */
    updateOptions(newOptions) {
        this.options = this._mergeOptions(this.options, newOptions);
        this.draw();
    }
    
    /**
     * イベントリスナーの追加
     * @param {string} eventName - イベント名
     * @param {Function} callback - コールバック関数
     */
    addEventListener(eventName, callback) {
        if (typeof callback !== 'function') {
            this._logError("Invalid callback function", callback);
            return;
        }
        
        if (!this.options.events[eventName]) {
            this._logError("Unknown event name", eventName);
            return;
        }
        
        this.options.events[eventName] = callback;
    }
    
    /**
     * 画面座標をドメイン座標に変換
     * @param {number} screenX - 画面X座標
     * @param {number} screenY - 画面Y座標
     * @returns {Object} ドメイン座標 { x, y }
     */
    screenToDomain(screenX, screenY) {
        return this._screenToDomain(screenX, screenY);
    }
    
    /**
     * ドメイン座標を画面座標に変換
     * @param {number} x - ドメインX座標
     * @param {number} y - ドメインY座標
     * @returns {Object}  画面座標 { x, y }
     */
    domainToScreen(x, y) {
        return this._domainToScreen(x, y);
    }
    
    /**
     * SVG要素を取得
     * @returns {SVGElement} SVG要素
     */
    getSvg() {
        return this.svg;
    }
    
    /**
     * 破棄処理
     */
    destroy() {
        // イベントリスナーの削除
        this.svg.removeEventListener('wheel', this._handleWheel.bind(this));
        this.svg.removeEventListener('mousedown', this._handleMouseDown.bind(this));
        document.removeEventListener('mousemove', this._handleMouseMove.bind(this));
        document.removeEventListener('mouseup', this._handleMouseUp.bind(this));
        document.removeEventListener('mouseleave', this._handleMouseLeave.bind(this));
        
        if (this.options.responsive) {
            window.removeEventListener('resize', this._handleResize.bind(this));
        }
        
        // SVGの削除（ただし外部から指定された場合は削除しない）
        if (this.container !== this.svg) {
            this.container.removeChild(this.svg);
        }
        
        this._log("GraphCalculator destroyed");
    }
    
    /**
     * ホームポジションに戻る
     */
    resetToHome() {

        // initialDomainが未定義なので、オプションから取得したデフォルトドメインを使用
        this.setDomain(this.options.domain, true);
    }
    
    /**
     * 一段階ズームアップ
     */
    zoomIn() {
        if (!this.svg) return;

        // 現在の表示領域を取得
        const currentDomain = this.getDomain();
        
        // 画面の中央点のドメイン座標を計算
        const width = this.svg.clientWidth;
        const height = this.svg.clientHeight;
        const centerPoint = this.screenToDomain(width / 2, height / 2);
        
        // 拡大率を設定（70%にズームイン）
        const zoomFactor = 0.7;
        
        // 新しいドメイン範囲を計算（中央点を基準に）
        const newDomainWidth = (currentDomain.xMax - currentDomain.xMin) * zoomFactor;
        const newDomainHeight = (currentDomain.yMax - currentDomain.yMin) * zoomFactor;
        
        // 中央点を基準に新しいドメインを設定
        const newDomain = {
          xMin: centerPoint.x - newDomainWidth / 2,
          xMax: centerPoint.x + newDomainWidth / 2,
          yMin: centerPoint.y - newDomainHeight / 2,
          yMax: centerPoint.y + newDomainHeight / 2
        };
        
        // ドメインの制限をチェック
        if (!this._checkDomainLimits(newDomain)) {
            return;
        }
        
        // ドメインを更新
        this.setDomain(newDomain, true);
    }

    /**
     * 一段階ズームアウト
     */
    zoomOut() {
        if (!this.svg) return;

        // 現在の表示領域を取得
        const currentDomain = this.getDomain();
        
        // 画面の中央点のドメイン座標を計算
        const width = this.svg.clientWidth;
        const height = this.svg.clientHeight;
        const centerPoint = this.screenToDomain(width / 2, height / 2);
        
        // 拡大率を設定（140%にズームアウト）
        const zoomFactor = 1.4;
        
        // 新しいドメイン範囲を計算（中央点を基準に）
        const newDomainWidth = (currentDomain.xMax - currentDomain.xMin) * zoomFactor;
        const newDomainHeight = (currentDomain.yMax - currentDomain.yMin) * zoomFactor;
        
        // 中央点を基準に新しいドメインを設定
        const newDomain = {
          xMin: centerPoint.x - newDomainWidth / 2,
          xMax: centerPoint.x + newDomainWidth / 2,
          yMin: centerPoint.y - newDomainHeight / 2,
          yMax: centerPoint.y + newDomainHeight / 2
        };
        
        // ドメインの制限をチェック
        if (!this._checkDomainLimits(newDomain)) {
            return;
        }
        
        // ドメインを更新
        this.setDomain(newDomain, true);
    }

    /**
     * X軸の表示・非表示を設定する
     * @param {boolean} visible - 表示するかどうか
     */
    setXAxisVisibility(visible) {
        this.options.draw.xAxis = visible;
        this.draw();
    }

    /**
     * Y軸の表示・非表示を設定する
     * @param {boolean} visible - 表示するかどうか
     */
    setYAxisVisibility(visible) {
        this.options.draw.yAxis = visible;
        this.draw();
    }

    /**
     * 目盛りラベルの表示・非表示を設定する
     * @param {boolean} visible - 表示するかどうか
     */
    setTickLabelsVisibility(visible) {
        this.options.draw.axisLabels = visible;
        this.options.draw.axisTicks = visible; // Tickの表示非表示も設定
        this.draw();
    }

    /**
     * 主グリッドの表示・非表示を設定する
     * @param {boolean} visible - 表示するかどうか
     */
    setMainGridVisibility(visible) {
        this.options.draw.mainGrid = visible;
        this.draw();
    }

    /**
     * 副グリッドの表示・非表示を設定する
     * @param {boolean} visible - 表示するかどうか
     */
    setSubGridVisibility(visible) {
        this.options.draw.subGrid = visible;
        this.draw();
    }

    /**
     * マイクログリッドの表示・非表示を設定する
     * @param {boolean} visible - 表示するかどうか
     */
    setMicroGridVisibility(visible) {
        this.options.draw.microGrid = visible;
        this.draw();
    }
    
    /**
     * ズームレベルに応じた線の太さを計算
     * @private
     * @param {number} originalWidth - 元の線の太さ
     * @returns {number} スケールされた線の太さ
     */
    _getScaledStrokeWidth(originalWidth) {
        const domainWidth = this.domainState.xMax - this.domainState.xMin;
        const svgWidth = this.svg.clientWidth;
        
        // 単位ドメイン幅あたりのピクセル数 (拡大率k)
        const pixelsPerDomainUnit = svgWidth / domainWidth;
        
        // 拡大すれば線は細く、縮小すれば線は太くなるよう逆数で調整
        return originalWidth / pixelsPerDomainUnit;
    }
    
    /**
     * 点線パターン（stroke-dasharray）をズームレベルに応じてスケーリング
     * @private
     * @param {string} dashArray - 元の点線パターン (例: '5 3 2 3')
     * @returns {string} スケールされた点線パターン
     */
    _getScaledDashArray(dashArray) {
        if (!dashArray || dashArray === 'none') return 'none';
        
        const domainWidth = this.domainState.xMax - this.domainState.xMin;
        const svgWidth = this.svg.clientWidth;
        
        if (svgWidth <= 0) return dashArray;
        
        // 単位ドメイン幅あたりのピクセル数（拡大率k）
        const pixelsPerDomainUnit = svgWidth / domainWidth;
        
        // パターンの各数値をスケーリング
        const parts = dashArray.split(/\s+/);
        const scaledParts = parts.map(part => {
            const value = parseFloat(part);
            if (isNaN(value)) return part;
            
            // 値を拡大率に応じてスケーリング（線の太さと同様に）
            return (value / pixelsPerDomainUnit).toString();
        });
        
        return scaledParts.join(' ');
    }
    
    /**
     * グラフグループのtransform属性を更新
     * @private
     */
    _updateGraphGroupTransform() {
        if (!this.graphGroup) return;
        
        const svgWidth = this.svg.clientWidth;
        const svgHeight = this.svg.clientHeight;
        
        if (svgWidth <= 0 || svgHeight <= 0) return;
        
        // ドメインサイズ
        const domainWidth = this.domainState.xMax - this.domainState.xMin;
        const domainHeight = this.domainState.yMax - this.domainState.yMin;
        
        // スケールファクター（ドメイン単位あたりのピクセル数）
        const scaleX = svgWidth / domainWidth;
        const scaleY = -svgHeight / domainHeight; // Y軸は上下反転
        
        // 原点位置の平行移動
        const translateX = -this.domainState.xMin * scaleX;
        const translateY = -this.domainState.yMax * scaleY;
        
        // transform属性を設定
        this.graphGroup.setAttribute('transform', 
            `translate(${translateX},${translateY}) scale(${scaleX},${scaleY})`);
        
        // すべての曲線の線の太さを更新
        this.curves.forEach(curve => {
            if (curve && curve.path) {
                // データ属性から元の線の太さを取得
                const originalWidth = parseFloat(curve.path.getAttribute('data-original-width'));
                if (!isNaN(originalWidth)) {
                    // 新しい太さを計算して設定
                    const newWidth = this._getScaledStrokeWidth(originalWidth);
                    curve.path.setAttribute('stroke-width', newWidth);
                    
                    // 点線パターンも更新
                    const originalDashArray = curve.path.getAttribute('data-original-dasharray');
                    if (originalDashArray && originalDashArray !== 'none') {
                        const scaledDashArray = this._getScaledDashArray(originalDashArray);
                        curve.path.setAttribute('stroke-dasharray', scaledDashArray);
                    }
                    
                    // ヒットエリアも更新
                    if (curve.hitArea) {
                        const hitAreaOriginalWidth = parseFloat(curve.hitArea.getAttribute('data-original-width'));
                        if (!isNaN(hitAreaOriginalWidth)) {
                            const newHitAreaWidth = this._getScaledStrokeWidth(hitAreaOriginalWidth);
                            curve.hitArea.setAttribute('stroke-width', newHitAreaWidth);
                        }
                    }
                    
                    // 関連する点のサイズも更新
                    if (curve.points && curve.points.length > 0) {
                        curve.points.forEach(point => {
                            if (point && point.shape) {
                                const originalSize = parseFloat(point.shape.getAttribute('data-original-size'));
                                if (!isNaN(originalSize)) {
                                    const newSize = this._getScaledPointSize(originalSize);
                                    this._updatePointSize(point.shape, point.shapeType, newSize);
                                }
                            }
                        });
                    }
                }
            }
        });
    }
    
    /**
     * ドメインが制限範囲内かチェックする
     * @private
     * @param {Object} domain - チェックするドメイン
     * @returns {boolean} ドメインが有効な範囲内の場合true
     */
    _checkDomainLimits(domain) {
        const width = domain.xMax - domain.xMin;
        const height = domain.yMax - domain.yMin;

        // 拡大制限: 10^-5
        if (width < 1e-4 || height < 1e-4) {
            return false;
        }

        // 縮小制限: 10^10
        if (width > 1e10 || height > 1e10) {
            return false;
        }

        return true;
    }

    /**
     * 点を追加
     * @param {string|number} curveId - 関連付ける曲線のID
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {Object} options - 点のオプション
     * @returns {Object|null} 追加された点オブジェクト、失敗した場合はnull
     */
    addPoint(curveId, x, y, options = {}) {
        try {
            const curve = this.getCurve(curveId);
            if (!curve) {
                this._logError(`Cannot add point: Curve with ID ${curveId} not found`);
                return null;
            }

            if (!this.pointCounter) this.pointCounter = 0;

            // 形状タイプの取得とジェネレータの取得
            const shapeType = options.shape || 'hollowCircle';
            const shapeGenerator = getShapeGenerator(shapeType);
            
            // 基本の形状情報とプロパティを取得
            const baseShape = shapeGenerator(options.size || 10);
            const baseProperties = baseShape.properties || {};

            // オプションのプロパティと基本プロパティをマージ
            const mergedProperties = {
                ...baseProperties,
                ...(options.properties || {}),
                fill: options.fill || baseProperties.fill,
                stroke: options.stroke || baseProperties.stroke,
                size: options.size || baseProperties.size || 10,
                strokeWidth: (options.properties && options.properties.strokeWidth) || baseProperties.strokeWidth || 1.5
            };

            const scaledSize = this._getScaledStrokeWidth(mergedProperties.size);
            const scaledStrokeWidth = this._getScaledStrokeWidth(mergedProperties.strokeWidth);

            const shapeInfo = shapeGenerator(scaledSize);

            // 点グループを作成
            const pointGroup = this._createSVGElement('g', {
                'class': 'point-group',
                'data-point-id': `point-${this.pointCounter++}`,
                'data-curve-id': curveId,
                'transform': `translate(${x}, ${y})`
            });

            // 形状要素を作成
            let shape;
            const baseAttributes = {
                'class': 'point-shape',
                'data-original-size': mergedProperties.size,
                'data-original-stroke-width': mergedProperties.strokeWidth
            };

            if (shapeType === 'hollowCircle') {
                shape = this._createSVGElement('circle', {
                    ...baseAttributes,
                    ...shapeInfo.attributes,
                    'fill': mergedProperties.fill || 'none',
                    'stroke': mergedProperties.stroke,
                    'stroke-width': scaledStrokeWidth
                });
            } else if (shapeInfo.element === 'g') {
                shape = this._createSVGElement('g', baseAttributes);
                shapeInfo.children.forEach(child => {
                    const childElement = this._createSVGElement(child.element, {
                        ...child.attributes,
                        'stroke': mergedProperties.stroke,
                        'stroke-width': scaledStrokeWidth
                    });
                    shape.appendChild(childElement);
                });
            } else {
                shape = this._createSVGElement(shapeInfo.element, {
                    ...baseAttributes,
                    ...shapeInfo.attributes,
                    'fill': mergedProperties.fill,
                    'stroke': mergedProperties.stroke,
                    'stroke-width': scaledStrokeWidth
                });
            }

            // その他のスタイルプロパティを適用
            Object.entries(mergedProperties).forEach(([key, value]) => {
                if (!['fill', 'stroke', 'stroke-width', 'size'].includes(key)) {
                    shape.setAttribute(key, value);
                }
            });

            pointGroup.appendChild(shape);
            curve.group.appendChild(pointGroup);

            const point = {
                id: pointGroup.getAttribute('data-point-id'),
                group: pointGroup,
                shape: shape,
                x: x,
                y: y,
                shapeType: shapeType,
                size: mergedProperties.size,
                color: mergedProperties.stroke,
                strokeWidth: mergedProperties.strokeWidth,
                properties: mergedProperties,
                curveId: curveId,
                
                update: () => {
                    const newScaledSize = this._getScaledStrokeWidth(point.size);
                    const newScaledStrokeWidth = this._getScaledStrokeWidth(point.strokeWidth);
                    this._updatePointSize(shape, shapeType, newScaledSize);
                    pointGroup.setAttribute('transform', `translate(${point.x}, ${point.y})`);
                }
            };

            if (!curve.points) curve.points = [];
            curve.points.push(point);

            return point;

        } catch (error) {
            this._logError('Error adding point', error);
            return null;
        }
    }

    /**
     * 点のサイズを形状に合わせて更新
     * @private
     * @param {SVGElement} shapeElement - 形状要素
     * @param {string} shapeType - 形状タイプ
     * @param {number} size - 新しいサイズ
     */
    _updatePointSize(shapeElement, shapeType, size) {
        if (!shapeElement) return;

        const originalStrokeWidth = parseFloat(shapeElement.getAttribute('data-original-stroke-width') || 0.5);
        const scaledStrokeWidth = this._getScaledStrokeWidth(originalStrokeWidth);

        switch (shapeType) {
            case 'circle':
            case 'hollowCircle':
                shapeElement.setAttribute('r', size / 2);
                shapeElement.setAttribute('stroke-width', scaledStrokeWidth);
                break;
            case 'square':
                shapeElement.setAttribute('x', -size / 2);
                shapeElement.setAttribute('y', -size / 2);
                shapeElement.setAttribute('width', size);
                shapeElement.setAttribute('height', size);
                shapeElement.setAttribute('stroke-width', scaledStrokeWidth);
                break;
            case 'triangle':
                shapeElement.setAttribute('points', 
                    `0,${size/2} ${-size/2},${-size/2} ${size/2},${-size/2}`);
                shapeElement.setAttribute('stroke-width', scaledStrokeWidth);
                break;
            case 'diamond':
                shapeElement.setAttribute('points', 
                    `0,${-size / 2} ${size / 2},0 0,${size / 2} ${-size / 2},0`);
                shapeElement.setAttribute('stroke-width', scaledStrokeWidth);
                break;
            case 'cross':
                const crossLength = size * 0.4;
                shapeElement.setAttribute('d', 
                    `M ${-crossLength},${-crossLength} L ${crossLength},${crossLength} ` +
                    `M ${crossLength},${-crossLength} L ${-crossLength},${crossLength}`);
                shapeElement.setAttribute('stroke-width', size * 0.2);
                shapeElement.setAttribute('fill', 'none');
                shapeElement.setAttribute('stroke-linecap', 'round');
                break;
            case 'plus':
                const plusLength = size * 0.4;
                shapeElement.setAttribute('d', 
                    `M ${-plusLength},0 L ${plusLength},0 ` +
                    `M 0,${-plusLength} L 0,${plusLength}`);
                shapeElement.setAttribute('stroke-width', size * 0.2);
                shapeElement.setAttribute('fill', 'none');
                shapeElement.setAttribute('stroke-linecap', 'round');
                break;
            default:
                break;
        }
    }

    /**
     * ズームレベルに応じた点のサイズを計算
     * @private
     * @param {number} originalSize - 元の点のサイズ
     * @returns {number} スケールされた点のサイズ
     */
    _getScaledPointSize(originalSize) {
        return this._getScaledStrokeWidth(originalSize);
    }

    /**
     * 点を取得
     * @param {string|number} pointId - 点のID
     * @returns {Object|null} 点オブジェクト、見つからない場合はnull
     */
    getPoint(pointId) {
        for (const curve of this.curves) {
            if (curve && curve.points) {
                const point = curve.points.find(p => p && p.id == pointId);
                if (point) return point;
            }
        }
        return null;
    }

    /**
     * 点を更新
     * @param {string|number} pointId - 点のID
     * @param {Object} options - 更新するオプション
     * @returns {boolean} 更新成功したかどうか
     */
    updatePoint(pointId, options = {}) {
        try {
            const point = this.getPoint(pointId);
            if (!point) {
                this._logError(`Point with id ${pointId} not found`);
                return false;
            }

            // X座標の更新
            if (options.x !== undefined && isValidNumber(options.x)) {
                point.x = options.x;
                point.group.setAttribute('transform', `translate(${point.x}, ${point.y})`);
            }

            // Y座標の更新
            if (options.y !== undefined && isValidNumber(options.y)) {
                point.y = options.y;
                point.group.setAttribute('transform', `translate(${point.x}, ${point.y})`);
            }

            // 色の更新
            if (options.color !== undefined) {
                point.color = options.color;
                if (point.shape) {
                    if (point.shapeType.startsWith('hollow')) {
                        point.shape.setAttribute('stroke', options.color);
                    } else {
                        point.shape.setAttribute('fill', options.color);
                        point.shape.setAttribute('stroke', options.color);
                    }
                }
            }

            // サイズの更新
            if (options.size !== undefined && isValidNumber(options.size)) {
                point.size = options.size;
                point.shape.setAttribute('data-original-size', options.size);
                
                // スケールに応じたサイズを設定
                const scaledSize = this._getScaledPointSize(options.size);
                this._updatePointSize(point.shape, point.shapeType, scaledSize);
            }

            // 形状の更新
            if (options.shape !== undefined && options.shape !== point.shapeType) {
                point.shapeType = options.shape;
                
                // 古い形状要素を削除
                if (point.shape && point.shape.parentNode) {
                    point.shape.parentNode.removeChild(point.shape);
                }
                
                // 新しい形状を作成
                const shapeGenerator = getShapeGenerator(options.shape);
                const shapeInfo = shapeGenerator(point.size, point.strokeWidth);
                
                const newShape = this._createSVGElement(shapeInfo.element, {
                    ...shapeInfo.attributes,
                    'fill': options.shape.startsWith('hollow') ? 'white' : point.color,
                    'stroke': point.color,
                    'stroke-width': point.strokeWidth,
                    'fill-opacity': point.opacity,
                    'stroke-opacity': point.opacity,
                    'class': 'point-shape',
                    'data-original-size': point.size
                });
                
                // スケールに応じたサイズを設定
                const scaledSize = this._getScaledPointSize(point.size);
                this._updatePointSize(newShape, options.shape, scaledSize);
                
                // 形状要素を更新
                point.group.appendChild(newShape);
                point.shape = newShape;
            }

            // 透明度の更新
            if (options.opacity !== undefined) {
                point.opacity = options.opacity;
                if (point.shape) {
                    point.shape.setAttribute('fill-opacity', options.opacity);
                    point.shape.setAttribute('stroke-opacity', options.opacity);
                }
            }

            // 表示/非表示の更新
            if (options.visibility !== undefined) {
                point.visibility = options.visibility;
                if (point.group) {
                    point.group.style.display = options.visibility ? '' : 'none';
                }
            }

            // 線の太さを更新
            if (options.strokeWidth !== undefined) {
                point.strokeWidth = options.strokeWidth;
                if (point.shape) {
                    point.shape.setAttribute('stroke-width', options.strokeWidth);
                }
            }

            // カスタムスタイルを更新
            if (options.style !== undefined) {
                // 既存のスタイルを削除
                if (point.style && point.shape) {
                    Object.keys(point.style).forEach(key => {
                        point.shape.style[key] = '';
                    });
                }
                
                // 新しいスタイルを適用
                if (options.style && point.shape) {
                    Object.keys(options.style).forEach(key => {
                        point.shape.style[key] = options.style[key];
                    });
                }
                
                point.style = options.style;
            }

            this._log(`Updated point ${pointId}`, options);
            return true;
        } catch (error) {
            this._logError(`Error updating point ${pointId}`, error);
            return false;
        }
    }

    /**
     * 点を削除
     * @param {string|number} pointId - 点のID
     * @returns {boolean} 削除成功したかどうか
     */
    removePoint(pointId) {
        try {
            for (let i = 0; i < this.curves.length; i++) {
                const curve = this.curves[i];
                if (!curve || !curve.points) continue;
                
                const pointIndex = curve.points.findIndex(p => p && p.id == pointId);
                if (pointIndex === -1) continue;
                
                const point = curve.points[pointIndex];
                
                // DOM要素を削除
                if (point.group && point.group.parentNode) {
                    point.group.parentNode.removeChild(point.group);
                }
                
                // 配列から削除
                curve.points.splice(pointIndex, 1);
                
                this._log(`Removed point ${pointId} from curve ${curve.id}`);
                return true;
            }
            
            this._log(`Point with id ${pointId} not found for removal`);
            return false;
        } catch (error) {
            this._logError(`Error removing point ${pointId}`, error);
            return false;
        }
    }

    /**
     * 曲線上の点をすべて削除
     * @param {string|number} curveId - 曲線のID
     * @returns {boolean} 削除成功したかどうか
     */
    removeAllPoints(curveId) {
        try {
            const curve = this.getCurve(curveId);
            if (!curve || !curve.points) return false;
            
            // 曲線上のすべての点を削除
            curve.points.forEach(point => {
                if (point.group && point.group.parentNode) {
                    point.group.parentNode.removeChild(point.group);
                }
            });
            
            curve.points = [];
            this._log(`Removed all points from curve ${curveId}`);
            return true;
        } catch (error) {
            this._logError(`Error removing all points from curve ${curveId}`, error);
            return false;
        }
    }

    /**
     * 曲線グループの表示・非表示を設定
     * @param {string|number} id - 曲線のID
     * @param {boolean} visible - 表示するかどうか
     * @returns {boolean} 成功したかどうか
     */
    setCurveGroupVisibility(id, visible) {
        try {
            const curveGroup = this.svg.querySelector(`g[data-curve-base-id="${id}"]`);
            if (curveGroup) {
                curveGroup.style.display = visible ? '' : 'none';
                return true;
            }
            return false;
        } catch (error) {
            this._logError('Error setting curve group visibility', error);
            return false;
        }
    }
}
