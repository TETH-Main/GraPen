/**
 * グラフ計算機の保存関連ユーティリティ
 * PNG、SVG、JSONでのエクスポート機能を提供
 */

import { toRPN, detectFormulaType } from '../util/NumberUtil.js';
import { GraPen } from '../GraPen.js';

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
                    const enhancedData = {
                        ...graphCurve,
                        isHidden: cmCurve.isHidden || false,
                        isDetailShown: cmCurve.isDetailShown || false,
                        latexEquations: cmCurve.latexEquations || [], // 数式情報も保存
                        preKnots: cmCurve.preKnots || [], // 曲線の前節点情報
                        type: cmCurve.type || 'parametric', // 曲線のタイプ（デフォルトは'parametric'）
                        originalPoints: cmCurve.originalPoints, // 近似に必要なため元の点データを保存
                        knotCount: cmCurve.knotCount || 10, // 曲線の節点数
                        minKnots: cmCurve.minKnots || 2, // 曲線の最小節点数
                        maxKnots: cmCurve.maxKnots || 10, // 曲線の最大節点数
                        approximationType: cmCurve.approximationType || cmCurve.type || null,
                        approximationData: cmCurve.approximationData || null,
                        approximationDiagnostics: cmCurve.approximationDiagnostics || null,
                        selectedApproximator: cmCurve.selectedApproximator || null,
                        approximatorPriority: typeof cmCurve.approximatorPriority === 'number' ? cmCurve.approximatorPriority : null,
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

        // 保存用に不要な再計算可能フィールドを削除
        function stripCurveForSave(c) {
            // 最低限のオブジェクトコピー
            const out = { ...c };
            // 削除対象のトップレベルフィールド
            delete out.strokeDasharray;
            delete out.style;
            delete out.originalPoints;
            delete out.knotPoints;
            delete out.knotCount;
            delete out.data;
            delete out.preKnots;

            // latexEquations 内の rpn を削除（type などの形状情報は保持）
            if (Array.isArray(out.latexEquations)) {
                out.latexEquations = out.latexEquations.map(eq => {
                    const clone = { ...eq };
                    delete clone.rpn;
                    return clone;
                });
            }
            return out;
        }

        const strippedCurves = enhancedCurves.map(stripCurveForSave);

        // 保存するデータを収集
        const saveData = {
            version: 'v-1.1.0',
            timestamp: new Date().toISOString(),
            domain: calculator.getDomain(),
            curves: strippedCurves,
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
                const id = curveData.id.toString();
                const baseId = id.startsWith('emphasis-') ? id.replace('emphasis-', '') : id;

                if (!curveGroups[baseId]) {
                    curveGroups[baseId] = [];
                }
                curveGroups[baseId].push(curveData);
            });
        }

        // グループごとに曲線を復元
        Object.values(curveGroups).forEach(groupCurves => {
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
                const usedApproximationData = applyApproximationData(curveData);
                // まず強制再計算を行い、必要に応じて data を更新してから曲線を追加する
                try {
                    if (Array.isArray(curveData.latexEquations)) {
                        // 形式タイプを強制判定・付与（既存タイプがない場合のみ）
                        ensureTypeForLatex(curveData.latexEquations);

                        if (!usedApproximationData) {
                            // RPN を強制生成
                            ensureRPNForLatex(curveData.latexEquations);
                            // knotPoints を再計算（既存がない場合のみ）
                            if (!Array.isArray(curveData.knotPoints) || curveData.knotPoints.length === 0) {
                                curveData.knotPoints = computeKnotPointsFromLatex(curveData.latexEquations, calculator.getDomain());
                            }
                            // originalPoints を再生成（既存がない場合のみ）
                            if (!Array.isArray(curveData.originalPoints) || curveData.originalPoints.length === 0) {
                                curveData.originalPoints = sampleOriginalPointsFromLatex(
                                    curveData.latexEquations,
                                    curveData.knotCount || DEFAULT_SAMPLE_PER_INTERVAL,
                                    calculator.getDomain()
                                );
                            }
                        }

                        if (!curveData.data || typeof curveData.data !== 'string' || curveData.data.length === 0) {
                            const generatorOptions = {
                                type: curveData.type || (curveData.latexEquations[0] && curveData.latexEquations[0].type) || null,
                                approximationData: curveData.approximationData || null
                            };
                            curveData.data = window.GraPen.generateSVGPathFromFormula(
                                curveData.latexEquations,
                                curveData.originalPoints,
                                generatorOptions
                            );
                        }

                        // type="quadratic" のときに preKnots を単純初期化してセットする（外部 approximator は使わない）
                        if (curveData.type === 'quadratic' && (!Array.isArray(curveData.preKnots) || curveData.preKnots.length === 0)) {
                            try {
                                const kp = Array.isArray(curveData.knotPoints) ? curveData.knotPoints : [];
                                curveData.maxKnots = kp.length || (curveData.knotCount || 10);
                                curveData.minKnots = 2;

                                const xs = kp.map(p => (p && typeof p.x === 'number') ? p.x : (Array.isArray(p) && typeof p[0] === 'number' ? p[0] : NaN)).filter(Number.isFinite);
                                let selectedKnots;
                                const normalCount = Math.max(2, Number(curveData.maxKnots) || Number(curveData.knotCount) || 10);
                                if (xs.length) {
                                    const minX = Math.min(...xs), maxX = Math.max(...xs), range = (maxX - minX) || 1;
                                    const norm = xs.map(x => (x - minX) / range).sort((a, b) => a - b);
                                    selectedKnots = norm.slice(0, normalCount);
                                    while (selectedKnots.length < normalCount) selectedKnots.push((selectedKnots.length) / (normalCount - 1));
                                    selectedKnots = Array.from(new Set(selectedKnots)).sort((a, b) => a - b).slice(0, normalCount);
                                } else {
                                    selectedKnots = Array.from({ length: normalCount }, (_, i) => i / (normalCount - 1));
                                }

                                const pres = selectedKnots.map(k => ({ knot: k, priority: -1, diff: -9999 }));
                                pres.unshift({ knot: -0.2, priority: -1, diff: -9999 }, { knot: -0.1, priority: -1, diff: -9999 });
                                pres.push({ knot: 1.1, priority: -1, diff: -9999 }, { knot: 1.2, priority: -1, diff: -9999 });
                                curveData.preKnots = pres;

                                // a値と隣接差分を計算し、優先度を割り当てる
                                try {
                                    const eqs = Array.isArray(curveData.latexEquations) ? curveData.latexEquations : [];
                                    const aValues = eqs.map(eq => {
                                        if (!eq || typeof eq.formula !== 'string') return NaN;
                                        const m = eq.formula.match(/([+-]?\d*\.?\d+)\s*\(x\s*[-+]\s*\d*\.?\d+\)\^2/);
                                        if (m && m[1]) return Number(m[1]);
                                        const m2 = eq.formula.match(/y\s*=\s*([+-]?\d*\.?\d+)x\^2/);
                                        if (m2 && m2[1]) return Number(m2[1]);
                                        return NaN;
                                    });

                                    if (Array.isArray(curveData.preKnots) && aValues.length >= 2) {
                                        // 差分をpreKnotsに割り当てる（先頭のダミーノット2つと最初の正規knotsをスキップするためオフセット）
                                        for (let i = 0; i < aValues.length - 1; i++) {
                                            const a1 = Number(aValues[i]);
                                            const a2 = Number(aValues[i + 1]);
                                            const d = (isFinite(a1) && isFinite(a2)) ? Math.abs(a1 - a2) : -9999;
                                            const idx = 3 + i;
                                            if (curveData.preKnots[idx]) curveData.preKnots[idx].diff = d;
                                        }

                                        // 有効なdiffを持つインデックスを収集し、diffの降順でソートしてから優先度0..n-1を割り当てる
                                        const indices = curveData.preKnots.map((k, i) => i).filter(i => curveData.preKnots[i] && curveData.preKnots[i].diff !== -9999);
                                        indices.sort((i, j) => curveData.preKnots[j].diff - curveData.preKnots[i].diff);
                                        for (let p = 0; p < indices.length; p++) {
                                            curveData.preKnots[indices[p]].priority = p;
                                        }

                                        curveData.preKnots.sort((a, b) => a.knot - b.knot);
                                    }
                                } catch (e) {
                                    console.warn('preKnots diff/priority calculation failed for', curveData && curveData.id, e);
                                }
                            } catch (e) {
                                console.warn('preKnots 初期化で例外:', e, curveData && curveData.id);
                                curveData.preKnots = curveData.preKnots || [];
                                curveData.maxKnots = curveData.maxKnots || (Array.isArray(curveData.knotPoints) ? curveData.knotPoints.length : (curveData.knotCount || 10));
                                curveData.minKnots = curveData.minKnots || 2;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('ロード時の強制再計算でエラー:', e, curveData && curveData.id);
                }

                // 曲線オプションの取得（再計算後）
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

// ----------------------------
// Load-time 補完ヘルパ
// ----------------------------

function normalizeKnotTuples(knots, idBase) {
    if (!Array.isArray(knots)) return null;
    return knots
        .map((point, index) => {
            if (Array.isArray(point) && point.length >= 2) {
                return { x: point[0], y: point[1], id: `${idBase || 'knot'}-${index}` };
            }
            if (point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number') {
                return {
                    x: point.x,
                    y: point.y,
                    id: point.id || `${idBase || 'knot'}-${index}`,
                    shape: point.shape,
                    size: point.size,
                    stroke: point.color,
                    fill: point.fill,
                    opacity: point.opacity,
                    visibility: point.visibility,
                    strokeWidth: point.strokeWidth,
                    style: point.style,
                    properties: point.properties
                };
            }
            return null;
        })
        .filter(Boolean);
}

function normalizePointTuples(points) {
    if (!Array.isArray(points)) return null;
    return points
        .map(point => {
            if (Array.isArray(point) && point.length >= 2) {
                return [Number(point[0]), Number(point[1])];
            }
            if (point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number') {
                return [Number(point.x), Number(point.y)];
            }
            return null;
        })
        .filter(p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite));
}

function applyApproximationData(curveData) {
    if (!curveData || !curveData.approximationData) return false;
    const approx = curveData.approximationData;
    let updated = false;

    if (approx.type && !curveData.approximationType) {
        curveData.approximationType = approx.type;
    }
    if (!curveData.type && approx.type) {
        curveData.type = approx.type;
    }
    if (typeof approx.svgPath === 'string' && approx.svgPath.length > 0) {
        curveData.data = approx.svgPath;
        updated = true;
    }
    const normalizedKnots = normalizeKnotTuples(approx.knots, curveData.id || 'curve');
    if (normalizedKnots && normalizedKnots.length) {
        curveData.knotPoints = normalizedKnots;
        updated = true;
    }
    const normalizedPoints = normalizePointTuples(approx.originalPoints);
    if (normalizedPoints && normalizedPoints.length) {
        curveData.originalPoints = normalizedPoints;
    }
    if (!curveData.domain && approx.domain) {
        curveData.domain = approx.domain;
    }
    return updated;
}

const DEFAULT_SAMPLE_PER_INTERVAL = 40;

function ensureRPNForLatex(latexEquations) {
    if (!Array.isArray(latexEquations)) return;
    const skipTypes = new Set([
        'quadraticBezier',
        'cubicBezier',
        'circle',
        'ellipse',
        'arc',
        'label',
        'selectiveHybrid'
    ]);
    latexEquations.forEach(eq => {
        try {
            if (eq && skipTypes.has(eq.type)) {
                eq.rpn = [];
                return;
            }
            // 強制的にRPNを生成（既存があっても上書きする）
            eq.rpn = toRPN(eq.formula || '');
        } catch (e) {
            console.warn('RPN生成に失敗しました:', e, eq && eq.formula);
            eq.rpn = [];
        }
    });
}

function ensureTypeForLatex(latexEquations) {
    if (!Array.isArray(latexEquations)) return;
    latexEquations.forEach(eq => {
        try {
            if (!eq.type || eq.type === 'unknown') {
                eq.type = detectFormulaType(eq.formula || '');
            }
        } catch (e) {
            console.warn('式タイプ判定に失敗しました:', e, eq && eq.formula);
            eq.type = 'unknown';
        }
    });
}

function evaluateRPN(rpnTokens, x) {
    if (!Array.isArray(rpnTokens)) return NaN;
    const stack = [];
    for (const tok of rpnTokens) {
        if (/^\d*\.?\d+$/.test(tok)) {
            stack.push(Number(tok));
        } else if (/^x$/i.test(tok)) {
            stack.push(Number(x));
        } else if (tok === '+') {
            const b = stack.pop() || 0; const a = stack.pop() || 0; stack.push(a + b);
        } else if (tok === '-') {
            const b = stack.pop() || 0; const a = stack.pop() || 0; stack.push(a - b);
        } else if (tok === '*') {
            const b = stack.pop() || 0; const a = stack.pop() || 0; stack.push(a * b);
        } else if (tok === '/') {
            const b = stack.pop() || 0; const a = stack.pop() || 0; stack.push(a / b);
        } else if (tok === '^') {
            const b = stack.pop() || 0; const a = stack.pop() || 0; stack.push(Math.pow(a, b));
        } else if (tok.toLowerCase && ['sin', 'cos', 'tan', 'sqrt'].includes(tok.toLowerCase())) {
            const fn = tok.toLowerCase();
            const a = stack.pop() || 0;
            if (fn === 'sin') stack.push(Math.sin(a));
            else if (fn === 'cos') stack.push(Math.cos(a));
            else if (fn === 'tan') stack.push(Math.tan(a));
            else if (fn === 'sqrt') stack.push(Math.sqrt(a));
        } else {
            // 未知トークンは無視して NaN を返すためにスタックをクリア
            return NaN;
        }
    }
    return stack.length ? stack[stack.length - 1] : NaN;
}

function toNumber(val) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const n = Number(val);
        return isFinite(n) ? n : NaN;
    }
    return NaN;
}

function getNumericDomain(eq, globalDomain) {
    const d = (eq && eq.domain) ? eq.domain : {};
    let start = toNumber(d.start);
    let end = toNumber(d.end);
    if (!isFinite(start) && globalDomain && isFinite(globalDomain.xMin)) start = Number(globalDomain.xMin);
    if (!isFinite(end) && globalDomain && isFinite(globalDomain.xMax)) end = Number(globalDomain.xMax);
    return { start, end };
}

function computeKnotPointsFromLatex(latexEquations, globalDomain) {
    if (!Array.isArray(latexEquations)) return null;
    // collect boundaries
    const xs = [];
    latexEquations.forEach(eq => {
        const { start, end } = getNumericDomain(eq, globalDomain);
        if (isFinite(start)) xs.push(start);
        if (isFinite(end)) xs.push(end);
    });
    if (xs.length === 0 && globalDomain && isFinite(globalDomain.xMin) && isFinite(globalDomain.xMax)) {
        xs.push(Number(globalDomain.xMin), Number(globalDomain.xMax));
    }
    // unique & sort
    const uniq = Array.from(new Set(xs)).sort((a, b) => a - b);
    const knotPoints = [];
    uniq.forEach((x, i) => {
        // find equation covering x
        const eq = latexEquations.find(e => {
            const { start, end } = getNumericDomain(e, globalDomain);
            if (isFinite(start) && isFinite(end)) return (x >= start && x <= end);
            return true;
        }) || latexEquations[0];
        const y = evaluateRPN(eq.rpn || toRPN(eq.formula || ''), x);
        if (isFinite(y)) {
            knotPoints.push({ x: x, y: y, id: `knot-${i}` });
        }
    });
    return knotPoints;
}

function sampleOriginalPointsFromLatex(latexEquations, knotCount, globalDomain) {
    if (!Array.isArray(latexEquations)) return null;
    const samples = [];
    const intervals = latexEquations.map(eq => {
        const { start, end } = getNumericDomain(eq, globalDomain);
        return { eq, start, end };
    }).filter(it => isFinite(it.start) && isFinite(it.end) && it.end > it.start);

    if (intervals.length === 0) return null;

    const perInterval = Math.max(2, Math.round((knotCount || DEFAULT_SAMPLE_PER_INTERVAL) / intervals.length));
    intervals.forEach(interval => {
        const { eq, start, end } = interval;
        for (let i = 0; i <= perInterval; i++) {
            const t = i / perInterval;
            const x = start + (end - start) * t;
            const y = evaluateRPN(eq.rpn || toRPN(eq.formula || ''), x);
            if (isFinite(y)) samples.push([x, y]);
        }
    });
    // remove duplicate consecutive x
    const out = [];
    let lastX = null;
    for (const p of samples) {
        if (lastX === null || Math.abs(p[0] - lastX) > 1e-12) {
            out.push(p);
            lastX = p[0];
        }
    }
    // ensure at least 3 points
    if (out.length < 3) {
        const gd = globalDomain || {};
        const x0 = (typeof gd.xMin === 'number') ? gd.xMin : 0;
        const x1 = (typeof gd.xMax === 'number') ? gd.xMax : x0 + 1;
        out.push([x0, evaluateRPN(latexEquations[0].rpn || toRPN(latexEquations[0].formula || ''), x0) || 0]);
        out.push([x1, evaluateRPN(latexEquations[0].rpn || toRPN(latexEquations[0].formula || ''), x1) || 0]);
    }
    return out;
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

/**
 * SVGをPNG形式でBase64データとして取得する（ダウンロードしない）
 * @param {GraphCalculator} calculator
 * @param {number} width - 出力画像の幅
 * @param {number} height - 出力画像の高さ
 * @param {number} quality - 0.0〜1.0 圧縮率
 * @returns {Promise<string>} Base64 PNGデータURL
 */
export async function getPNGBase64(calculator, width = 128, height = 128, quality = 0.7) {
    try {
        const svg = calculator.getSvg();
        if (!svg) return '';
        const clonedSvg = svg.cloneNode(true);
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        // スタイル埋め込み（省略可: saveToPNG参照）
        const styleElement = document.createElement('style');
        const cssRules = [];
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
            } catch (e) { }
        }
        styleElement.textContent = cssRules.join('\n');
        clonedSvg.insertBefore(styleElement, clonedSvg.firstChild);

        const svgData = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        return await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(svgUrl);
                resolve(canvas.toDataURL('image/png', quality));
            };
            img.onerror = () => {
                URL.revokeObjectURL(svgUrl);
                resolve('');
            };
            img.src = svgUrl;
        });
    } catch (e) {
        return '';
    }
}

/**
 * グラフの状態をJSON文字列として取得する（ダウンロードしない）
 * @param {GraphCalculator} calculator
 * @param {Object} additionalSettings - 追加の設定情報（SettingsManagerなどの状態）
 * @param {Array} curves - CurveManagerからの曲線情報（表示状態と詳細表示状態を含む）
 * @returns {string} JSON文字列
 */
export function getJSONDataString(calculator, additionalSettings = null, curves = null) {
    try {
        const graphCurves = calculator.getAllCurves().map(curve => ({
            id: curve.id,
            color: curve.color,
            width: curve.width,
            opacity: curve.opacity,
            visibility: curve.visibility !== undefined ? curve.visibility : true,
            data: curve.originalData,
            strokeDasharray: curve.strokeDasharray || 'none',
            style: curve.style || null,
            // points は必要に応じて CurveManager 側から補完される
            points: curve.points || []
        }));

        // CurveManager の情報とマージ
        let enhancedCurves = graphCurves;
        if (curves && Array.isArray(curves)) {
            enhancedCurves = graphCurves.map(graphCurve => {
                const cmCurve = curves.find(c => c.graphCurve && c.graphCurve.id === graphCurve.id);
                if (cmCurve) {
                    const enhancedData = {
                        ...graphCurve,
                        isHidden: cmCurve.isHidden || false,
                        isDetailShown: cmCurve.isDetailShown || false,
                        latexEquations: cmCurve.latexEquations || [],
                        preKnots: cmCurve.preKnots || [],
                        type: cmCurve.type || 'parametric',
                        originalPoints: cmCurve.originalPoints,
                        knotCount: cmCurve.knotCount || 10,
                        minKnots: cmCurve.minKnots || 2,
                        maxKnots: cmCurve.maxKnots || 10,
                    };

                    if (cmCurve.knotPoints && cmCurve.knotPoints.length > 0) {
                        enhancedData.knotPoints = cmCurve.knotPoints.map(knot => ({ x: knot.x, y: knot.y, id: knot.point ? knot.point.id : null }));
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
                            properties: point.properties || {}
                        }));
                    }

                    return enhancedData;
                }
                return graphCurve;
            });
        }

        // saveToJSON と同じく不要項目を削除して保存用データを作成
        const strippedCurves = enhancedCurves.map(stripCurveForSave);

        const saveData = {
            version: 'v-1.1.0',
            timestamp: new Date().toISOString(),
            domain: calculator.getDomain(),
            curves: strippedCurves,
            options: calculator.options,
        };

        if (additionalSettings) saveData.settings = additionalSettings;

        return JSON.stringify(saveData, null, 2);
    } catch (e) {
        console.error('JSON文字列作成中にエラーが発生しました:', e);
        return '';
    }
}

/**
 * グラフの状態をJSON文字列として取得する（ダウンロードしない）
 * @param {GraphCalculator} calculator
 * @param {Object} additionalSettings - 追加の設定情報（SettingsManagerなどの状態）
 * @param {Array} curves - CurveManagerからの曲線情報（表示状態と詳細表示状態を含む）
 * @returns {string} JSON文字列
 */
export function getJSONFullDataString(calculator, additionalSettings = null, curves = null) {
    try {
        // GraphCalculatorの曲線データを取得
        const graphCurves = calculator.getAllCurves().map(curve => {
            // 基本的な曲線データ
            return {
                id: curve.id,
                color: curve.color,
                width: curve.width,
                opacity: curve.opacity,
                visibility: curve.visibility !== undefined ? curve.visibility : true,
                data: curve.originalData,
                strokeDasharray: curve.strokeDasharray || 'none',
                style: curve.style || null,
                points: curve.points || []
            };
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
                    const enhancedData = {
                        ...graphCurve,
                        isHidden: cmCurve.isHidden || false,
                        isDetailShown: cmCurve.isDetailShown || false,
                        latexEquations: cmCurve.latexEquations || [], // 数式情報も保存
                        preKnots: cmCurve.preKnots || [], // 曲線の前節点情報
                        type: cmCurve.type || 'parametric', // 曲線のタイプ
                        originalPoints: cmCurve.originalPoints, // 近似に必要なため元の点データを保存
                        knotCount: cmCurve.knotCount || 10, // 曲線の節点数
                        minKnots: cmCurve.minKnots || 2, // 曲線の最小節点数
                        maxKnots: cmCurve.maxKnots || 10, // 曲線の最大節点数
                    };

                    // 節点データがある場合は保存
                    if (cmCurve.knotPoints && cmCurve.knotPoints.length > 0) {
                        enhancedData.knotPoints = cmCurve.knotPoints.map(knot => ({
                            x: knot.x,
                            y: knot.y,
                            id: knot.point ? knot.point.id : null
                        }));
                    }

                    // 点データが不足している場合は追加
                    if (cmCurve.points && cmCurve.points.length > 0 &&
                        (!graphCurve.points || graphCurve.points.length === 0)) {
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
                            properties: point.properties || {}
                        }));
                    }

                    return enhancedData;
                }
                return graphCurve;
            });
        }

        // 保存するデータを収集
        const saveData = {
            version: 'v-1.0',
            timestamp: new Date().toISOString(),
            domain: calculator.getDomain(),
            curves: enhancedCurves,
            options: calculator.options,
        };

        // 追加の設定情報がある場合は追加
        if (additionalSettings) {
            saveData.settings = additionalSettings;
        }

        // JSONに変換して返す
        return JSON.stringify(saveData);
    } catch (e) {
        console.error('JSON文字列作成中にエラーが発生しました:', e);
        return '';
    }
}

