import { preprocessCurve, denormalizePoints } from "../../util/curvePreprocess.js";
import { EquationBuilder } from "../../util/EquationBuilder.js";

const DEFAULT_OPTIONS = {
    quantization: "auto",
    allowSelfIntersection: false,
    smoothWindow: 5,
    resampleCount: 96,
    pruneTolerance: 0,
    closed: false,
    extremaProminenceRatio: 0.04,
    extremaPersistence: 3,
    curvatureThreshold: 0.21,
    curvaturePersistence: 2,
    monotonicToleranceRatio: 0.05,
    errorToleranceRatio: 0.075,
    allowedExtrema: 2,
    allowedCurvatureFlips: 1,
    minStrokeLength: 0.5,
    minDiagonal: 0.25,
    closureRatio: 0.04
};

const EPSILON = 1e-9;

function evaluateQuadratic(p0, p1, p2, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const factor = 2 * mt * t;
    return [
        mt2 * p0[0] + factor * p1[0] + t2 * p2[0],
        mt2 * p0[1] + factor * p1[1] + t2 * p2[1]
    ];
}

function computeRmsMetrics(points, p0, p1, p2, diagLength) {
    if (!points.length) {
        return {
            rms: 0,
            maxError: 0,
            normalizedRms: 0,
            normalizedMax: 0
        };
    }

    let sum = 0;
    let maxError = 0;
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
        const t = n === 1 ? 0 : i / (n - 1);
        const [x, y] = evaluateQuadratic(p0, p1, p2, t);
        const dx = points[i][0] - x;
        const dy = points[i][1] - y;
        sum += dx * dx + dy * dy;
        const err = Math.hypot(dx, dy);
        if (err > maxError) {
            maxError = err;
        }
    }

    const rms = Math.sqrt(sum / n);
    const safeDiag = diagLength > EPSILON ? diagLength : 1;
    return {
        rms,
        maxError,
        normalizedRms: rms / safeDiag,
        normalizedMax: maxError / safeDiag
    };
}

function computeStrokeStats(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return null;
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let length = 0;

    for (let i = 0; i < points.length; i += 1) {
        const [x, y] = points[i];
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;

        if (i > 0) {
            const prev = points[i - 1];
            length += Math.hypot(x - prev[0], y - prev[1]);
        }
    }

    const width = xMax - xMin;
    const height = yMax - yMin;
    const diag = Math.hypot(width, height);
    const start = points[0];
    const end = points[points.length - 1];
    const base = [end[0] - start[0], end[1] - start[1]];
    const baseLength = Math.hypot(base[0], base[1]);
    const startEndDistance = Math.hypot(end[0] - start[0], end[1] - start[1]);

    return {
        width,
        height,
        diag,
        length,
        start,
        end,
        base,
        baseLength,
        startEndDistance
    };
}

function countSignificantExtrema(points, diagLength, options) {
    if (!Array.isArray(points) || points.length < 3) {
        return 0;
    }

    const diag = Math.max(diagLength, EPSILON);
    const threshold = Math.max(options.extremaProminenceRatio * diag * 0.2, 1e-4);
    const persistence = options.extremaPersistence;
    let total = 0;

    for (let axis = 0; axis < 2; axis += 1) {
        const values = points.map((p) => p[axis]);
        let lastAccepted = -Infinity;
        for (let i = 1; i < values.length - 1; i += 1) {
            const prev = values[i] - values[i - 1];
            const next = values[i + 1] - values[i];
            const isMax = prev > threshold && next < -threshold;
            const isMin = prev < -threshold && next > threshold;
            if (!isMax && !isMin) continue;
            if (i - lastAccepted < persistence) continue;
            const leftProm = Math.abs(values[i] - values[i - 1]);
            const rightProm = Math.abs(values[i] - values[i + 1]);
            const prominence = Math.min(leftProm, rightProm);
            if (prominence < options.extremaProminenceRatio * diag) continue;
            total += 1;
            lastAccepted = i;
        }
    }

    return total;
}

function countCurvatureFlips(points, options) {
    if (!Array.isArray(points) || points.length < 4) {
        return 0;
    }

    let flips = 0;
    let lastSign = 0;
    let lastIndex = -Infinity;

    for (let i = 0; i < points.length - 2; i += 1) {
        const v1x = points[i + 1][0] - points[i][0];
        const v1y = points[i + 1][1] - points[i][1];
        const v2x = points[i + 2][0] - points[i + 1][0];
        const v2y = points[i + 2][1] - points[i + 1][1];
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 < EPSILON || len2 < EPSILON) continue;
        const cross = (v1x * v2y - v1y * v2x) / (len1 * len2);
        if (!Number.isFinite(cross)) continue;
        if (Math.abs(cross) < options.curvatureThreshold) continue;
        const sign = cross > 0 ? 1 : -1;
        if (lastSign !== 0 && sign !== lastSign && (i - lastIndex) >= options.curvaturePersistence) {
            flips += 1;
            lastIndex = i;
        }
        if (sign !== lastSign) {
            lastIndex = i;
        }
        lastSign = sign;
    }

    return flips;
}

function countBacktracks(points, stats, options) {
    if (!stats || stats.baseLength < EPSILON) {
        return { count: 0, maxDelta: 0 };
    }

    const dir = [stats.base[0] / stats.baseLength, stats.base[1] / stats.baseLength];
    const tolerance = options.monotonicToleranceRatio * stats.diag;
    let backtracks = 0;
    let worstDelta = 0;
    let prevProgress = 0;

    for (let i = 0; i < points.length; i += 1) {
        const vectorX = points[i][0] - stats.start[0];
        const vectorY = points[i][1] - stats.start[1];
        const progress = vectorX * dir[0] + vectorY * dir[1];
        if (i > 0) {
            const delta = progress - prevProgress;
            if (delta < -tolerance) {
                backtracks += 1;
                if (delta < worstDelta) {
                    worstDelta = delta;
                }
            }
        }
        prevProgress = progress;
    }

    return { count: backtracks, maxDelta: worstDelta };
}

export function fitQuadraticBezierControlPoints(normalizedPoints) {
    if (!Array.isArray(normalizedPoints) || normalizedPoints.length < 2) {
        return null;
    }

    const p0 = normalizedPoints[0];
    const p2 = normalizedPoints[normalizedPoints.length - 1];
    let denom = 0;
    let accumX = 0;
    let accumY = 0;

    for (let i = 1; i < normalizedPoints.length - 1; i += 1) {
        const t = normalizedPoints.length === 1 ? 0 : i / (normalizedPoints.length - 1);
        if (t <= EPSILON || (1 - t) <= EPSILON) continue;
        const weight = 2 * (1 - t) * t;
        const mt = 1 - t;
        const baseX = mt * mt * p0[0] + t * t * p2[0];
        const baseY = mt * mt * p0[1] + t * t * p2[1];
        accumX += (normalizedPoints[i][0] - baseX) / weight;
        accumY += (normalizedPoints[i][1] - baseY) / weight;
        denom += 1;
    }

    const control = denom > 0
        ? [accumX / denom, accumY / denom]
        : [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];

    return { p0, p1: control, p2 };
}

/**
 * Single quadratic Bézier approximator.
 * Aligns with GraPen's approximator API and provides a least-squares fit.
 */
export class SingleQuadraticBezierApproximator {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    static get approximatorType() {
        return "singleQuadratic";
    }

    getDefaultOptions() {
        return { ...DEFAULT_OPTIONS };
    }

    /**
     * @param {Array<[number, number]>} points cleaned point sequence
     * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} domain viewport info
     * @param {Object} overrides runtime overrides coming from UI
     * @returns {{ success: boolean, type: string, svgPath: string, latexEquations: Array<string>, segments: Array<Object>, knots: Array<number>, domain: any, diagnostics: Object }}
     */
    approximate(points = [], domain = null, overrides = {}) {
        const effectiveOptions = { ...this.options, ...overrides };
        const minPoints = 3;
        if (!Array.isArray(points) || points.length < minPoints) {
            return {
                success: false,
                type: SingleQuadraticBezierApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain,
                diagnostics: {
                    reason: "Insufficient points",
                    required: minPoints,
                    received: points.length
                }
            };
        }

        const preprocess = preprocessCurve(points, {
            smoothWindow: effectiveOptions.smoothWindow,
            resampleCount: effectiveOptions.resampleCount,
            pruneTolerance: effectiveOptions.pruneTolerance,
            closed: effectiveOptions.closed,
            domain
        });

        const reject = (diagnostics) => ({
            success: false,
            type: SingleQuadraticBezierApproximator.approximatorType,
            svgPath: "",
            latexEquations: [],
            segments: [],
            knots: [],
            domain: preprocess.domain,
            diagnostics
        });

        const normalized = preprocess.normalized;
        const stats = computeStrokeStats(preprocess.points);
        if (!stats) {
            return reject({
                reason: "Degenerate stroke",
                pointCount: preprocess.points.length
            });
        }

        if (stats.length < effectiveOptions.minStrokeLength) {
            return reject({
                reason: "Stroke too short",
                length: stats.length,
                required: effectiveOptions.minStrokeLength
            });
        }

        if (stats.diag < effectiveOptions.minDiagonal) {
            return reject({
                reason: "Stroke too small",
                diagonal: stats.diag,
                required: effectiveOptions.minDiagonal
            });
        }

        if (stats.startEndDistance < stats.diag * effectiveOptions.closureRatio) {
            return reject({
                reason: "Stroke appears closed",
                startEndDistance: stats.startEndDistance,
                threshold: stats.diag * effectiveOptions.closureRatio
            });
        }

        const extremaCount = countSignificantExtrema(preprocess.points, stats.diag, effectiveOptions);
        if (extremaCount > effectiveOptions.allowedExtrema) {
            return reject({
                reason: "Too many extrema",
                extremaCount,
                allowed: effectiveOptions.allowedExtrema
            });
        }

        const curvatureFlips = countCurvatureFlips(preprocess.points, effectiveOptions);
        if (curvatureFlips > effectiveOptions.allowedCurvatureFlips) {
            return reject({
                reason: "Curvature flips exceed allowance",
                curvatureFlips,
                allowed: effectiveOptions.allowedCurvatureFlips
            });
        }

        const backtrackInfo = countBacktracks(preprocess.points, stats, effectiveOptions);
        if (backtrackInfo.count > 0) {
            return reject({
                reason: "Significant backtracking detected",
                backtrackCount: backtrackInfo.count,
                maxBacktrackDelta: backtrackInfo.maxDelta
            });
        }

        const fit = fitQuadraticBezierControlPoints(normalized);
        if (!fit) {
            return reject({
                reason: "Unable to determine quadratic control point",
                pointsReceived: normalized.length
            });
        }

        const [p0World, p1World, p2World] = denormalizePoints([
            fit.p0,
            fit.p1,
            fit.p2
        ], preprocess.domain);

        const metrics = computeRmsMetrics(preprocess.points, p0World, p1World, p2World, stats.diag);

        if (metrics.normalizedRms > effectiveOptions.errorToleranceRatio) {
            return reject({
                reason: "Fit error above tolerance",
                normalizedRms: metrics.normalizedRms,
                tolerance: effectiveOptions.errorToleranceRatio
            });
        }

        const svgPath = `M ${p0World[0]} ${p0World[1]} Q ${p1World[0]} ${p1World[1]} ${p2World[0]} ${p2World[1]}`;
        const equation = EquationBuilder.quadraticBezier({
            p0: p0World,
            p1: p1World,
            p2: p2World,
            meta: {
                rms: metrics.rms,
                normalizedRms: metrics.normalizedRms,
                maxError: metrics.maxError
            }
        }, { decimals: 3 });
        const latexEquations = [equation];
        const knotTuples = [
            p0World.slice(),
            p1World.slice(),
            p2World.slice()
        ];

        const exportData = {
            type: SingleQuadraticBezierApproximator.approximatorType,
            controlPoints: knotTuples,
            svgPath,
            knots: knotTuples,
            originalPoints: Array.isArray(preprocess.points) ? preprocess.points : null,
            domain: preprocess.domain
        };

        return {
            success: true,
            type: SingleQuadraticBezierApproximator.approximatorType,
            svgPath,
            latexEquations,
            segments: [
                {
                    type: "quadratic",
                    controlPoints: [p0World, p1World, p2World],
                    equation
                }
            ],
            knots: knotTuples,
            domain: preprocess.domain,
            exportData,
            diagnostics: {
                rmsError: metrics.rms,
                maxError: metrics.maxError,
                normalizedRms: metrics.normalizedRms,
                normalizedMax: metrics.normalizedMax,
                pointCount: preprocess.points.length,
                strokeLength: stats.length,
                diagonal: stats.diag,
                startEndDistance: stats.startEndDistance,
                extremaCount,
                curvatureFlips,
                backtrackCount: backtrackInfo.count,
                options: effectiveOptions
            }
        };
    }
}
