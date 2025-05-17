/**
 * グラフ計算機の保存関連ユーティリティ
 * PNG、SVG、JSONでのエクスポート機能を提供
 */

/**
 * SVGをPNG形式で保存する
 * @param {GraphCalculator} calculator - グラフ計算機のインスタンス
 * @param {string} filename - 保存するファイル名（.pngは自動追加）
 * @param {number} scale - 出力画像の拡大率（高解像度対応）
 * @returns {Promise<boolean>} 保存に成功したかどうか
 */
export async function saveToPNG(calculator, filename = 'graph', scale = 2) {
    try {
        // SVG要素の取得
        const svg = calculator.getSvg();
        if (!svg) {
            console.error('SVG要素が見つかりません');
            return false;
        }

        // SVGの寸法を取得
        const width = svg.clientWidth || parseInt(svg.getAttribute('width'));
        const height = svg.clientHeight || parseInt(svg.getAttribute('height'));
        
        if (!width || !height) {
            console.error('SVGの寸法が無効です');
            return false;
        }
        
        // すべての要素を含むSVGをクローン
        const clonedSvg = svg.cloneNode(true);
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        
        // スタイルを埋め込む
        const styleElement = document.createElement('style');
        const cssRules = [];
        
        // スタイルシートを取得
        for (let i = 0; i < document.styleSheets.length; i++) {
            try {
                const sheet = document.styleSheets[i];
                const rules = sheet.cssRules || sheet.rules;
                
                for (let j = 0; j < rules.length; j++) {
                    const rule = rules[j];
                    if (rule.selectorText && (
                        rule.selectorText.includes('.graph-') || 
                        rule.selectorText.includes('grid-line') || 
                        rule.selectorText.includes('axis-') || 
                        rule.selectorText.includes('micro-grid-line') || 
                        rule.selectorText.includes('sub-grid-line') || 
                        rule.selectorText.includes('curve-path')
                    )) {
                        cssRules.push(rule.cssText);
                    }
                }
            } catch (e) {
                console.warn('スタイルシートの取得でエラー:', e);
            }
        }
        
        // デフォルトのスタイルも追加
        cssRules.push(`
            .grid-line { stroke: #888; stroke-width: 1; }
            .grid-line.horizontal { stroke: #888; stroke-width: 1; }
            .grid-line.vertical { stroke: #888; stroke-width: 1; }
            .sub-grid-line { stroke: #ddd; stroke-width: 0.5; }
            .micro-grid-line { stroke: #eee; stroke-width: 0.5; }
            .axis-tick { stroke: #888; stroke-width: 1; }
            .axis-label { font-size: 10px; font-family: Arial; }
            .curve-path { fill: none; }
        `);
        
        styleElement.textContent = cssRules.join('\n');
        clonedSvg.insertBefore(styleElement, clonedSvg.firstChild);

        // SVGをシリアライズしてデータURLに変換
        const svgData = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const DOMURL = window.URL || window.webkitURL || window;
        const svgUrl = DOMURL.createObjectURL(svgBlob);

        // Canvas要素を作成
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        
        // スケールを設定
        ctx.scale(scale, scale);
        
        // 背景を白に設定
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // SVGを描画
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, width, height);
                DOMURL.revokeObjectURL(svgUrl);
                
                // PNGとして保存
                try {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            downloadBlob(blob, `${filename}.png`);
                            resolve(true);
                        } else {
                            console.error('PNG生成に失敗しました');
                            resolve(false);
                        }
                    }, 'image/png');
                } catch (e) {
                    console.error('PNG変換エラー:', e);
                    resolve(false);
                }
            };
            img.onerror = () => {
                console.error('SVG画像の読み込みに失敗しました');
                DOMURL.revokeObjectURL(svgUrl);
                resolve(false);
            };
            img.src = svgUrl;
        });
    } catch (error) {
        console.error('PNG保存中にエラーが発生しました:', error);
        return false;
    }
}

/**
 * SVG形式で保存する
 * @param {GraphCalculator} calculator - グラフ計算機のインスタンス
 * @param {string} filename - 保存するファイル名（.svgは自動追加）
 * @returns {boolean} 保存に成功したかどうか
 */
export function saveToSVG(calculator, filename = 'graph') {
    try {
        const svg = calculator.getSvg();
        if (!svg) {
            console.error('SVG要素が見つかりません');
            return false;
        }
        
        // SVGをすべての要素を含めた状態でクローン
        const clonedSvg = svg.cloneNode(true);
        
        // 正しい名前空間を設定
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        
        // スタイルシートをSVGに埋め込む
        const styleElement = document.createElement('style');
        const cssRules = [];
        
        // スタイルシートを取得
        for (let i = 0; i < document.styleSheets.length; i++) {
            try {
                const sheet = document.styleSheets[i];
                const rules = sheet.cssRules || sheet.rules;
                
                for (let j = 0; j < rules.length; j++) {
                    const rule = rules[j];
                    if (rule.selectorText && (
                        // グラフ関連のスタイルを含める
                        rule.selectorText.includes('.graph-') || 
                        rule.selectorText.includes('grid-line') || 
                        rule.selectorText.includes('axis-') || 
                        rule.selectorText.includes('micro-grid-line') || 
                        rule.selectorText.includes('sub-grid-line') || 
                        rule.selectorText.includes('curve-path')
                    )) {
                        cssRules.push(rule.cssText);
                    }
                }
            } catch (e) {
                // CORSエラーなどが発生した場合はスキップ
                console.warn('スタイルシートの取得でエラー:', e);
            }
        }
        
        // デフォルトのスタイルも追加
        cssRules.push(`
            .grid-line { stroke: #888; stroke-width: 1; }
            .grid-line.horizontal { stroke: #888; stroke-width: 1; }
            .grid-line.vertical { stroke: #888; stroke-width: 1; }
            .sub-grid-line { stroke: #ddd; stroke-width: 0.5; }
            .micro-grid-line { stroke: #eee; stroke-width: 0.5; }
            .axis-tick { stroke: #888; stroke-width: 1; }
            .axis-label { font-size: 10px; font-family: Arial; }
            .curve-path { fill: none; }
        `);
        
        styleElement.textContent = cssRules.join('\n');
        clonedSvg.insertBefore(styleElement, clonedSvg.firstChild);
        
        // SVGをシリアライズしてダウンロード
        const svgData = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
        downloadBlob(svgBlob, `${filename}.svg`);
        
        return true;
    } catch (error) {
        console.error('SVG保存中にエラーが発生しました:', error);
        return false;
    }
}

/**
 * グラフの状態をJSON形式で保存する
 * @param {GraphCalculator} calculator - グラフ計算機のインスタンス
 * @param {string} filename - 保存するファイル名（.jsonは自動追加）
 * @param {Object} additionalSettings - 追加の設定情報（SettingsManagerなどの状態）
 * @param {Array} curves - CurveManagerからの曲線情報（表示状態と詳細表示状態を含む）
 * @returns {boolean} 保存に成功したかどうか
 */
export function saveToJSON(calculator, filename = 'graph-data', additionalSettings = null, curves = null) {
    try {
        // GraphCalculatorの曲線データを取得
        const graphCurves = calculator.getAllCurves().map(curve => {
            // 基本的な曲線データ
            const curveData = {
                id: curve.id,
                color: curve.color,
                width: curve.width,
                opacity: curve.opacity,
                visibility: curve.visibility !== undefined ? curve.visibility : true,
                data: curve.originalData,
                strokeDasharray: curve.strokeDasharray || 'none',
                style: curve.style || null,
            };
            
            // // 関連する点のデータを追加
            // if (curve.points && curve.points.length > 0) {
            //     curveData.points = curve.points.map(point => ({
            //         id: point.id,
            //         x: point.x,
            //         y: point.y,
            //         shape: point.shapeType,
            //         size: point.size,
            //         color: point.color,
            //         opacity: point.opacity !== undefined ? point.opacity : 1.0,
            //         visibility: point.visibility !== undefined ? point.visibility : true,
            //         strokeWidth: point.strokeWidth,
            //         style: point.style || {},
            //         properties: point.properties || {}  // 強化: 追加プロパティを保存
            //     }));
            // }
            
            return curveData;
        });
        
        // CurveManagerからの曲線情報と結合
        let enhancedCurves = graphCurves;
        if (curves && Array.isArray(curves)) {
            // GraphCalculatorとCurveManagerの曲線データを統合
            enhancedCurves = graphCurves.map(graphCurve => {
                // 対応するCurveManagerの曲線を検索
                const cmCurve = curves.find(c => c.graphCurve && c.graphCurve.id === graphCurve.id);
                if (cmCurve) {
                    // CurveManagerから追加情報を取得
                    console.log(cmCurve)
                    const enhancedData = {
                        ...graphCurve,
                        isHidden: cmCurve.isHidden || false,
                        isDetailShown: cmCurve.isDetailShown || false,
                        latexEquations: cmCurve.latexEquations || [], // 数式情報も保存
                        preKnots: cmCurve.preKnots || [], // 曲線の前節点情報
                        type: cmCurve.type || 'parametric', // 曲線のタイプ（デフォルトは'parametric'）
                        originalPoints: cmCurve.type === 'quadratic' ? cmCurve.originalPoints : [], // 近似に必要なため元の点データを保存
                        knotCount: cmCurve.knotCount || 10, // 曲線の節点数
                        minKnots: cmCurve.minKnots || 2, // 曲線の最小節点数
                        maxKnots: cmCurve.maxKnots || 10, // 曲線の最大節点数
                    };
                    
                    // CurveManagerに点データがあり、GraphCalculatorにない場合は追加
                    if (cmCurve.knotPoints && cmCurve.knotPoints.length > 0) {
                        // 節点データがある場合は保存
                        enhancedData.knotPoints = cmCurve.knotPoints.map(knot => ({
                            x: knot.x,
                            y: knot.y,
                            id: knot.point ? knot.point.id : null
                        }));
                    }
                    
                    if (cmCurve.points && cmCurve.points.length > 0 && (!graphCurve.points || graphCurve.points.length === 0)) {
                        enhancedData.points = cmCurve.points.map(point => ({
                            id: point.id,
                            x: point.x,
                            y: point.y,
                            shape: point.shapeType || 'circle',
                            size: point.size,
                            color: point.color,
                            opacity: point.opacity !== undefined ? point.opacity : 1.0,
                            visibility: point.visibility !== undefined ? point.visibility : true,
                            strokeWidth: point.strokeWidth,
                            style: point.style || {},
                            properties: point.properties || {} // 強化: 追加プロパティを保存
                        }));
                    }
                    
                    return enhancedData;
                }
                return graphCurve;
            });
        }
        
        // 保存するデータを収集
        const saveData = {
            version: 'b-1.4.13',
            timestamp: new Date().toISOString(),
            domain: calculator.getDomain(),
            curves: enhancedCurves,
            options: calculator.options,
        };
        
        // 追加の設定情報がある場合は追加
        if (additionalSettings) {
            saveData.settings = additionalSettings;
        }
        
        // JSONに変換
        const jsonString = JSON.stringify(saveData, null, 2);
        const jsonBlob = new Blob([jsonString], { type: 'application/json' });
        downloadBlob(jsonBlob, `${filename}.json`);
        
        return true;
    } catch (error) {
        console.error('JSON保存中にエラーが発生しました:', error);
        return false;
    }
}

/**
 * JSON形式のデータからグラフを復元する
 * @param {GraphCalculator} calculator - グラフ計算機のインスタンス
 * @param {Object|string} jsonData - JSONデータオブジェクトまたは文字列
 * @param {Function} settingsCallback - 設定を復元するためのコールバック関数
 * @param {Object} options - 復元オプション { preserveDomain: ドメインを保持するか }
 * @returns {boolean} 復元に成功したかどうか
 */
export function loadFromJSON(calculator, jsonData, settingsCallback = null, options = { preserveDomain: true }) {
    try {
        // 文字列の場合はパース
        const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        
        // バージョン確認
        if (!data.version) {
            console.error('互換性のないJSON形式です: バージョン情報がありません');
            return false;
        }
        
        // 既存の曲線をすべて削除
        const curves = calculator.getAllCurves();
        curves.forEach(curve => {
            calculator.removeCurve(curve.id);
        });
        
        // オプションでドメイン保持指定がなければドメインを復元
        if (!options.preserveDomain && data.domain) {
            calculator.setDomain(data.domain, false);
        }
        
        // 曲線をIDでグループ化して、同じグループに属するべき曲線を一緒に復元
        const curveGroups = {};
        const restoredCurves = []; // 復元された曲線情報を格納
        
        // まず曲線をグループ化
        if (Array.isArray(data.curves)) {
            data.curves.forEach(curveData => {
                console.log('曲線データ:', curveData);
                const id = curveData.id.toString();
                const baseId = id.startsWith('emphasis-') ? id.replace('emphasis-', '') : id;
                
                if (!curveGroups[baseId]) {
                    curveGroups[baseId] = [];
                }
                curveGroups[baseId].push(curveData);
            });
        }
        console.log('グループ化された曲線データ:', curveGroups);
        console.log(data)
        
        // グループごとに曲線を復元
        Object.values(curveGroups).forEach(groupCurves => {
            console.log('グループ曲線データ:', groupCurves);
            // グループ内の曲線を強調表示とそれ以外に分類
            const emphasisCurves = groupCurves.filter(c => c.id.toString().startsWith('emphasis-'));
            const mainCurves = groupCurves.filter(c => !c.id.toString().startsWith('emphasis-'));
            
            // 強調表示曲線を先に追加
            emphasisCurves.forEach(curveData => {
                // 曲線オプションの取得
                const curve = _restoreCurve(calculator, curveData);
                if (curve) {
                    // 復元成功した場合、点を復元
                    _restorePoints(calculator, curve, curveData);
                    restoredCurves.push({
                        ...curveData,
                        graphCurve: curve
                    });
                }
            });
            
            // メイン曲線を追加
            mainCurves.forEach(curveData => {
                // 曲線オプションの取得
                const curve = _restoreCurve(calculator, curveData);
                if (curve) {
                    // 復元成功した場合、点を復元
                    _restorePoints(calculator, curve, curveData);
                    restoredCurves.push({
                        ...curveData,
                        graphCurve: curve
                    });
                }
            });
        });
        
        // オプションの復元（エラーでも処理継続）
        try {
            if (data.options) {
                calculator.updateOptions(data.options);
            }
        } catch (optError) {
            console.warn('オプション復元でエラーが発生しました:', optError);
        }
        
        // 追加の設定情報の復元（設定コールバックがある場合）
        if (data.settings && typeof settingsCallback === 'function') {
            settingsCallback(data.settings);
        }
        
        // JSON曲線データを返す（CurveManagerでの復元用）
        return {
            success: true,
            curves: restoredCurves
        };
    } catch (error) {
        console.error('JSONからの復元中にエラーが発生しました:', error);
        return { success: false };
    }
}

/**
 * 曲線を復元する（内部ヘルパー関数）
 * @private
 */
function _restoreCurve(calculator, curveData) {
    const curveOptions = {
        id: curveData.id,
        color: curveData.color,
        width: curveData.width,
        opacity: curveData.opacity,
        visibility: curveData.visibility !== undefined ? curveData.visibility : true
    };
    
    // 拡張オプションの復元
    if (curveData.strokeDasharray) curveOptions.strokeDasharray = curveData.strokeDasharray;
    if (curveData.style) curveOptions.style = curveData.style;
    
    // 曲線の追加
    return calculator.addCurve(curveData.data, curveOptions);
}

/**
 * 点を復元する（内部ヘルパー関数）
 * @private
 */
function _restorePoints(calculator, curve, curveData) {
    if (!curve || !curveData.knotPoints || !Array.isArray(curveData.knotPoints)) return;
    
    // 点データの復元
    curveData.knotPoints.forEach(pointData => {
        const pointOptions = {
            shape: pointData.shape || 'hollowCircle',
            size: pointData.size,
            stroke: pointData.color,
            fill: pointData.fill,
            opacity: pointData.opacity !== undefined ? pointData.opacity : 1.0,
            visibility: pointData.visibility !== undefined ? pointData.visibility : true,
            strokeWidth: pointData.strokeWidth,
            style: pointData.style || {},
            properties: pointData.properties || {}  // 追加プロパティ
        };
        
        calculator.addPoint(curve.id, pointData.x, pointData.y, pointOptions);
    });
    
    // 節点データの復元（特別な処理が必要な場合）
    if (curveData.knotPoints && Array.isArray(curveData.knotPoints)) {
        curve.knotPoints = curveData.knotPoints;
    }
}

/**
 * JSONファイルを選択して読み込む
 * @param {Function} onLoadCallback - JSONが読み込まれた時に呼び出されるコールバック関数
 */
export function importJSONFile(onLoadCallback) {
    if (typeof onLoadCallback !== 'function') {
        console.error('コールバック関数が必要です');
        return false;
    }
    
    // 隠しファイル入力要素を作成
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // ファイル選択イベント
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                onLoadCallback(jsonData);
            } catch (error) {
                console.error('JSONファイルの解析に失敗しました:', error);
                alert('JSONファイルの解析に失敗しました。有効なJSONファイルを選択してください。');
            }
            document.body.removeChild(fileInput);
        };
        
        reader.onerror = () => {
            console.error('ファイルの読み込みに失敗しました');
            alert('ファイルの読み込みに失敗しました。');
            document.body.removeChild(fileInput);
        };
        
        reader.readAsText(file);
    });
    
    // ファイル選択ダイアログを開く
    fileInput.click();
    
    return true;
}

/**
 * Blobをファイルとしてダウンロードする
 * @private
 * @param {Blob} blob - ダウンロードするBlob
 * @param {string} filename - ファイル名
 */
function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    
    // ダウンロードをトリガー
    document.body.appendChild(link);
    link.click();
    
    // 後処理
    setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(link.href);
    }, 100);
}
