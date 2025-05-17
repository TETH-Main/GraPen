/**
 * 数式ハイライト機能クラス
 * 数式にマウスホバーしたときに対応する数式をグラフ上に表示する
 */
export class EquationHighlighter {
    /**
     * コンストラクタ
     * @param {Object} graphCalculator - グラフ計算機インスタンス
     */
    constructor(graphCalculator) {
        this.graphCalculator = graphCalculator;
        this.functionHighlightId = null;
        this.selectedEquation = null;
        this.selectedCurveId = null;
        this.selectedSectionIndex = null;
    }

    /**
     * 数式ハイライト表示
     * @param {Object} curve - ハイライトする曲線
     */
    highlightEquation(curve, sectionIndex, equation) {
        // 現在のハイライトを削除
        this.unhighlightEquation();

        if (curve.isHidden) return;
        console.log(curve, sectionIndex, equation);

        try {

            // equationとcurve.typeから数式のハイライト用svg文字列を作成
            const svgPath = this._createSvgPathFromEquation(
                equation.formula, equation.type, this.graphCalculator.getDomain()
            );
            if (!svgPath) return;

            // ハイライト用のIDを生成
            const highlightId = `highlight-func-${curve.id}-${sectionIndex}`;

            // 関数曲線を表示
            if (this.functionHighlightId) {
                this.graphCalculator.removeCurve(this.functionHighlightId);
            }

            // 細い点線、白い枠で曲線を表示
            const highlightCurve = this.graphCalculator.addCurve(svgPath, {
                id: highlightId,
                color: curve.color,
                width: curve.size * 0.6, // 細くする
                opacity: 0.8,
                strokeDasharray: '30 30', // 点線パターン
                style: {
                    filter: 'drop-shadow(0 0 2px white) drop-shadow(0 0 1px white)' // 白い枠線効果
                }
            });

            // ハイライト用曲線IDを保存
            this.functionHighlightId = highlightId;

            // 対応する数式アイテムにハイライトクラスを追加
            d3.selectAll(`.equation-content[data-section-index="${sectionIndex}"][data-curve-id="${curve.id}"]`)
                .classed('highlight-active', true);

            return true;
        } catch (error) {
            console.error('Error highlighting quadratic function:', error);
            return false;
        }

    }

    /**
     * 数式ハイライトの解除
     */
    unhighlightEquation() {
        // ハイライト用曲線を削除
        if (this.graphCalculator && this.functionHighlightId) {
            this.graphCalculator.removeCurve(this.functionHighlightId);
            this.functionHighlightId = null;
        }

        // ハイライトクラスを削除
        d3.selectAll(`.equation-content.highlight-active`)
            .classed('highlight-active', false);
    }

    /**
     * formulaとcurve.typeから数式のハイライト用svg文字列を作成
     * @param {string} formula - 数式
     * @param {string} curveType - 曲線のタイプ
     * @param {Object} domain - 表示範囲
     * @returns {string|null} SVGパス文字列
     */
    _createSvgPathFromEquation(formula, curveType, domain) {
        switch (curveType) {
            case 'vertical': // x = a
                const xMatch = formula.match(/x\s*=\s*([-+]?\d*\.?\d+)/);
                if (xMatch) {
                    const xValue = parseFloat(xMatch[1]);
                    return `M ${xValue},${domain.yMin} L ${xValue},${domain.yMax}`;
                }

            case 'constant': // y = b
                const yMatch = formula.match(/y\s*=\s*([-+]?\d*\.?\d+)/);
                if (yMatch) {
                    const yValue = parseFloat(yMatch[1]);
                    return `M ${domain.xMin},${yValue} L ${domain.xMax},${yValue}`;
                }

            case 'linear': // y = a(x - p) + q
                const linearMatch = formula.match(/y\s*=\s*([-+]?\d*\.?\d*)\s*\(\s*x\s*([+-]\s*\d*\.?\d*)\s*\)\s*([+-]\s*\d*\.?\d*)/);
                if (linearMatch) {
                    const a = parseFloat(linearMatch[1]);
                    const p = parseFloat(linearMatch[2].replace(/\s/g, ''));
                    const q = parseFloat(linearMatch[3].replace(/\s/g, ''));
                    const b = a * p + q;

                    return `M ${domain.xMin},${a * domain.xMin + b} L ${domain.xMax},${a * domain.xMax + b}`;
                }
            // const linearMatch = formula.match(/y\s*=\s*([-+]?\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)/);
            // if (linearMatch) {
            //   const a = parseFloat(linearMatch[1]);
            //   const b = parseFloat(linearMatch[2].replace(/\s/g, ''));
            //   return `M ${domain.xMin},${a * domain.xMin + b} L ${domain.xMax},${a * domain.xMax + b}`;
            // }

            case 'quadratic': // y = a(x - p)^2 + q
                const quadraticMatch = formula.match(/y\s*=\s*([-+]?\d*\.?\d*)\s*\(\s*x\s*([+-]\s*\d*\.?\d*)\s*\)\^2\s*([+-]\s*\d*\.?\d*)/);
                if (quadraticMatch) {
                    const a = parseFloat(quadraticMatch[1]);
                    const p = parseFloat(quadraticMatch[2].replace(/\s/g, ''));
                    const q = parseFloat(quadraticMatch[3].replace(/\s/g, ''));

                    const b = 2 * a * p;
                    const c = a * p * p + q;

                    const x1 = domain.xMin;
                    const xm = (domain.xMin + domain.xMax) / 2;
                    const x2 = domain.xMax;
                    const y1 = a * x1 * x1 + b * x1 + c;
                    const ym = a * x1 * x2 + b * xm + c;
                    const y2 = a * x2 * x2 + b * x2 + c;
                    return `M ${x1},${y1} Q ${xm},${ym} ${x2},${y2}`;
                }
            // 追加: y = ax^2 + bx + c の場合
            // const quadraticMatch = formula.match(/y\s*=\s*([-+]?\d*\.?\d*)\s*x\^2\s*([+-]\s*\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)/);
            // if (quadraticMatch) {
            //   const a = parseFloat(quadraticMatch[1]);
            //   const b = parseFloat(quadraticMatch[2].replace(/\s/g, ''));
            //   const c = parseFloat(quadraticMatch[3].replace(/\s/g, ''));

            //   const x1 = domain.xMin;
            //   const xm = (domain.xMin + domain.xMax) / 2;
            //   const x2 = domain.xMax;
            //   const y1 = a * x1 * x1 + b * x1 + c;
            //   const ym = a * x1 * x2 + b * xm + c;
            //   const y2 = a * x2 * x2 + b * x2 + c;
            //   return `M ${x1},${y1} Q ${xm},${ym} ${x2},${y2}`;
            // }

            default:
                console.warn('Unsupported curve type:', curveType);
                return null;
        }
        return null;
    }

    /**
     * 現在選択中の数式情報を取得
     * @returns {Object|null} 選択中の数式情報
     */
    getSelectedEquation() {
        if (this.selectedCurveId !== null && this.selectedSectionIndex !== null) {
            return {
                curveId: this.selectedCurveId,
                sectionIndex: this.selectedSectionIndex,
                equation: this.selectedEquation
            };
        }
        return null;
    }

    /**
     * 選択をクリア
     */
    clearSelection() {
        this.unhighlightEquation();
        this.selectedCurveId = null;
        this.selectedSectionIndex = null;
        this.selectedEquation = null;
    }

    /**
     * 節点の表示/非表示を切り替える
     * @param {string} curveId - 曲線のID
     */
    toggleKnotPoints(curveId) {
        if (!this.graphCalculator) return;

        const curve = this.graphCalculator.getCurve(curveId);
        if (!curve || !curve.points) return;

        // points配列内の各点の表示/非表示を切り替え
        curve.points.forEach(point => {
            if (point && point.group) {
                const currentDisplay = point.group.style.display;
                point.group.style.display = currentDisplay === 'none' ? '' : 'none';
            }
        });
    }
}
