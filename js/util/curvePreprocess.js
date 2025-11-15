const EPSILON = 1e-9;

// デフォルトの平滑化ウィンドウ幅（移動平均の窓幅）
const DEFAULT_SMOOTH_WINDOW = 5;

/**
 * 軸に平行なバウンディングボックス（AABB）を計算する。
 * @param {Array<[number, number]>} points
 * @returns {{ xMin: number, xMax: number, yMin: number, yMax: number, width: number, height: number }}
 */
export function computeBoundingBox(points = []) {
	if (!Array.isArray(points) || points.length === 0) {
		return { xMin: 0, xMax: 0, yMin: 0, yMax: 0, width: 0, height: 0 };
	}

	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;

	for (let i = 0; i < points.length; i += 1) {
		const [x, y] = points[i];
		if (x < xMin) xMin = x;
		if (x > xMax) xMax = x;
		if (y < yMin) yMin = y;
		if (y > yMax) yMax = y;
	}

	return {
		xMin,
		xMax,
		yMin,
		yMax,
		width: xMax - xMin,
		height: yMax - yMin
	};
}

/**
 * 与えられたドメイン（または計算したドメイン）を用いて、点列を単位正方形に正規化する。
 * @param {Array<[number, number]>} points
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} [domain]
 * @returns {{ points: Array<[number, number]>, domain: { xMin: number, xMax: number, yMin: number, yMax: number } }}
 */
export function normalizePoints(points = [], domain) {
	const bbox = domain ?? computeBoundingBox(points);
	const width = Math.abs(bbox.xMax - bbox.xMin) < EPSILON ? 1 : bbox.xMax - bbox.xMin;
	const height = Math.abs(bbox.yMax - bbox.yMin) < EPSILON ? 1 : bbox.yMax - bbox.yMin;

	const normalized = points.map(([x, y]) => [
		(x - bbox.xMin) / width,
		(y - bbox.yMin) / height
	]);

	const enrichedDomain = {
		...bbox,
		width: bbox.width ?? (bbox.xMax - bbox.xMin),
		height: bbox.height ?? (bbox.yMax - bbox.yMin)
	};

	return { points: normalized, domain: enrichedDomain };
}

/**
 * 正規化された点列を元のドメインに戻す。
 * @param {Array<[number, number]>} normalizedPoints
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} domain
 * @returns {Array<[number, number]>}
 */
export function denormalizePoints(normalizedPoints = [], domain) {
	const width = (domain && typeof domain.width === "number") ? domain.width : (domain.xMax - domain.xMin);
	const height = (domain && typeof domain.height === "number") ? domain.height : (domain.yMax - domain.yMin);
	const scaleX = Math.abs(width) < EPSILON ? 0 : width;
	const scaleY = Math.abs(height) < EPSILON ? 0 : height;

	return normalizedPoints.map(([tx, ty]) => [
		domain.xMin + tx * scaleX,
		domain.yMin + ty * scaleY
	]);
}

/**
 * 単純移動平均による平滑化を行う。
 * @param {Array<[number, number]>} points
 * @param {number} windowSize 奇数のウィンドウサイズ
 * @returns {Array<[number, number]>}
 */
export function smoothPoints(points = [], windowSize = DEFAULT_SMOOTH_WINDOW) {
	if (!Array.isArray(points) || points.length === 0) {
		return [];
	}
	const size = Math.max(1, windowSize | 0);
	if (size <= 1 || size >= points.length) {
		return points.slice();
	}

	const half = Math.floor(size / 2);
	const result = [];
	for (let i = 0; i < points.length; i += 1) {
		let sumX = 0;
		let sumY = 0;
		let count = 0;
		for (let j = i - half; j <= i + half; j += 1) {
			const idx = Math.min(points.length - 1, Math.max(0, j));
			sumX += points[idx][0];
			sumY += points[idx][1];
			count += 1;
		}
		result.push([sumX / count, sumY / count]);
	}
	return result;
}

/**
 * 弧長に基づくリサンプリング（線形補間を使用）。
 * @param {Array<[number, number]>} points
 * @param {number} targetCount
 * @param {{ closed?: boolean }} [options]
 * @returns {Array<[number, number]>}
 */
export function resamplePoints(points = [], targetCount = 128, options = {}) {
	if (!Array.isArray(points) || points.length === 0) {
		return [];
	}
	const count = Math.max(2, targetCount | 0);
	if (points.length <= count) {
		return points.slice();
	}

	const closed = Boolean(options.closed);
	const work = closed ? points.concat([points[0]]) : points.slice();

	const distances = [0];
	for (let i = 1; i < work.length; i += 1) {
		const prev = work[i - 1];
		const curr = work[i];
		const dx = curr[0] - prev[0];
		const dy = curr[1] - prev[1];
		const dist = Math.hypot(dx, dy);
		distances.push(distances[i - 1] + dist);
	}

	const totalLength = distances[distances.length - 1];
	if (totalLength < EPSILON) {
		return new Array(count).fill(null).map(() => work[0].slice());
	}

	const step = totalLength / (count - 1);
	const resampled = [];
	let segment = 1;

	for (let i = 0; i < count; i += 1) {
		const targetDist = step * i;
		while (segment < distances.length && distances[segment] < targetDist) {
			segment += 1;
		}

		if (segment >= work.length) {
			resampled.push(work[work.length - 1].slice());
			continue;
		}

		const prevDist = distances[segment - 1];
		const nextDist = distances[segment];
		const ratio = (targetDist - prevDist) / Math.max(EPSILON, nextDist - prevDist);

		const p0 = work[segment - 1];
		const p1 = work[segment];
		resampled.push([
			p0[0] + (p1[0] - p0[0]) * ratio,
			p0[1] + (p1[1] - p0[1]) * ratio
		]);
	}

	if (closed) {
		resampled[resampled.length - 1] = resampled[0].slice();
	}

	return resampled;
}

/**
 * 許容誤差内で冗長な共線（同一直線上）の中間サンプルを除去する。
 * @param {Array<[number, number]>} points
 * @param {number} tolerance 二乗距離の許容誤差
 * @returns {Array<[number, number]>}
 */
export function pruneCollinear(points = [], tolerance = 1e-6) {
	if (!Array.isArray(points) || points.length <= 2) {
		return points.slice();
	}

	const tol = Math.max(tolerance, 0);
	const result = [points[0]];

	for (let i = 1; i < points.length - 1; i += 1) {
		const prev = result[result.length - 1];
		const curr = points[i];
		const next = points[i + 1];

		const vx1 = curr[0] - prev[0];
		const vy1 = curr[1] - prev[1];
		const vx2 = next[0] - curr[0];
		const vy2 = next[1] - curr[1];
		const cross = vx1 * vy2 - vy1 * vx2;

		if (Math.abs(cross) * Math.abs(cross) >= tol) {
			result.push(curr);
		}
	}

	result.push(points[points.length - 1]);
	return result;
}

/**
 * よく使われる前処理ステップをまとめたラッパー関数。
 * オプションで平滑化、リサンプリング、共線削除などを順に実行する。
 * @param {Array<[number, number]>} points
 * @param {{ smoothWindow?: number, resampleCount?: number, pruneTolerance?: number, closed?: boolean }} [options]
 * @returns {{ points: Array<[number, number]>, normalized: Array<[number, number]>, domain: { xMin: number, xMax: number, yMin: number, yMax: number } }}
 */
export function preprocessCurve(points = [], options = {}) {
	const smoothWindow = options.smoothWindow ?? DEFAULT_SMOOTH_WINDOW;
	const resampleCount = options.resampleCount ?? null;
	const pruneTolerance = options.pruneTolerance ?? 0;
	const closed = Boolean(options.closed);
	const domainOverride = options.domain;

	let work = points.slice();
	if (smoothWindow > 1) {
		work = smoothPoints(work, smoothWindow);
	}
	if (resampleCount && resampleCount > 1) {
		work = resamplePoints(work, resampleCount, { closed });
	}
	if (pruneTolerance > 0) {
		work = pruneCollinear(work, pruneTolerance);
	}

	const { points: normalized, domain } = normalizePoints(work, domainOverride);
	return { points: work, normalized, domain };
}

export default {
	computeBoundingBox,
	normalizePoints,
	denormalizePoints,
	smoothPoints,
	resamplePoints,
	pruneCollinear,
	preprocessCurve
};
