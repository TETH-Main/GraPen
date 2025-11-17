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
		this.functionHighlightIds = [];
		this.selectedEquation = null;
		this.selectedCurveId = null;
		this.selectedSectionIndex = null;
	}

	/**
	 * 数式ハイライト表示
	 * @param {Object} curve - ハイライトする曲線
	 */
	highlightEquation(curve, sectionIndex, equation) {
		this.unhighlightEquation();

		if (!curve || curve.isHidden || !equation) return;

		try {
			const viewport = this.graphCalculator?.getDomain?.();
			if (!viewport) return;

			const highlightSpec = this._createHighlightPaths(equation, viewport);
			if (!highlightSpec || (!highlightSpec.basePath && !highlightSpec.restrictedPath)) {
				return;
			}

			const prefix = `highlight-func-${curve.id}-${sectionIndex}`;
			const highlightIds = [];
			const baseWidth = Math.max(1.5, (curve.size ?? 6) * 0.5);
			const restrictedWidth = Math.max(1.5, baseWidth + 2);

			if (highlightSpec.basePath) {
				const baseId = `${prefix}-base`;
				this.graphCalculator.addCurve(highlightSpec.basePath, {
					id: baseId,
					color: "#ff9f9f",
					width: baseWidth,
					opacity: 0.5,
					style: {
						filter: 'drop-shadow(0 0 1px white)'
					}
				});
				highlightIds.push(baseId);
			}

			if (highlightSpec.restrictedPath) {
				const restrictedId = `${prefix}-restricted`;
				this.graphCalculator.addCurve(highlightSpec.restrictedPath, {
					id: restrictedId,
					color: "#ff0000",
					width: restrictedWidth,
					opacity: 0.85,
					style: {
						filter: 'drop-shadow(0 0 2px white) drop-shadow(0 0 1px white)'
					}
				});
				highlightIds.push(restrictedId);
			}

			this.functionHighlightIds = highlightIds;
			this.selectedCurveId = curve.id;
			this.selectedSectionIndex = sectionIndex;
			this.selectedEquation = equation;

			d3.selectAll(`.equation-content[data-section-index="${sectionIndex}"][data-curve-id="${curve.id}"]`)
				.classed('highlight-active', true);

			return true;
		} catch (error) {
			console.error('Error highlighting equation:', error);
			return false;
		}
	}

	/**
	 * 数式ハイライトの解除
	 */
	unhighlightEquation() {
		if (this.graphCalculator && this.functionHighlightIds.length) {
			for (const id of this.functionHighlightIds) {
				this.graphCalculator.removeCurve(id);
			}
			this.functionHighlightIds = [];
		}

		d3.selectAll('.equation-content.highlight-active')
			.classed('highlight-active', false);
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

		curve.points.forEach(point => {
			if (point && point.group) {
				const currentDisplay = point.group.style.display;
				point.group.style.display = currentDisplay === 'none' ? '' : 'none';
			}
		});
	}

	_createHighlightPaths(equation, viewport) {
		if (!equation || !viewport) {
			return null;
		}

		const type = equation.type;
		switch (type) {
			case 'vertical':
				return this._buildVerticalPaths(equation, viewport);
			case 'constant':
				return this._buildHorizontalPaths(equation, viewport);
			case 'linear':
				return this._buildLinearPaths(equation, viewport);
			case 'quadratic':
				return this._buildQuadraticPaths(equation, viewport);
			case 'arc':
				return this._buildArcPaths(equation);
			case 'ellipse':
				return this._buildEllipsePaths(equation);
			case 'circle':
				return this._buildCirclePath(equation);
			case 'quadraticBezier':
			case 'cubicBezier':
				return this._buildBezierPaths(equation);
			default:
				console.warn('Unsupported curve type for highlighting:', type);
				return null;
		}
	}

	_buildVerticalPaths(equation, viewport) {
		const x = Number(equation?.params?.x);
		if (!Number.isFinite(x)) return null;

		const baseRange = [viewport.yMin, viewport.yMax];
		const basePoints = [
			[x, baseRange[0]],
			[x, baseRange[1]]
		];

		const domainRange = this._getNumericRange(equation.domain);
		let basePath = this._buildPath(basePoints);
		let restrictedPath = null;

		if (domainRange) {
			const clamped = this._clampRange(domainRange, baseRange);
			if (clamped) {
				const points = [
					[x, clamped.start],
					[x, clamped.end]
				];
				restrictedPath = this._buildPath(points);
			}
		}

		if (!restrictedPath) {
			restrictedPath = basePath;
			basePath = null;
		}

		return { basePath, restrictedPath };
	}

	_buildHorizontalPaths(equation, viewport) {
		const y = Number(equation?.params?.y);
		if (!Number.isFinite(y)) return null;

		const baseRange = [viewport.xMin, viewport.xMax];
		const basePoints = [
			[baseRange[0], y],
			[baseRange[1], y]
		];

		const domainRange = this._getNumericRange(equation.domain);
		let basePath = this._buildPath(basePoints);
		let restrictedPath = null;

		if (domainRange) {
			const clamped = this._clampRange(domainRange, baseRange);
			if (clamped) {
				const points = [
					[clamped.start, y],
					[clamped.end, y]
				];
				restrictedPath = this._buildPath(points);
			}
		}

		if (!restrictedPath) {
			restrictedPath = basePath;
			basePath = null;
		}

		return { basePath, restrictedPath };
	}

	_buildLinearPaths(equation, viewport) {
		const slope = Number(equation?.params?.slope);
		const anchor = Array.isArray(equation?.params?.point) ? equation.params.point : [0, 0];
		if (!Number.isFinite(slope) || anchor.length < 2) return null;

		const evaluate = (x) => slope * (x - anchor[0]) + anchor[1];
		const baseRange = [viewport.xMin, viewport.xMax];
		const basePoints = this._sampleFunction(evaluate, baseRange, 2);

		const domainRange = this._getNumericRange(equation.domain);
		let restrictedPath = null;
		if (domainRange) {
			const clamped = this._clampRange(domainRange, baseRange);
			if (clamped) {
				const points = this._sampleFunction(evaluate, [clamped.start, clamped.end], 2);
				restrictedPath = this._buildPath(points);
			}
		}

		const basePath = this._buildPath(basePoints);

		if (!restrictedPath || this._rangesApproximatelyEqual(domainRange, { start: baseRange[0], end: baseRange[1] })) {
			return { basePath: null, restrictedPath: basePath };
		}

		return { basePath, restrictedPath };
	}

	_buildQuadraticPaths(equation, viewport) {
		const params = equation?.params;
		if (!params) return null;
		const a = Number(params.a);
		const vertex = Array.isArray(params.vertex) ? params.vertex : [0, 0];
		if (!Number.isFinite(a) || vertex.length < 2) return null;

		const evaluate = (x) => {
			const dx = x - vertex[0];
			return a * dx * dx + vertex[1];
		};

		const baseRange = [viewport.xMin, viewport.xMax];
		const basePoints = this._sampleFunction(evaluate, baseRange, 48);
		const basePath = this._buildPath(basePoints);

		const domainRange = this._getNumericRange(equation.domain);
		if (!domainRange) {
			return { basePath: null, restrictedPath: basePath };
		}

		const clamped = this._clampRange(domainRange, baseRange);
		if (!clamped) {
			return { basePath: null, restrictedPath: basePath };
		}

		const restrictedPoints = this._sampleFunction(evaluate, [clamped.start, clamped.end], 48);
		const restrictedPath = this._buildPath(restrictedPoints);

		if (this._rangesApproximatelyEqual(clamped, { start: baseRange[0], end: baseRange[1] })) {
			return { basePath: null, restrictedPath };
		}

		return { basePath, restrictedPath };
	}

	_buildArcPaths(equation) {
		const params = equation?.params;
		if (!params) return null;
		const center = Array.isArray(params.center) ? params.center : [0, 0];
		const radius = Number(params.radius);
		if (!Number.isFinite(radius) || radius <= 0) return null;

		const fullRange = { start: 0, end: Math.PI * 2 };
		const direction = Math.sign(Number(params.direction)) || 1;

		const angleRange = this._extractAngleRange(equation, params);
		const normalized = angleRange
			? this._normalizeAngleRange(angleRange.start, angleRange.end, direction)
			: { start: fullRange.start, delta: fullRange.end - fullRange.start };

		const isFullCircle = Math.abs(Math.abs(normalized.delta) - (Math.PI * 2)) <= 1e-6;
		const restrictedPoints = this._sampleCircle(
			center,
			radius,
			normalized.start,
			normalized.start + normalized.delta,
			96,
			direction
		);
		const restrictedPath = this._buildPath(restrictedPoints);

		let basePath = null;
		if (!isFullCircle) {
			const basePoints = this._sampleCircle(center, radius, fullRange.start, fullRange.end, 128, 1);
			basePath = this._buildPath(basePoints);
		}

		return { basePath, restrictedPath };
	}

	_extractAngleRange(equation, params) {
		const prefer = (value) => {
			const numeric = this._parseNumeric(value);
			return Number.isFinite(numeric) ? numeric : null;
		};

		const paramStart = prefer(params.startAngle);
		const paramEnd = prefer(params.endAngle);
		if (paramStart !== null && paramEnd !== null) {
			return { start: paramStart, end: paramEnd };
		}

		const domainStart = prefer(equation?.domain?.start);
		const domainEnd = prefer(equation?.domain?.end);
		if (domainStart !== null && domainEnd !== null) {
			return { start: domainStart, end: domainEnd };
		}

		const rangeStart = prefer(equation?.parameterRange?.start);
		const rangeEnd = prefer(equation?.parameterRange?.end);
		if (rangeStart !== null && rangeEnd !== null) {
			return { start: rangeStart, end: rangeEnd };
		}

		return null;
	}

	_buildEllipsePaths(equation) {
		const params = equation?.params;
		if (!params) return null;
		const center = Array.isArray(params.center) ? params.center : [0, 0];
		const radiusX = Number(params.radiusX);
		const radiusY = Number(params.radiusY);
		const rotation = Number(params.rotation ?? 0);
		if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX <= 0 || radiusY <= 0) {
			return null;
		}

		const fullRange = { start: 0, end: Math.PI * 2 };
		const domainRange = this._getNumericRange(equation.domain);

		const basePoints = this._sampleEllipse(center, radiusX, radiusY, rotation, fullRange.start, fullRange.end, 160);
		const basePath = domainRange ? this._buildPath(basePoints) : null;

		const effectiveRange = domainRange || fullRange;
		const restrictedPoints = this._sampleEllipse(center, radiusX, radiusY, rotation, effectiveRange.start, effectiveRange.end, 120);
		const restrictedPath = this._buildPath(restrictedPoints);

		if (!domainRange || this._rangesApproximatelyEqual(domainRange, fullRange, 1e-6)) {
			return { basePath: null, restrictedPath };
		}

		return { basePath, restrictedPath };
	}

	_buildCirclePath(equation) {
		const params = equation?.params;
		if (!params) return null;
		const center = Array.isArray(params.center) ? params.center : [0, 0];
		const radius = Number(params.radius);
		if (!Number.isFinite(radius) || radius <= 0) return null;

		const fullRange = { start: 0, end: Math.PI * 2 };
		const domainRange = this._getNumericRange(equation.domain) || fullRange;

		const points = this._sampleCircle(center, radius, domainRange.start, domainRange.end, 128, 1);
		const restrictedPath = this._buildPath(points);
		return { basePath: null, restrictedPath };
	}

	_buildBezierPaths(equation) {
		const params = equation?.params;
		if (!params?.controlPoints) return null;
		const controlPoints = params.controlPoints;

		const range = this._getNumericRange(equation.parameterRange) || { start: 0, end: 1 };
		const samples = 80;
		const points = [];

		for (let i = 0; i <= samples; i++) {
			const t = range.start + (i / samples) * (range.end - range.start);
			const point = equation.type === 'quadraticBezier'
				? this._evaluateQuadraticBezier(controlPoints, t)
				: this._evaluateCubicBezier(controlPoints, t);
			if (point) {
				points.push(point);
			}
		}

		if (points.length < 2) return null;

		const restrictedPath = this._buildPath(points);
		return { basePath: null, restrictedPath };
	}

	_sampleFunction(fn, range, segments) {
		const [start, end] = range;
		const stepCount = Math.max(segments, 2);
		const pts = [];
		for (let i = 0; i <= stepCount; i++) {
			const x = start + ((end - start) * i) / stepCount;
			const y = fn(x);
			if (Number.isFinite(x) && Number.isFinite(y)) {
				pts.push([x, y]);
			}
		}
		return pts;
	}

	_sampleCircle(center, radius, startAngle, endAngle, segments, direction = 1) {
		const normalized = this._normalizeAngleRange(startAngle, endAngle, direction);
		const pts = [];
		const steps = Math.max(segments, 16);
		for (let i = 0; i <= steps; i++) {
			const ratio = i / steps;
			const theta = normalized.start + normalized.delta * ratio;
			const x = center[0] + radius * Math.cos(theta);
			const y = center[1] + radius * Math.sin(theta);
			if (Number.isFinite(x) && Number.isFinite(y)) {
				pts.push([x, y]);
			}
		}
		return pts;
	}

	_sampleEllipse(center, radiusX, radiusY, rotation, startAngle, endAngle, segments) {
		const normalized = this._normalizeAngleRange(startAngle, endAngle, 1);
		const cosRot = Math.cos(rotation);
		const sinRot = Math.sin(rotation);
		const pts = [];
		const steps = Math.max(segments, 32);
		for (let i = 0; i <= steps; i++) {
			const ratio = i / steps;
			const t = normalized.start + normalized.delta * ratio;
			const cosT = Math.cos(t);
			const sinT = Math.sin(t);
			const x = center[0] + radiusX * cosT * cosRot - radiusY * sinT * sinRot;
			const y = center[1] + radiusX * cosT * sinRot + radiusY * sinT * cosRot;
			if (Number.isFinite(x) && Number.isFinite(y)) {
				pts.push([x, y]);
			}
		}
		return pts;
	}

	_evaluateQuadraticBezier(points, t) {
		const [p0, p1, p2] = points;
		if (!p0 || !p1 || !p2) return null;
		const u = 1 - t;
		const uu = u * u;
		const tt = t * t;
		const x = uu * p0[0] + 2 * u * t * p1[0] + tt * p2[0];
		const y = uu * p0[1] + 2 * u * t * p1[1] + tt * p2[1];
		return [x, y];
	}

	_evaluateCubicBezier(points, t) {
		const [p0, p1, p2, p3] = points;
		if (!p0 || !p1 || !p2 || !p3) return null;
		const u = 1 - t;
		const uu = u * u;
		const uuu = uu * u;
		const tt = t * t;
		const ttt = tt * t;
		const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
		const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
		return [x, y];
	}

	_buildPath(points) {
		if (!points || points.length < 2) return null;
		const segments = points.map(([x, y]) => `${x},${y}`);
		return `M ${segments[0]} L ${segments.slice(1).join(' L ')}`;
	}

	_parseNumeric(value) {
		if (value == null) return null;
		if (typeof value === 'number') {
			return Number.isFinite(value) ? value : null;
		}
		if (typeof value !== 'string') return null;

		let text = value.trim();
		if (!text) return null;

		text = text
			.replace(/\\pi/g, 'Math.PI')
			.replace(/π/g, 'Math.PI')
			.replace(/(?<=\d)\s*(?=Math\.PI)/g, '*')
			.replace(/Math\.PI(?=\d)/g, 'Math.PI*');

		try {
			const result = Function('"use strict"; return (' + text + ');')();
			return Number.isFinite(result) ? result : null;
		} catch (err) {
			const fallback = Number(text);
			return Number.isFinite(fallback) ? fallback : null;
		}
	}

	_getNumericRange(rangeLike) {
		if (!rangeLike || rangeLike.start == null || rangeLike.end == null) {
			return null;
		}
		const start = this._parseNumeric(rangeLike.start);
		const end = this._parseNumeric(rangeLike.end);
		if (!Number.isFinite(start) || !Number.isFinite(end)) {
			return null;
		}
		return start <= end ? { start, end } : { start: end, end: start };
	}

	_clampRange(range, bounds) {
		if (!range || !bounds || bounds.length < 2) return null;
		const min = Math.min(bounds[0], bounds[1]);
		const max = Math.max(bounds[0], bounds[1]);
		const start = Math.max(range.start, min);
		const end = Math.min(range.end, max);
		if (start > end) return null;
		return { start, end };
	}

	_normalizeAngleRange(start, end, direction = 1) {
		const full = Math.PI * 2;
		let s = this._parseNumeric(start);
		let e = this._parseNumeric(end);
		if (!Number.isFinite(s) || !Number.isFinite(e)) {
			s = 0;
			e = full;
		}

		if (direction >= 0) {
			while (e < s) {
				e += full;
			}
			return { start: s, delta: e - s };
		}

		while (e > s) {
			e -= full;
		}
		return { start: s, delta: e - s };
	}

	_rangesApproximatelyEqual(rangeA, rangeB, tolerance = 1e-9) {
		if (!rangeA || !rangeB) return false;
		return Math.abs(rangeA.start - rangeB.start) <= tolerance && Math.abs(rangeA.end - rangeB.end) <= tolerance;
	}
}

